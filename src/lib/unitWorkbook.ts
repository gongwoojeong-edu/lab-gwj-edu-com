// ============================================================
// unitWorkbook — 한 학생의 "유닛 단위" 인쇄 빌더
//
// 4가지 워크북 종류 (교사가 인쇄 시 직접 선택):
//   1. syntax_unit    — 구문 · 유닛 통합  (유닛 전체 문장의 영어 + 학생 한글해석)
//   2. syntax_passage — 구문 · 문장별     (지문별 구문 HO 묶음)
//   3. word_unit      — 단어 · 유닛 통합  (유닛 전체 단어를 하나로 묶은 시험지)
//   4. word_passage   — 단어 · 문장별     (지문별 단어 시험지 묶음)
//
// 단어와 구문은 절대 같은 PDF에 섞지 않는다 — 두 종류 다 필요하면 교사가 두 번 인쇄.
//
// 완료 기준 (포함 여부):
//   sentence_progress 의 word_test_done && translation_done && analysis_done == true
// ============================================================
import { supabase } from "@/integrations/supabase/client";
import {
  preloadAnalysisPayload,
  preloadHandoutPayload,
  preloadWordPayload,
  PrintPreloadError,
} from "./printPreload";
import {
  buildHandoutPrintHtml,
  buildWordPrintHtml,
  buildWordUnitCompactPrintHtml,
  buildUnitCombinedWorkbookHtml,
  type UnitCombinedItem,
  type WordPayload,
} from "./printTemplates";
import { fetchPassagesByUnit } from "./textbooks";

const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export interface UnitWorkbookSummary {
  totalPassages: number;
  completedCodes: string[];
  pendingCodes: string[];
}

/** 유닛 내 모든 지문 + 학생 진행상황 요약 */
export const summarizeUnitProgress = async (
  unitId: string,
  studentId: string,
): Promise<UnitWorkbookSummary> => {
  const passages = await fetchPassagesByUnit(unitId);
  const codes = passages.map((p) => p.code);
  if (codes.length === 0) {
    return { totalPassages: 0, completedCodes: [], pendingCodes: [] };
  }
  const { data } = await supabase
    .from("sentence_progress")
    .select("sentence_id, word_test_done, translation_done, analysis_done")
    .eq("user_id", studentId)
    .in("sentence_id", codes);
  const map = new Map<string, { w: boolean; t: boolean; a: boolean }>();
  (data ?? []).forEach((row) => {
    map.set(row.sentence_id as string, {
      w: !!row.word_test_done,
      t: !!row.translation_done,
      a: !!row.analysis_done,
    });
  });
  const completed: string[] = [];
  const pending: string[] = [];
  codes.forEach((c) => {
    const r = map.get(c);
    if (r && r.w && r.t && r.a) completed.push(c);
    else pending.push(c);
  });
  return {
    totalPassages: codes.length,
    completedCodes: completed,
    pendingCodes: pending,
  };
};

// ============================================================
// 새 4-mode 모델
// ============================================================
export type WorkbookKind = "syntax" | "word";
export type WorkbookScope = "unit" | "passage";
export type WorkbookMode = `${WorkbookKind}_${WorkbookScope}`;

/** UI 라벨 */
export const WORKBOOK_MODE_LABEL: Record<WorkbookMode, string> = {
  syntax_unit: "구문 · 유닛 통합",
  syntax_passage: "구문 · 문장별",
  word_unit: "단어 · 유닛 통합",
  word_passage: "단어 · 문장별",
};

/** 한 줄 설명 */
export const WORKBOOK_MODE_DESC: Record<WorkbookMode, string> = {
  syntax_unit: "유닛 전체 문장의 영어 + 학생 한글해석을 한 권으로",
  syntax_passage: "지문 1장에 영어 + 한글해석 (지문마다 1장)",
  word_unit: "유닛 전체 단어를 하나로 묶은 시험지",
  word_passage: "지문마다 단어 시험지 1장",
};

interface UnitWorkbookContext {
  unitTitle: string;
  unitCode: string; // ex) "L05 · 시리즈 · 권 · U3"
  studentName: string | null;
  studentNo: string | null;
}

// ============================================================
// 1) 구문 · 유닛 통합 — 기존 buildUnitOnlyCombined (= 김재원 디자인)
// ============================================================
const buildSyntaxUnit = async (
  sentenceIds: string[],
  studentId: string,
  ctx: UnitWorkbookContext,
): Promise<string> => {
  const items: UnitCombinedItem[] = [];
  for (const sid of sentenceIds) {
    let analysis;
    try {
      analysis = await preloadAnalysisPayload({
        sentenceId: sid,
        studentId,
        mode: "marked",
      });
    } catch {
      continue; // 분석 데이터가 없는 문장은 통합본에서 제외
    }
    const { data: t } = await supabase
      .from("sentence_translations")
      .select("text")
      .eq("user_id", studentId)
      .eq("sentence_id", sid)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    items.push({
      passageCode: sid,
      analysis,
      studentTranslation: (t?.text as string | undefined) ?? "",
    });
  }

  return buildUnitCombinedWorkbookHtml({
    unitTitle: ctx.unitTitle,
    unitCode: ctx.unitCode,
    studentName: ctx.studentName,
    studentNo: ctx.studentNo,
    items,
  });
};

// ============================================================
// HTML 합치기 헬퍼 — 각 빌더가 반환한 doctype/wrap 에서 body 만 추출해 결합
// ============================================================
const stripDoc = (full: string): string => {
  const m = full.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return m ? m[1] : full;
};

const SHARED_HEAD = `
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
  @page { size: B5 portrait; margin: 10mm; }
  html, body { background: #fff; margin: 0; padding: 0; }
  body {
    font-family: 'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', system-ui, sans-serif;
    color: #000;
    font-size: 10.5pt;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  * { box-sizing: border-box; }
  .page { width: 162mm; min-height: 237mm; margin: 0 auto; padding: 0; page-break-after: always; }
  .page:last-child { page-break-after: auto; }
</style>
`;

const wrapMulti = (title: string, parts: string[]): string => {
  const body = parts.map((p) => stripDoc(p)).join("\n");
  return `<!DOCTYPE html><html lang="ko"><head><title>${escapeHtml(title)}</title>${SHARED_HEAD}</head><body>${body}<script>try{window.__LOVABLE_PRINT_READY=true;}catch(e){}</script></body></html>`;
};

// ============================================================
// 2) 구문 · 문장별 — 지문마다 buildHandoutPrintHtml 1장
// ============================================================
const buildSyntaxPassage = async (
  sentenceIds: string[],
  studentId: string,
  ctx: UnitWorkbookContext,
): Promise<string> => {
  const parts: string[] = [];
  for (const sid of sentenceIds) {
    try {
      const payload = await preloadHandoutPayload({
        sentenceId: sid,
        studentId,
      });
      parts.push(buildHandoutPrintHtml(payload));
    } catch (e) {
      if (e instanceof PrintPreloadError) {
        // 지문 데이터 자체가 없는 경우만 스킵 안내
        parts.push(
          `<div class="page"><div style="padding:20mm;text-align:center;color:#666;border:0.5pt dashed #aaa">구문 HO 준비 실패 — ${escapeHtml(sid)}</div></div>`,
        );
      }
    }
  }
  const title = `구문 워크북 · ${ctx.unitTitle} · ${ctx.studentName ?? ""}`;
  return wrapMulti(title, parts);
};

// ============================================================
// 3) 단어 · 유닛 통합 — 모든 지문의 단어를 모아 하나의 시험지 1장
// ============================================================
const collectWordItems = async (
  sentenceId: string,
  studentId: string,
): Promise<Array<{ word: string; expected: string }>> => {
  // 학생의 최근 오답 단어
  const { data: wt } = await supabase
    .from("word_test_results")
    .select("wrong_words, taken_at")
    .eq("user_id", studentId)
    .eq("sentence_id", sentenceId)
    .order("taken_at", { ascending: false })
    .limit(1);
  const wrong = (wt?.[0]?.wrong_words ?? []) as Array<{
    word: string;
    expected: string;
  }>;
  let items = wrong
    .filter((w) => w?.word)
    .map((w) => ({ word: w.word, expected: w.expected ?? "" }));
  if (items.length === 0) {
    // 오답이 없으면 추출 단어 전체 사용
    const { data: ext } = await supabase
      .from("sentence_word_extractions")
      .select("words")
      .eq("sentence_id", sentenceId)
      .maybeSingle();
    const arr = (ext?.words ?? []) as Array<{
      word: string;
      meaning?: string;
      expected?: string;
    }>;
    items = arr
      .filter((w) => w?.word)
      .map((w) => ({
        word: w.word,
        expected: (w.expected ?? w.meaning ?? "").trim(),
      }));
  }
  return items;
};

const buildWordUnit = async (
  sentenceIds: string[],
  studentId: string,
  ctx: UnitWorkbookContext,
  paperSize: "A4" | "B5" = "B5",
): Promise<string> => {
  // 단어 시험지는 학생 진행도와 무관하게 "유닛 전체 지문"의 단어를 한 장에 묶는다.
  // sentenceIds 가 일부만 들어와도, 학생이 미완료여도 모든 지문의 단어를 모은다.
  const seen = new Map<string, { word: string; expected: string }>();
  for (const sid of sentenceIds) {
    const items = await collectWordItems(sid, studentId);
    for (const it of items) {
      const key = it.word.toLowerCase().trim();
      if (!key) continue;
      if (!seen.has(key)) seen.set(key, it);
    }
  }
  const merged = Array.from(seen.values());
  const payload: WordPayload = {
    passageCode: `${ctx.unitCode} · 유닛 단어`,
    studentName: ctx.studentName,
    studentNo: ctx.studentNo,
    scope: "all",
    mode: "mix",
    items: merged,
  };
  return buildWordUnitCompactPrintHtml(payload, paperSize);
};

// ============================================================
// 4) 단어 · 문장별 — 지문마다 단어 시험지 1장
// ============================================================
const buildWordPassage = async (
  sentenceIds: string[],
  studentId: string,
  ctx: UnitWorkbookContext,
): Promise<string> => {
  const parts: string[] = [];
  for (const sid of sentenceIds) {
    try {
      const payload = await preloadWordPayload({
        sentenceId: sid,
        studentId,
        scope: "wrong",
        mode: "mix",
      });
      parts.push(buildWordPrintHtml(payload));
    } catch {
      // 단어 자체가 없는 경우는 스킵
    }
  }
  const title = `문장별 단어 시험지 · ${ctx.unitTitle} · ${ctx.studentName ?? ""}`;
  return wrapMulti(title, parts);
};

// ============================================================
// Public API
// ============================================================
export interface BuildUnitWorkbookInput {
  unitId: string;
  unitTitle: string;
  unitCode: string;
  studentId: string;
  /** 4종 워크북 모드 — 기본 syntax_unit (= 김재원 디자인) */
  mode?: WorkbookMode;
  /** 단어 유닛 시험지 인쇄 용지 (기본 B5) */
  paperSize?: "A4" | "B5";
}

/**
 * 한 학생, 한 유닛에 대한 워크북 HTML 빌드.
 * 완료된 지문이 0개면 throw.
 */
export const buildUnitWorkbookHtmlFor = async (
  input: BuildUnitWorkbookInput,
): Promise<{ html: string; completedCount: number; mode: WorkbookMode }> => {
  const mode: WorkbookMode = input.mode ?? "syntax_unit";

  // 학생 정보
  const { data: sp } = await supabase
    .from("student_profiles")
    .select("display_name, student_no")
    .eq("user_id", input.studentId)
    .maybeSingle();
  const studentName = (sp?.display_name as string | null) ?? null;
  const studentNo = (sp?.student_no as string | null) ?? null;

  // 진행상황 (구문 워크북에서만 "완료된 지문"으로 필터)
  const summary = await summarizeUnitProgress(input.unitId, input.studentId);
  const isWord = mode === "word_unit" || mode === "word_passage";
  // 단어 시험지는 진행도 무관하게 유닛 전체 지문을 사용
  const allPassages = isWord ? await fetchPassagesByUnit(input.unitId) : [];
  const allCodes = allPassages.map((p) => p.code);
  const targetCodes = isWord ? allCodes : summary.completedCodes;
  if (targetCodes.length === 0) {
    throw new Error(isWord ? "이 유닛에 지문이 없어요." : "아직 완료한 지문이 없어요.");
  }

  const ctx: UnitWorkbookContext = {
    unitTitle: input.unitTitle,
    unitCode: input.unitCode,
    studentName,
    studentNo,
  };

  let html: string;
  switch (mode) {
    case "syntax_unit":
      html = await buildSyntaxUnit(targetCodes, input.studentId, ctx);
      break;
    case "syntax_passage":
      html = await buildSyntaxPassage(targetCodes, input.studentId, ctx);
      break;
    case "word_unit":
      html = await buildWordUnit(targetCodes, input.studentId, ctx, input.paperSize ?? "B5");
      break;
    case "word_passage":
      html = await buildWordPassage(targetCodes, input.studentId, ctx);
      break;
  }

  return { html, completedCount: targetCodes.length, mode };
};

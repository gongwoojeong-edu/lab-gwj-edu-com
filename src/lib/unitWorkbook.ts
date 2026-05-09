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
  preloadHandoutPayload,
  preloadWordPayload,
  PrintPreloadError,
} from "./printPreload";
import {
  buildHandoutPrintHtml,
  buildWordPrintHtml,
  buildWordUnitCompactPrintHtml,
  type WordPayload,
} from "./printTemplates";
import { fetchPassagesByUnit, type Passage } from "./textbooks";

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
// 1) 구문 · 유닛 통합 — [레거시] 영문 한 유닛 전체 + 학생 한글해석
//    분석 채점본/구조도 페이지 없음 — 화면으로 첨삭하므로 인쇄에는 불필요
// ============================================================
const buildSyntaxUnit = async (
  passages: Passage[],
  studentId: string,
  ctx: UnitWorkbookContext,
): Promise<string> => {
  const codes = passages.map((p) => p.code);
  const { data: trs } = await supabase
    .from("sentence_translations")
    .select("sentence_id, text, submitted_at")
    .eq("user_id", studentId)
    .in("sentence_id", codes)
    .order("submitted_at", { ascending: false });
  const transMap = new Map<string, string>();
  (trs ?? []).forEach((r) => {
    const sid = r.sentence_id as string;
    if (!transMap.has(sid)) transMap.set(sid, (r.text as string) ?? "");
  });

  const sName = ctx.studentName ? escapeHtml(ctx.studentName) : "_______";
  const sNo = ctx.studentNo ? `(${escapeHtml(ctx.studentNo)})` : "";
  const stamp = new Date().toLocaleString("ko-KR", { hour12: false });

  const enRows = passages
    .map((p, i) => `
      <div class="lg-row">
        <div class="lg-num">${i + 1}.</div>
        <div class="lg-body">
          <div class="lg-code">${escapeHtml(p.code)}</div>
          <div class="lg-en">${escapeHtml(p.english ?? "")}</div>
        </div>
      </div>`)
    .join("");

  const koRows = passages
    .map((p, i) => {
      const ko = (transMap.get(p.code) ?? "").trim();
      const koHtml = ko
        ? escapeHtml(ko)
        : '<span class="lg-muted">(미제출)</span>';
      return `
      <div class="lg-row">
        <div class="lg-num">${i + 1}.</div>
        <div class="lg-body">
          <div class="lg-code">${escapeHtml(p.code)}</div>
          <div class="lg-ko">${koHtml}</div>
        </div>
      </div>`;
    })
    .join("");

  return `<!DOCTYPE html><html lang="ko"><head>
<meta charset="utf-8" />
<title>${escapeHtml(`UnitWorkbook ${ctx.unitCode}`)}</title>
<style>
  @page { size: B5 portrait; margin: 10mm; }
  html, body { background: #fff; margin: 0; padding: 0; color: #000; }
  body {
    font-family: 'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', system-ui, sans-serif;
    font-size: 10.5pt; -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  * { box-sizing: border-box; }
  .lg-header {
    display: flex; justify-content: space-between; align-items: flex-end;
    border-bottom: 1pt solid #000; padding-bottom: 2mm; margin-bottom: 3mm;
  }
  .lg-eyebrow { font-size: 8pt; color: #666; letter-spacing: 0.05em; }
  .lg-title { font-size: 13pt; font-weight: 700; margin-top: 0.5mm; }
  .lg-meta { font-size: 8.5pt; color: #333; margin-top: 0.5mm; }
  .lg-stamp { font-size: 7.5pt; color: #888; text-align: right; }
  .lg-section-title {
    font-size: 9.5pt; font-weight: 700; margin: 3mm 0 1.5mm;
    border-left: 2pt solid #000; padding-left: 2mm;
  }
  .lg-box { border: 0.5pt solid #000; padding: 2mm 3mm; }
  .lg-row { display: flex; gap: 2mm; padding: 1mm 0; border-bottom: 0.3pt dashed #bbb; }
  .lg-row:last-child { border-bottom: none; }
  .lg-num { font-weight: 700; font-size: 9pt; min-width: 5mm; padding-top: 0.5mm; }
  .lg-body { flex: 1; min-width: 0; }
  .lg-code {
    font-size: 6.5pt; color: #888; letter-spacing: -0.02em;
    font-family: ui-monospace, "SF Mono", Menlo, monospace; margin-bottom: 0.3mm;
  }
  .lg-en { font-size: 10pt; line-height: 1.55; }
  .lg-ko { font-size: 10pt; line-height: 1.55; white-space: pre-wrap; }
  .lg-muted { color: #888; }
</style>
</head><body>
<div>
  <div class="lg-header">
    <div>
      <div class="lg-eyebrow">Gongwoojeong · Unit Workbook</div>
      <div class="lg-title">유닛 통합 워크북 · ${escapeHtml(ctx.unitTitle)}</div>
      <div class="lg-meta">${escapeHtml(ctx.unitCode)} · 학생: ${sName} ${sNo}</div>
    </div>
    <div class="lg-stamp">
      <div>출력: ${escapeHtml(stamp)}</div>
      <div>지문 ${passages.length}건</div>
    </div>
  </div>
  <div class="lg-section-title">① 본문 (English)</div>
  <div class="lg-box">${enRows || '<div class="lg-muted">(지문 없음)</div>'}</div>
  <div class="lg-section-title">② 학생 한글해석</div>
  <div class="lg-box">${koRows || '<div class="lg-muted">(미제출)</div>'}</div>
</div>
<script>try{window.__LOVABLE_PRINT_READY=true;}catch(e){}</script>
</body></html>`;
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
  showStudentHeader = true,
): Promise<string> => {
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
  return buildWordUnitCompactPrintHtml(payload, paperSize, showStudentHeader);
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
  /** 단어 통합 인쇄에서 첫 페이지 외에는 학생 헤더/로고 숨김 (기본 true) */
  showStudentHeader?: boolean;
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
      html = await buildWordUnit(targetCodes, input.studentId, ctx, input.paperSize ?? "B5", input.showStudentHeader ?? true);
      break;
    case "word_passage":
      html = await buildWordPassage(targetCodes, input.studentId, ctx);
      break;
  }

  return { html, completedCount: targetCodes.length, mode };
};

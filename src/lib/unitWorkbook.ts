// ============================================================
// unitWorkbook — 한 학생의 "유닛 단위 워크북" 통합 인쇄
//
// 구성:
//   1. 표지 (학생/유닛 정보 + 완료 지문 목록)
//   2. 각 완료 지문마다:
//      - 분석 채점본 (본인 제출 + 채점 결과)
//      - 단어 시험지 (오답 위주 / 없으면 전체)
//      - 한글해석본 (본인 제출 영역)
//
// 완료 기준 (엄격):
//   sentence_progress 의 word_test_done && translation_done && analysis_done == true
// ============================================================
import { supabase } from "@/integrations/supabase/client";
import {
  preloadAnalysisPayload,
  preloadWordPayload,
  preloadHandoutPayload,
  PrintPreloadError,
} from "./printPreload";
import {
  buildAnalysisPrintHtml,
  buildWordPrintHtml,
  buildHandoutPrintHtml,
  buildUnitOnlyHandoutHtml,
  type UnitOnlyHandoutItem,
} from "./printTemplates";
import { fetchPassagesByUnit, fetchPassageByCode } from "./textbooks";

const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const nowStamp = (): string => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

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
  return { totalPassages: codes.length, completedCodes: completed, pendingCodes: pending };
};

export type UnitWorkbookMode = "unit_only" | "both";

interface UnitWorkbookContext {
  unitTitle: string;
  unitCode: string; // ex) "L05 · 시리즈 · 권 · U3"
  studentName: string | null;
  studentNo: string | null;
  mode: UnitWorkbookMode;
}

/** 한 지문에 대한 워크북 섹션(분석/단어/해석) 빌드 — 실패 섹션은 스킵
 *  mode === "unit_only" 인 경우 단어 시험지 섹션은 스킵한다.
 */
const buildPassageSection = async (
  sentenceId: string,
  studentId: string,
  mode: UnitWorkbookMode,
): Promise<string> => {
  const sections: string[] = [];

  // 1) 분석 채점본
  try {
    const analysis = await preloadAnalysisPayload({
      sentenceId,
      studentId,
      mode: "marked",
    });
    sections.push(buildAnalysisPrintHtml(analysis));
  } catch (e) {
    if (!(e instanceof PrintPreloadError && e.stage === "analysis")) {
      // analysis 데이터가 없는 경우는 안내만
    }
    sections.push(
      `<div class="page"><div class="section"><div class="section-title">분석 채점본 — ${escapeHtml(sentenceId)}</div><div style="padding:6mm;text-align:center;color:#666;border:0.5pt dashed #aaa">분석 비교 데이터를 불러오지 못했어요.</div></div></div>`,
    );
  }

  // 2) 단어 시험지 (오답 위주 → 없으면 전체) — unit_only 모드에서는 스킵
  if (mode === "both") {
    try {
      const word = await preloadWordPayload({
        sentenceId,
        studentId,
        scope: "wrong",
        mode: "mix",
      });
      sections.push(buildWordPrintHtml(word));
    } catch {
      /* skip */
    }
  }

  // 3) 한글해석 HO — both 모드에서만 지문별 출력. unit_only 는 마지막에 통합본으로 한 번만.
  if (mode === "both") {
    try {
      const handout = await preloadHandoutPayload({ sentenceId, studentId });
      sections.push(buildHandoutPrintHtml(handout));
    } catch {
      /* skip */
    }
  }

  return sections.join("\n");
};

/** unit_only 전용 — 통합 한글해석본 + 유닛 끝 페이지 */
const buildUnitOnlyTail = async (
  sentenceIds: string[],
  studentId: string,
  ctx: UnitWorkbookContext,
): Promise<string> => {
  const items: UnitOnlyHandoutItem[] = [];
  for (const sid of sentenceIds) {
    const passage = await fetchPassageByCode(sid).catch(() => null);
    if (!passage) continue;
    const { data: t } = await supabase
      .from("sentence_translations")
      .select("text")
      .eq("user_id", studentId)
      .eq("sentence_id", sid)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    items.push({
      passageCode: passage.code,
      english: passage.english,
      studentTranslation: (t?.text as string | undefined) ?? "",
    });
  }
  return buildUnitOnlyHandoutHtml({
    unitTitle: ctx.unitTitle,
    unitCode: ctx.unitCode,
    studentName: ctx.studentName,
    studentNo: ctx.studentNo,
    items,
  });
};

const COVER_HEAD = `
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
  .cover {
    padding: 30mm 10mm 10mm;
  }
  .cover .eyebrow {
    font-size: 9pt; font-weight: 700; letter-spacing: 0.22em;
    text-transform: uppercase; color: #555;
  }
  .cover .title {
    font-size: 24pt; font-weight: 800; margin-top: 4mm;
    border-bottom: 3pt solid #000; padding-bottom: 4mm;
  }
  .cover .meta-grid {
    margin-top: 8mm; display: grid; grid-template-columns: 30mm 1fr;
    gap: 3mm 5mm; font-size: 11pt;
  }
  .cover .meta-grid .k { color: #555; font-weight: 600; }
  .cover .toc-title {
    margin-top: 12mm; font-size: 11pt; font-weight: 700;
    border-left: 2pt solid #000; padding-left: 2mm;
  }
  .cover .toc {
    margin-top: 3mm; font-size: 10pt; line-height: 1.9;
    columns: 2; column-gap: 8mm;
  }
  .cover .toc .item {
    break-inside: avoid; display: flex; justify-content: space-between;
    border-bottom: 0.3pt dotted #888; padding: 0.5mm 0;
  }
  .cover .footnote {
    margin-top: auto; font-size: 8.5pt; color: #666;
    padding-top: 8mm;
  }
</style>
`;

const buildCoverPage = (
  ctx: UnitWorkbookContext,
  completedCodes: string[],
): string => {
  const stamp = nowStamp();
  const sName = ctx.studentName ? escapeHtml(ctx.studentName) : "_______";
  const sNo = ctx.studentNo ? escapeHtml(ctx.studentNo) : "—";
  // 페이지 추정값: both = 지문당 3섹션, unit_only = 지문당 2섹션
  const perPassage = ctx.mode === "unit_only" ? 2 : 3;
  const items = completedCodes
    .map(
      (c, i) =>
        `<div class="item"><span>${i + 1}. ${escapeHtml(c)}</span><span>${i * perPassage + 2}p~</span></div>`,
    )
    .join("");
  const footnote =
    ctx.mode === "unit_only"
      ? "각 지문은 [분석 채점본 → 한글해석본] 순으로 구성되어 있어요. (유닛 모드 · 단어 시험지 제외)"
      : "각 지문은 [분석 채점본 → 단어 시험지 → 한글해석본] 순으로 구성되어 있어요.";
  const modeBadge =
    ctx.mode === "unit_only" ? "유닛만 (분석 + 해석)" : "유닛 + 문장 (전체)";
  return `
<div class="page cover">
  <div class="eyebrow">Gongwoojeong · Unit Workbook</div>
  <div class="title">유닛 워크북 · ${escapeHtml(ctx.unitTitle)}</div>
  <div class="meta-grid">
    <div class="k">학생</div><div><b>${sName}</b> (${sNo})</div>
    <div class="k">유닛</div><div>${escapeHtml(ctx.unitCode)}</div>
    <div class="k">완료 지문</div><div>${completedCodes.length}건</div>
    <div class="k">워크북 모드</div><div>${modeBadge}</div>
    <div class="k">출력 일시</div><div>${stamp}</div>
  </div>
  <div class="toc-title">수록 지문</div>
  <div class="toc">${items || '<div class="item"><span>(없음)</span></div>'}</div>
  <div class="footnote">
    ${footnote}
  </div>
</div>
`;
};

export interface BuildUnitWorkbookInput {
  unitId: string;
  unitTitle: string;
  unitCode: string;
  studentId: string;
  /** 워크북 인쇄 모드 — 기본 "both" (하위호환) */
  mode?: UnitWorkbookMode;
}

/**
 * 한 학생, 한 유닛에 대한 통합 워크북 HTML 빌드.
 * 완료된 지문이 0개면 throw.
 */
export const buildUnitWorkbookHtmlFor = async (
  input: BuildUnitWorkbookInput,
): Promise<{ html: string; completedCount: number; mode: UnitWorkbookMode }> => {
  const mode: UnitWorkbookMode = input.mode === "unit_only" ? "unit_only" : "both";

  // 학생 정보
  const { data: sp } = await supabase
    .from("student_profiles")
    .select("display_name, student_no")
    .eq("user_id", input.studentId)
    .maybeSingle();
  const studentName = (sp?.display_name as string | null) ?? null;
  const studentNo = (sp?.student_no as string | null) ?? null;

  // 진행상황
  const summary = await summarizeUnitProgress(input.unitId, input.studentId);
  if (summary.completedCodes.length === 0) {
    throw new Error("아직 완료한 지문이 없어요.");
  }

  const ctx: UnitWorkbookContext = {
    unitTitle: input.unitTitle,
    unitCode: input.unitCode,
    studentName,
    studentNo,
    mode,
  };

  // 표지
  const cover = buildCoverPage(ctx, summary.completedCodes);

  // 본문 — 직렬 처리 (병렬은 부하 + AI/DB rate limit 위험)
  const sections: string[] = [];
  for (const code of summary.completedCodes) {
    const sec = await buildPassageSection(code, input.studentId, mode);
    sections.push(sec);
  }

  // unit_only: 마지막에 통합 한글해석본 + 유닛 끝 페이지 (1회)
  if (mode === "unit_only") {
    try {
      const tail = await buildUnitOnlyTail(summary.completedCodes, input.studentId, ctx);
      sections.push(tail);
    } catch {
      /* skip */
    }
  }

  // 각 섹션 빌더가 자체 doctype/wrap을 만들어 반환하므로,
  // 통합 워크북에서는 body 만 추출해서 합쳐야 한다.
  const stripDoc = (full: string): string => {
    const m = full.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    return m ? m[1] : full;
  };

  const bodyParts = [
    cover,
    ...sections.map((s) => stripDoc(s)),
  ].join("\n");

  const title = `유닛 워크북 · ${input.unitTitle} · ${studentName ?? ""}`;
  const html = `<!DOCTYPE html><html lang="ko"><head><title>${escapeHtml(title)}</title>${COVER_HEAD}</head><body>${bodyParts}<script>try{window.__LOVABLE_PRINT_READY=true;}catch(e){}</script></body></html>`;

  return { html, completedCount: summary.completedCodes.length, mode };
};

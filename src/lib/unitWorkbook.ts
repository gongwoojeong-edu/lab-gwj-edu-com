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
// 포함 기준:
//   - syntax_unit / word_*: 유닛 전체 지문
//   - syntax_passage: 완료 지문(sentence_progress 3단계 완료)만
// ============================================================
import { supabase } from "@/integrations/supabase/client";
import {
  preloadAnalysisPayload,
  preloadHandoutPayload,
  preloadWordPayload,
  PrintPreloadError,
} from "./printPreload";
import { MEMO_FIELD_KEYS, MEMO_FIELD_LABEL, parseMemo } from "./approvalMemo";
import {
  buildBookCombinedWorkbookHtml,
  buildHandoutPrintHtml,
  buildWordPrintHtml,
  buildWordUnitCompactPrintHtml,
  type BookCombinedItem,
  type BookCombinedUnit,
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

/** import 재전송 alt4/alt5 등 — code에서 -altN 제거한 키 */
function normalizePassageCodeKey(code: string): string {
  return (code ?? "").trim().toLowerCase().replace(/-alt\d+/gi, "");
}

function normalizeEnglishKey(english: string | null | undefined): string {
  return (english ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * 워크북 인쇄용 — passage_no 순서 유지, 중복 행 제거 (앞쪽만).
 * - 동일 영문 (re-import / alt 중복)
 * - 동일 code (-altN 제외)
 */
export function dedupePassagesForPrint(passages: Passage[]): Passage[] {
  const seenEnglish = new Set<string>();
  const seenCode = new Set<string>();
  const out: Passage[] = [];

  for (const p of passages) {
    const enKey = normalizeEnglishKey(p.english);
    const codeKey = normalizePassageCodeKey(p.code);

    if (enKey && seenEnglish.has(enKey)) continue;
    if (codeKey && seenCode.has(codeKey)) continue;

    if (enKey) seenEnglish.add(enKey);
    if (codeKey) seenCode.add(codeKey);
    out.push(p);
  }
  return out;
}

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
export type WorkbookMode =
  | `${WorkbookKind}_${WorkbookScope}`
  | "syntax_book";

/** UI 라벨 */
export const WORKBOOK_MODE_LABEL: Record<WorkbookMode, string> = {
  syntax_unit: "구문 · 유닛별 개별(기존 형식)",
  syntax_book: "구문 · 선택유닛 통합(분석·첨삭)",
  syntax_passage: "구문 · 문장별",
  word_unit: "단어 · 유닛 통합",
  word_passage: "단어 · 문장별",
};

/** 한 줄 설명 */
export const WORKBOOK_MODE_DESC: Record<WorkbookMode, string> = {
  syntax_unit:
    "기존 형식 — 유닛마다 (본문+해석 / 구조도) 세트를 따로 만들어 이어붙임",
  syntax_book:
    "①선택유닛 전체 원문(분석·중요어법) ②전체 학생해석 첨삭 ③전체 구조도·지스트·영작",
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
  answerKey = false,
): Promise<string> => {
  const codes = passages.map((p) => p.code);
  const { data: trs } = await supabase
    .from("sentence_translations")
    .select("sentence_id, text, submitted_at")
    .eq("user_id", studentId)
    .in("sentence_id", codes)
    .order("submitted_at", { ascending: true });
  // 문장별 "처음 제출" + "마지막 제출" 둘 다 보관 (동일하면 하나만)
  const transMap = new Map<string, { first: string; last: string }>();
  (trs ?? []).forEach((r) => {
    const sid = r.sentence_id as string;
    const text = ((r.text as string) ?? "").trim();
    if (!text) return;
    const cur = transMap.get(sid);
    if (!cur) transMap.set(sid, { first: text, last: text });
    else cur.last = text;
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
      const pair = transMap.get(p.code);
      let koHtml: string;
      if (!pair) {
        koHtml = '<span class="lg-muted">(미제출)</span>';
      } else if (pair.first === pair.last) {
        koHtml = `<div class="lg-ko lg-ko-faint">${escapeHtml(pair.first)}</div>`;
      } else {
        koHtml =
          `<div class="lg-ko lg-ko-faint"><span class="lg-ko-tag">처음</span>${escapeHtml(pair.first)}</div>` +
          `<div class="lg-ko lg-ko-faint"><span class="lg-ko-tag">최종</span>${escapeHtml(pair.last)}</div>`;
      }
      return `
      <div class="lg-row">
        <div class="lg-num">${i + 1}.</div>
        <div class="lg-body">
          <div class="lg-code">${escapeHtml(p.code)}</div>
          ${koHtml}
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
  .lg-ko-faint { color: #c2c2c2; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .lg-ko-tag {
    display: inline-block; min-width: 9mm; margin-right: 1.5mm;
    font-size: 7pt; font-weight: 700; color: #b0b0b0;
    border: 0.3pt solid #d5d5d5; border-radius: 1mm;
    padding: 0 1mm; vertical-align: 1.2mm;
  }
  .lg-muted { color: #888; }
  /* 뒷면 구조도 페이지 */
  .lg-back { page-break-before: always; }
  .lg-back .lg-section-title { margin-top: 2mm; }
  .lg-grid {
    min-height: 70mm;
    background-image:
      linear-gradient(#bbb 0.3pt, transparent 0.3pt),
      linear-gradient(90deg, #bbb 0.3pt, transparent 0.3pt);
    background-size: 4mm 4mm;
    border: 0.5pt solid #000;
  }
  .lg-write { display: flex; flex-direction: column; gap: 9mm; padding: 2mm 0 0.5mm; }
  .lg-line { border-bottom: 0.5pt solid #000; height: 0; }
  /* 답지 모드 */
  .lg-ans-banner {
    display: inline-block; background: #c00; color: #fff;
    font-size: 8.5pt; font-weight: 800; padding: 0.5mm 2mm;
    border-radius: 1mm; letter-spacing: 0.05em; margin-left: 2mm;
  }
  .lg-ans-fill {
    border: 0.5pt solid #000; padding: 2mm 3mm;
    font-size: 9.5pt; line-height: 1.55;
    background: #fff8e6;
    white-space: pre-wrap;
  }
  .lg-ans-grid-note {
    border: 0.5pt solid #000; padding: 4mm; min-height: 70mm;
    font-size: 9pt; color: #666; text-align: center;
    display: flex; align-items: center; justify-content: center;
    background: #fafafa;
  }
</style>
</head><body>
<div>
  <div class="lg-header">
    <div>
      <div class="lg-eyebrow">Gongwoojeong · Unit Workbook${answerKey ? " · ANSWER KEY" : ""}</div>
      <div class="lg-title">유닛 통합 워크북 · ${escapeHtml(ctx.unitTitle)}${answerKey ? '<span class="lg-ans-banner">답지</span>' : ""}</div>
      <div class="lg-meta">${escapeHtml(ctx.unitCode)} · 학생: ${sName} ${sNo}</div>
    </div>
    <div class="lg-stamp">
      <div>출력: ${escapeHtml(stamp)}</div>
      <div>지문 ${passages.length}건 · 앞면</div>
    </div>
  </div>
  <div class="lg-section-title">① 본문 (English)</div>
  <div class="lg-box">${enRows || '<div class="lg-muted">(지문 없음)</div>'}</div>
  <div class="lg-section-title">② ${answerKey ? "모범 한글해석 (정답)" : '학생 한글해석 <span style="font-weight:400;font-size:8pt;color:#777">(처음/최종 제출 · 흐린 글씨 — 따라쓰거나 자연스럽게 다시 쓰기)</span>'}</div>
  <div class="lg-box">${
    answerKey
      ? (passages
          .map((p, i) => {
            const ko = (p.korean ?? "").trim();
            const koHtml = ko ? escapeHtml(ko) : '<span class="lg-muted">(DB에 모범해석 없음)</span>';
            return `
      <div class="lg-row">
        <div class="lg-num">${i + 1}.</div>
        <div class="lg-body">
          <div class="lg-code">${escapeHtml(p.code)}</div>
          <div class="lg-ko">${koHtml}</div>
        </div>
      </div>`;
          })
          .join("") || '<div class="lg-muted">(지문 없음)</div>')
      : (koRows || '<div class="lg-muted">(미제출)</div>')
  }</div>
</div>

<div class="lg-back">
  <div class="lg-header">
    <div>
      <div class="lg-eyebrow">Gongwoojeong · Unit Wrap-up${answerKey ? " · ANSWER KEY" : ""}</div>
      <div class="lg-title">유닛 마무리 · ${escapeHtml(ctx.unitTitle)}${answerKey ? '<span class="lg-ans-banner">답지</span>' : ""}</div>
      <div class="lg-meta">${escapeHtml(ctx.unitCode)} · 학생: ${sName} ${sNo}</div>
    </div>
    <div class="lg-stamp">
      <div>출력: ${escapeHtml(stamp)}</div>
      <div>구조도 · 지스트 · 영작 · 어법·어휘 · 재영작</div>
    </div>
  </div>
  <div class="lg-section-title">① 구조도</div>
  ${answerKey
    ? '<div class="lg-ans-grid-note">구조도 정답은 DB에 저장되지 않습니다 — 화면 분석으로 대조하세요.</div>'
    : '<div class="lg-grid"></div>'}
  <div class="lg-section-title" style="margin-top:1.5mm;">핵심 키워드 정리</div>
  <div style="border:0.5pt solid #000;padding:1mm 2mm;">
    ${passages
      .map(
        (p) => `
      <div style="display:flex;align-items:flex-end;gap:2mm;padding:0.8mm 0;border-bottom:0.3pt dashed #bbb;">
        <span style="font-size:6.5pt;color:#888;font-family:monospace;min-width:17mm;">${escapeHtml(p.code)}</span>
        <span style="font-size:7.5pt;color:#555;">키워드</span>
        <span style="flex:1;border-bottom:0.5pt solid #000;height:4.5mm;"></span>
        <span style="flex:1;border-bottom:0.5pt solid #000;height:4.5mm;"></span>
        <span style="flex:1;border-bottom:0.5pt solid #000;height:4.5mm;"></span>
      </div>`,
      )
      .join("") || '<div class="lg-muted">(지문 없음)</div>'}
  </div>
  <div class="lg-section-title">② 지스트 (한글, 한문장으로 주제쓰기)</div>
  ${answerKey
    ? '<div class="lg-ans-grid-note" style="min-height:18mm">지스트 정답은 DB에 저장되지 않습니다.</div>'
    : '<div class="lg-write"><div class="lg-line"></div><div class="lg-line"></div></div>'}
  <div class="lg-section-title">③ 영작</div>
  ${answerKey
    ? `<div class="lg-ans-fill">${
        passages
          .map((p, i) => `${i + 1}. ${escapeHtml(p.english ?? "")}`)
          .join("\n") || '(지문 없음)'
      }</div>`
    : '<div class="lg-write"><div class="lg-line"></div><div class="lg-line"></div></div>'}
  <div class="lg-section-title">④ 주요 어법과 어휘 정리칸 (유의어/반의어)</div>
  ${answerKey
    ? '<div class="lg-ans-grid-note" style="min-height:22mm">어법·어휘 정답은 DB에 저장되지 않습니다 — 수업 중 판서로 대조하세요.</div>'
    : `<div class="lg-write">
        <div class="lg-line"></div>
        <div class="lg-line"></div>
        <div class="lg-line"></div>
      </div>`}
  <div class="lg-section-title">⑤ 재영작</div>
  ${answerKey
    ? `<div class="lg-ans-fill">${
        passages
          .map((p, i) => `${i + 1}. ${escapeHtml(p.english ?? "")}`)
          .join("\n") || '(지문 없음)'
      }</div>`
    : '<div class="lg-write"><div class="lg-line"></div><div class="lg-line"></div></div>'}
</div>
<script>try{window.__LOVABLE_PRINT_READY=true;}catch(e){}</script>
</body></html>`;
};


// ============================================================
// 1-B) 구문 · 선택유닛 통합 (분석표기 · 첨삭 · 구조도 정리)
//   여러 유닛을 세 개의 큰 섹션으로 묶어 한 권으로 출력
// ============================================================
const collectBookUnit = async (
  u: { unitId: string; unitTitle: string; unitCode: string },
  studentId: string,
): Promise<BookCombinedUnit> => {
  const passages = dedupePassagesForPrint(await fetchPassagesByUnit(u.unitId));
  const codes = passages.map((p) => p.code);
  if (codes.length === 0) {
    return { unitTitle: u.unitTitle, unitCode: u.unitCode, items: [] };
  }

  const [{ data: trs }, { data: apps }, { data: exts }] = await Promise.all([
    supabase
      .from("sentence_translations")
      .select("sentence_id, text, submitted_at")
      .eq("user_id", studentId)
      .in("sentence_id", codes)
      .order("submitted_at", { ascending: true }),
    supabase
      .from("sentence_approvals")
      .select("sentence_id, memo, held_memo, requested_at")
      .eq("user_id", studentId)
      .in("sentence_id", codes)
      .order("requested_at", { ascending: true }),
    supabase
      .from("sentence_word_extractions")
      .select("sentence_id, words")
      .in("sentence_id", codes),
  ]);

  const words: Array<{ word: string; meaning: string }> = [];
  (exts ?? []).forEach((r) => {
    const arr = (r.words ?? []) as Array<{ word?: string; meaning?: string; expected?: string }>;
    arr.forEach((w) => {
      if (!w?.word) return;
      words.push({ word: w.word, meaning: (w.expected ?? w.meaning ?? "").trim() });
    });
  });

  const transMap = new Map<string, string>();
  (trs ?? []).forEach((r) => {
    const t = ((r.text as string) ?? "").trim();
    if (t) transMap.set(r.sentence_id as string, t);
  });

  const memoMap = new Map<string, ReturnType<typeof parseMemo>>();
  (apps ?? []).forEach((r) => {
    const raw =
      ((r as { memo?: string | null }).memo ?? "") ||
      ((r as { held_memo?: string | null }).held_memo ?? "");
    if (!raw) return;
    const parsed = parseMemo(raw);
    const hasAny = MEMO_FIELD_KEYS.some((k) => (parsed[k] ?? "").trim());
    if (hasAny) memoMap.set(r.sentence_id as string, parsed);
  });

  const items: BookCombinedItem[] = [];
  for (const p of passages) {
    const memo = memoMap.get(p.code);
    items.push({
      passageCode: p.code,
      english: p.english ?? "",
      analysis: null,
      studentTranslation: transMap.get(p.code) ?? "",
      referenceKorean: (p.korean ?? "").trim(),
      memo: memo
        ? MEMO_FIELD_KEYS.filter((k) => (memo[k] ?? "").trim()).map((k) => ({
            label: MEMO_FIELD_LABEL[k].split(" — ")[0],
            text: memo[k].trim(),
          }))
        : [],
      grammarNote: (memo?.grammar_watch ?? "").trim(),
    });
  }
  return { unitTitle: u.unitTitle, unitCode: u.unitCode, items, words };
};

/** 여러 유닛 → 통합 워크북 HTML */
export const buildBookCombinedWorkbookFor = async (input: {
  units: Array<{ unitId: string; unitTitle: string; unitCode: string }>;
  studentId: string;
  bookTitle?: string;
  /** 학생해석 자동 첨삭(diff) 표기 끄기 */
  disableCorrection?: boolean;
}): Promise<{ html: string; unitCount: number; passageCount: number }> => {
  const { data: sp } = await supabase
    .from("student_profiles")
    .select("display_name, student_no")
    .eq("user_id", input.studentId)
    .maybeSingle();

  const units: BookCombinedUnit[] = [];
  for (const u of input.units) {
    const bu = await collectBookUnit(u, input.studentId);
    if (bu.items.length > 0) units.push(bu);
  }
  if (units.length === 0) {
    throw new Error("선택한 유닛에 인쇄할 지문이 없습니다.");
  }

  const seenWord = new Set<string>();
  const words: Array<{ word: string; meaning: string }> = [];
  units.forEach((u) => {
    (u.words ?? []).forEach((w) => {
      const key = w.word.trim().toLowerCase();
      if (!key || seenWord.has(key)) return;
      seenWord.add(key);
      words.push(w);
    });
  });

  const html = buildBookCombinedWorkbookHtml({
    bookTitle:
      input.bookTitle ??
      (input.units.length > 1
        ? `유닛 ${units.length}개 통합`
        : units[0].unitTitle),
    studentName: (sp?.display_name as string | null) ?? null,
    studentNo: (sp?.student_no as string | null) ?? null,
    units,
    words,
    disableCorrection: input.disableCorrection,
  });
  return {
    html,
    unitCount: units.length,
    passageCount: units.reduce((s, u) => s + u.items.length, 0),
  };
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
  answerKey = false,
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
  return buildWordUnitCompactPrintHtml(payload, paperSize, showStudentHeader, answerKey);
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
  /** 답지 모드 — syntax_unit 뒷면을 정답(영작/재영작)으로 채움 */
  answerKey?: boolean;
  /** syntax_book 모드에서 학생해석 자동 첨삭(diff) 표기 끄기 */
  disableCorrection?: boolean;
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

  // 진행상황 (문장별 구문 워크북에서만 "완료된 지문"으로 필터)
  const summary = await summarizeUnitProgress(input.unitId, input.studentId);
  const isWord = mode === "word_unit" || mode === "word_passage";
  const isUnitWideMode = mode === "syntax_unit" || mode === "syntax_book" || isWord;
  // 유닛 통합 워크북과 단어 시험지는 진행도 무관하게 유닛 전체 지문을 사용
  const allPassagesRaw = isUnitWideMode ? await fetchPassagesByUnit(input.unitId) : [];
  const allPassages = isUnitWideMode ? dedupePassagesForPrint(allPassagesRaw) : [];
  const allCodes = allPassages.map((p) => p.code);
  const targetCodes = isUnitWideMode ? allCodes : summary.completedCodes;
  if (targetCodes.length === 0) {
    throw new Error(isUnitWideMode ? "이 유닛에 지문이 없어요." : "아직 완료한 지문이 없어요.");
  }

  const ctx: UnitWorkbookContext = {
    unitTitle: input.unitTitle,
    unitCode: input.unitCode,
    studentName,
    studentNo,
  };

  let html: string;
  switch (mode) {
    case "syntax_unit": {
      html = await buildSyntaxUnit(allPassages, input.studentId, ctx, input.answerKey ?? false);
      break;
    }
    case "syntax_book": {
      const r = await buildBookCombinedWorkbookFor({
        units: [
          { unitId: input.unitId, unitTitle: input.unitTitle, unitCode: input.unitCode },
        ],
        studentId: input.studentId,
        bookTitle: input.unitTitle,
        disableCorrection: input.disableCorrection,
      });
      html = r.html;
      break;
    }
    case "syntax_passage":
      html = await buildSyntaxPassage(targetCodes, input.studentId, ctx);
      break;
    case "word_unit":
      html = await buildWordUnit(targetCodes, input.studentId, ctx, input.paperSize ?? "B5", input.showStudentHeader ?? true, input.answerKey ?? false);
      break;
    case "word_passage":
      html = await buildWordPassage(targetCodes, input.studentId, ctx);
      break;
  }

  return { html, completedCount: targetCodes.length, mode };
};

// ============================================================
// 여러 유닛을 한 권의 워크북으로 합치는 빌더
// ============================================================
export interface BuildMultiUnitWorkbookInput {
  units: Array<{ unitId: string; unitTitle: string; unitCode: string }>;
  studentId: string;
  mode?: WorkbookMode;
  paperSize?: "A4" | "B5";
  answerKey?: boolean;
  /** syntax_book 모드에서 학생해석 자동 첨삭(diff) 표기 끄기 */
  disableCorrection?: boolean;
}

/**
 * 여러 유닛의 워크북 HTML을 하나로 합쳐 반환.
 * - 각 유닛 HTML의 <body> 본문을 추출 후 page-break 로 이어 붙임
 * - 한 유닛이라도 완료 지문이 0개면 그 유닛은 건너뜀 (모두 비면 throw)
 */
export const buildMultiUnitWorkbookHtml = async (
  input: BuildMultiUnitWorkbookInput,
): Promise<{ html: string; unitCount: number; passageCount: number; mode: WorkbookMode }> => {
  const mode: WorkbookMode = input.mode ?? "syntax_unit";

  // 선택유닛 통합 모드는 유닛별 문서를 이어붙이지 않고 하나의 통합 문서를 만든다
  if (mode === "syntax_book") {
    const r = await buildBookCombinedWorkbookFor({
      units: input.units,
      studentId: input.studentId,
      disableCorrection: input.disableCorrection,
    });
    return { html: r.html, unitCount: r.unitCount, passageCount: r.passageCount, mode };
  }

  const parts: Array<{ htmlDoc: string; passages: number; title: string }> = [];

  for (const u of input.units) {
    try {
      const r = await buildUnitWorkbookHtmlFor({
        unitId: u.unitId,
        unitTitle: u.unitTitle,
        unitCode: u.unitCode,
        studentId: input.studentId,
        mode,
        paperSize: input.paperSize,
        answerKey: input.answerKey,
      });
      parts.push({ htmlDoc: r.html, passages: r.completedCount, title: u.unitTitle });
    } catch {
      // 완료 지문 0개 등 — 건너뜀
    }
  }

  if (parts.length === 0) {
    throw new Error("선택한 유닛에 인쇄할 내용이 없습니다. (완료 지문 0)");
  }

  // 첫 문서의 <head>를 골격으로 사용. 이후 문서는 <body> 내부만 추출해 page-break 로 결합.
  const headMatch = parts[0].htmlDoc.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  const headInner = headMatch ? headMatch[1] : "";

  const extractBody = (doc: string): string => {
    const m = doc.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    return m ? m[1] : doc;
  };

  const bodies = parts
    .map((p, i) => {
      const inner = extractBody(p.htmlDoc);
      // 두 번째 유닛부터 page-break-before
      const wrapper = i === 0 ? "" : ' style="page-break-before: always; break-before: page;"';
      return `<section${wrapper} data-unit-title="${escapeHtml(p.title)}">${inner}</section>`;
    })
    .join("\n");

  const html = `<!doctype html>
<html lang="ko"><head>${headInner}
<style>
  /* 멀티-유닛 결합 워크북: 유닛 간 페이지 분리 */
  section[data-unit-title] + section[data-unit-title] { page-break-before: always; break-before: page; }
</style>
</head><body>${bodies}</body></html>`;

  const totalPassages = parts.reduce((s, p) => s + p.passages, 0);
  return { html, unitCount: parts.length, passageCount: totalPassages, mode };
};

// ============================================================
// printTemplates — 순수 HTML 인쇄 템플릿
// React 컴포넌트/Router/Auth 부팅을 거치지 않고
// hidden iframe 에 직접 주입하기 위한 문자열 빌더 모음.
//
// 원칙:
//   - 인라인 CSS + @media print
//   - 외부 폰트/이미지 로드 없음 (시스템 폰트 사용)
//   - lucide/Button/QR 등 React 의존성 없음
//   - 데이터는 호출자가 미리 fetch 해서 payload 로 넘긴다
// ============================================================
import type { ClozeSegment } from "./handoutCloze";
import type { CompareDetailRow } from "./analysisCompare";

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

const COMMON_HEAD = `
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
  .header {
    display: flex; justify-content: space-between; align-items: flex-end;
    padding: 4mm 5mm; border-bottom: 2.5pt solid #000;
  }
  .eyebrow { font-size: 7.5pt; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; }
  .title { font-size: 13pt; font-weight: 800; }
  .meta { font-size: 8.5pt; color: #333; line-height: 1.5; }
  .section { padding: 3mm 5mm; }
  .section-title {
    font-size: 9.5pt; font-weight: 700; margin-bottom: 2mm;
    border-left: 2pt solid #000; padding-left: 2mm;
  }
  @media print {
    body { background: #fff !important; }
  }
</style>
`;

const wrapDoc = (title: string, body: string): string =>
  `<!DOCTYPE html><html lang="ko"><head><title>${escapeHtml(title)}</title>${COMMON_HEAD}</head><body>${body}<script>try{window.__LOVABLE_PRINT_READY=true;}catch(e){}</script></body></html>`;

// ============================================================
// 구문 HO
// ============================================================
export interface HandoutPayload {
  passageCode: string;
  english: string;
  segments: ClozeSegment[] | null;
  structureHint: string | null;
  studentName: string | null;
  studentNo: string | null;
  studentTranslation: string;
}

export const buildHandoutPrintHtml = (p: HandoutPayload): string => {
  const stamp = nowStamp();
  const passageHtml = p.segments
    ? p.segments
        .map((s) =>
          s.kind === "cloze" && s.choices
            ? `<span class="cloze">[ ${escapeHtml(s.choices[0])} / ${escapeHtml(s.choices[1])} ]</span> `
            : `${escapeHtml(s.text)} `,
        )
        .join("")
    : escapeHtml(p.english);

  const sName = p.studentName ? escapeHtml(p.studentName) : "_______";
  const sNo = p.studentNo ? `(${escapeHtml(p.studentNo)})` : "";
  const trans = p.studentTranslation ? escapeHtml(p.studentTranslation) : "&nbsp;";

  const hintLine = p.structureHint
    ? ` · 핵심 흐름: ${escapeHtml(p.structureHint)}`
    : "";

  const body = `
<style>
  .passage { line-height: 2.5; font-size: 11pt; letter-spacing: 0.01em; }
  .cloze {
    display: inline-block; border: 1pt solid #000;
    padding: 0.5mm 1.5mm; margin: 0 0.5mm; font-weight: 600; white-space: nowrap;
  }
  .trans-box {
    min-height: 28mm; border: 0.5pt dashed #555; padding: 2mm;
    font-size: 10pt; line-height: 1.6; white-space: pre-wrap;
  }
  .grid-box {
    min-height: 90mm;
    background-image:
      linear-gradient(#bbb 0.3pt, transparent 0.3pt),
      linear-gradient(90deg, #bbb 0.3pt, transparent 0.3pt);
    background-size: 4mm 4mm;
    border: 0.5pt solid #000;
  }
  .write-lines { display: flex; flex-direction: column; gap: 6mm; padding-top: 4mm; }
  .write-line { border-bottom: 0.5pt solid #000; height: 0; }
  .gist-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; padding: 0 5mm 4mm; }
</style>

<div class="page">
  <div class="header">
    <div>
      <div class="eyebrow">Gongwoojeong · Hand-out</div>
      <div class="title">공우정바른학원 · 영어 학습지</div>
      <div class="meta">${escapeHtml(p.passageCode)}${hintLine}</div>
      <div class="meta">학생: ${sName} ${sNo}</div>
    </div>
    <div class="meta" style="text-align:right">
      <div>출력: ${stamp}</div>
      <div>1 / 2</div>
    </div>
  </div>
  <div class="section">
    <div class="section-title">① 지문 — 어법을 고르고 구문 기호로 분석</div>
    <div class="passage">${passageHtml}</div>
  </div>
  <div class="section">
    <div class="section-title">② 한글 해석</div>
    <div class="trans-box">${trans}</div>
  </div>
</div>

<div class="page">
  <div class="header">
    <div>
      <div class="eyebrow">Gongwoojeong · Hand-out</div>
      <div class="title">공우정바른학원 · 구조도 · 지스트 · 영작</div>
      <div class="meta">${escapeHtml(p.passageCode)} · ${sName} ${sNo}</div>
    </div>
    <div class="meta" style="text-align:right">
      <div>출력: ${stamp}</div>
      <div>2 / 2</div>
    </div>
  </div>
  <div class="section">
    <div class="section-title">③ 구조도</div>
    <div class="grid-box"></div>
  </div>
  <div class="gist-grid">
    <div>
      <div class="section-title">④ 지스트 (주제문장)</div>
      <div class="write-lines">
        <div class="write-line"></div><div class="write-line"></div>
        <div class="write-line"></div><div class="write-line"></div>
      </div>
    </div>
    <div>
      <div class="section-title">⑤ 영작</div>
      <div class="write-lines">
        <div class="write-line"></div><div class="write-line"></div>
        <div class="write-line"></div><div class="write-line"></div>
      </div>
    </div>
  </div>
</div>
`;
  return wrapDoc(`HO ${p.passageCode}`, body);
};

// ============================================================
// 단어 HO
// ============================================================
export type WordMode = "ko" | "en" | "mix";

export interface WordPayload {
  passageCode: string;
  studentName: string | null;
  studentNo: string | null;
  scope: "wrong" | "all";
  mode: WordMode;
  items: Array<{ word: string; expected: string }>;
}

export const buildWordPrintHtml = (p: WordPayload): string => {
  const stamp = nowStamp();
  const sName = p.studentName ? escapeHtml(p.studentName) : "_______";
  const sNo = p.studentNo ? `(${escapeHtml(p.studentNo)})` : "";
  const modeLabel =
    p.mode === "ko" ? "한글 채우기" : p.mode === "en" ? "영어 채우기" : "혼합";
  const scopeLabel = p.scope === "wrong" ? "오답 단어 학습지" : "전체 단어 학습지";

  const blankSideOf = (i: number): "ko" | "en" =>
    p.mode === "ko" ? "ko" : p.mode === "en" ? "en" : i % 2 === 0 ? "ko" : "en";

  const half = Math.ceil(p.items.length / 2);
  const left = p.items.slice(0, half);
  const right = p.items.slice(half);

  const renderRow = (
    it: { word: string; expected: string },
    idx0: number,
  ): string => {
    const side = blankSideOf(idx0);
    const idx = idx0 + 1;
    const en =
      side === "en"
        ? `<div class="cell en blank">______</div>`
        : `<div class="cell en">${escapeHtml(it.word)}</div>`;
    const ko =
      side === "ko"
        ? `<div class="cell ko blank">______</div>`
        : `<div class="cell ko">${escapeHtml(it.expected || "—")}</div>`;
    return `<div class="row"><div class="num">${idx}.</div>${en}${ko}</div>`;
  };

  const body = `
<style>
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; padding: 4mm 5mm; }
  .col { display: flex; flex-direction: column; }
  .row {
    display: grid; grid-template-columns: 7mm 1fr 1fr; gap: 2mm;
    align-items: end; border-bottom: 0.5pt solid #000;
    padding: 2mm 0; min-height: 9mm;
  }
  .num { font-size: 8pt; color: #444; text-align: right; padding-right: 1mm; }
  .en { font-size: 11pt; font-weight: 600; }
  .ko { font-size: 9.5pt; color: #333; }
  .blank { color: transparent; }
  .empty { padding: 24mm; text-align: center; font-size: 11pt; color: #555; }
</style>
<div class="page">
  <div class="header">
    <div>
      <div class="eyebrow">Gongwoojeong · Word Hand-out</div>
      <div class="title">단어 HO · ${escapeHtml(p.passageCode)}</div>
      <div class="meta">${scopeLabel} · ${modeLabel} · ${p.items.length}문항</div>
    </div>
    <div class="meta" style="text-align:right">
      <div>학생: <b>${sName}</b> ${sNo}</div>
      <div>출력: ${stamp}</div>
      <div>점수: ___ / ${p.items.length}</div>
    </div>
  </div>
  ${
    p.items.length === 0
      ? `<div class="empty">출제할 단어가 없습니다.</div>`
      : `<div class="grid">
          <div class="col">${left.map((it, i) => renderRow(it, i)).join("")}</div>
          <div class="col">${right.map((it, i) => renderRow(it, half + i)).join("")}</div>
        </div>`
  }
</div>
`;
  return wrapDoc(`Word ${p.passageCode}`, body);
};

// ============================================================
// 분석 채점본 (정적, Index 임베드 없음)
// ============================================================
export interface AnalysisPayload {
  sentenceId: string;
  studentName: string | null;
  studentNo: string | null;
  english: string;
  studentTranslation: string;
  rate: number;
  hasMaster: boolean;
  details: CompareDetailRow[];
  /** "marked" 는 채점결과 표 포함, "blank" 은 재분석용 빈칸 위주 */
  mode: "marked" | "blank";
}

export const buildAnalysisPrintHtml = (p: AnalysisPayload): string => {
  const stamp = nowStamp();
  const sName = p.studentName ? escapeHtml(p.studentName) : "_______";
  const sNo = p.studentNo ? `(${escapeHtml(p.studentNo)})` : "";
  const trans = p.studentTranslation ? escapeHtml(p.studentTranslation) : "(미제출)";

  const errors = p.details.filter((d) => d.status !== "exact");
  const errorsHtml =
    errors.length === 0
      ? `<div class="empty">차이 없음 (완전 일치)</div>`
      : `<table class="diff">
          <thead><tr><th>상태</th><th>구절</th><th>정답 POS</th><th>학생 POS</th></tr></thead>
          <tbody>
            ${errors
              .map(
                (d) => `<tr class="s-${d.status}">
                  <td>${escapeHtml(d.status)}</td>
                  <td>${escapeHtml(d.surface ?? d.ownerId)}</td>
                  <td>${escapeHtml(d.masterPos ?? "—")}</td>
                  <td>${escapeHtml(d.studentPos ?? "—")}</td>
                </tr>`,
              )
              .join("")}
          </tbody>
         </table>`;

  const blankBody = `
    <div class="section">
      <div class="section-title">② 재분석 영역</div>
      <div class="grid-box"></div>
    </div>`;

  const markedBody = `
    <div class="section">
      <div class="section-title">② 채점 결과 — 일치율 ${Math.round(p.rate * 100)}% · 차이 ${errors.length}건</div>
      ${p.hasMaster ? errorsHtml : `<div class="empty">마스터키가 등록되지 않은 문장입니다.</div>`}
    </div>
    <div class="section">
      <div class="section-title">③ 재분석 영역</div>
      <div class="grid-box small"></div>
    </div>`;

  const body = `
<style>
  .body-text { line-height: 1.9; font-size: 11pt; padding: 2mm 0; }
  .trans { font-size: 10pt; color: #333; padding: 2mm 0; white-space: pre-wrap; }
  .grid-box {
    min-height: 90mm;
    background-image:
      linear-gradient(#bbb 0.3pt, transparent 0.3pt),
      linear-gradient(90deg, #bbb 0.3pt, transparent 0.3pt);
    background-size: 4mm 4mm;
    border: 0.5pt solid #000;
  }
  .grid-box.small { min-height: 50mm; }
  .empty { padding: 6mm; text-align: center; font-size: 10pt; color: #555; border: 0.5pt dashed #aaa; }
  .diff { width: 100%; border-collapse: collapse; font-size: 9pt; }
  .diff th, .diff td { border: 0.5pt solid #000; padding: 1.2mm 2mm; text-align: left; vertical-align: top; }
  .diff th { background: #eee; font-weight: 700; }
  tr.s-missing td { background: #f6f6f6; }
  tr.s-extra td { background: #fff7e6; }
  tr.s-miss td, tr.s-partial td { background: #ffe9e9; }
</style>
<div class="page">
  <div class="header">
    <div>
      <div class="eyebrow">Gongwoojeong · Analysis</div>
      <div class="title">분석 채점본 · ${escapeHtml(p.sentenceId)}</div>
      <div class="meta">학생: ${sName} ${sNo}</div>
    </div>
    <div class="meta" style="text-align:right">
      <div>출력: ${stamp}</div>
      <div>${p.mode === "marked" ? "채점본" : "blank"}</div>
    </div>
  </div>
  <div class="section">
    <div class="section-title">① 본문</div>
    <div class="body-text">${escapeHtml(p.english)}</div>
    <div class="trans"><b>학생 한글해석:</b> ${trans}</div>
  </div>
  ${p.mode === "marked" ? markedBody : blankBody}
</div>
`;
  return wrapDoc(`Analysis ${p.sentenceId}`, body);
};

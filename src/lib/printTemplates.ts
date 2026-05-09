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
import type { CompareDetailRow, FlatWordUnit } from "./analysisCompare";

// ============================================================
// 학생 owner_progress 라벨 포맷터 (인쇄용)
//   pos / noun / adj / adv / verb / etc 를 한 줄 라벨로 변환
// ============================================================
interface AnyProgressLite {
  pos?: string | null;
  noun?: { form?: string | null; element?: string | null; role?: string | null; subrole?: string | null } | null;
  adj?: { form?: string | null; element?: string | null; role?: string | null } | null;
  adv?: { form?: string | null; subtype?: string | null; role?: string | null } | null;
  etc?: { kind?: string | null; role?: string | null } | null;
  verb?: {
    number?: string | null;
    tense?: string | null;
    aspect?: string | null;
    voice?: string | null;
    proverb?: string | null;
  } | null;
}
const POS_KO: Record<string, string> = {
  noun: "명사",
  verb: "동사",
  adj: "형용사",
  adv: "부사",
  etc: "기타",
};
const formatProgressLabel = (p: AnyProgressLite | undefined | null): string => {
  if (!p || !p.pos) return "";
  const head = POS_KO[p.pos] ?? p.pos;
  const parts: string[] = [];
  switch (p.pos) {
    case "noun": {
      if (p.noun?.form) parts.push(p.noun.form);
      if (p.noun?.element) parts.push(p.noun.element);
      if (p.noun?.role) parts.push(p.noun.role);
      if (p.noun?.subrole) parts.push(p.noun.subrole);
      break;
    }
    case "adj": {
      if (p.adj?.form) parts.push(p.adj.form);
      if (p.adj?.element) parts.push(p.adj.element);
      if (p.adj?.role) parts.push(p.adj.role);
      break;
    }
    case "adv": {
      if (p.adv?.form) parts.push(p.adv.form);
      if (p.adv?.subtype) parts.push(p.adv.subtype);
      if (p.adv?.role) parts.push(p.adv.role);
      break;
    }
    case "etc": {
      if (p.etc?.kind) parts.push(p.etc.kind);
      if (p.etc?.role) parts.push(p.etc.role);
      break;
    }
    case "verb": {
      if (p.verb?.tense) parts.push(p.verb.tense);
      if (p.verb?.aspect) parts.push(p.verb.aspect);
      if (p.verb?.voice) parts.push(p.verb.voice);
      if (p.verb?.number) parts.push(p.verb.number);
      if (p.verb?.proverb) parts.push(p.verb.proverb);
      break;
    }
  }
  const tail = parts.filter(Boolean).join("·");
  return tail ? `${head}·${tail}` : head;
};

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
// 유닛 통합 HO (unit_only 모드 전용)
//   · 통합 한글해석본: 영문 한 줄 + 학생 한글해석 한 줄, 자연 페이지 분할
//   · 유닛 끝: 구조도 1장 + 지스트/영작 (한 번만)
// ============================================================
export interface UnitOnlyHandoutItem {
  passageCode: string;
  english: string;
  /** 학생 제출 한글해석 — 비어 있으면 "(미제출)" */
  studentTranslation: string;
}
export interface UnitOnlyHandoutPayload {
  unitTitle: string;
  unitCode: string;
  studentName: string | null;
  studentNo: string | null;
  items: UnitOnlyHandoutItem[];
}

export const buildUnitOnlyHandoutHtml = (p: UnitOnlyHandoutPayload): string => {
  const stamp = nowStamp();
  const sName = p.studentName ? escapeHtml(p.studentName) : "_______";
  const sNo = p.studentNo ? `(${escapeHtml(p.studentNo)})` : "";
  const headerMeta = `${escapeHtml(p.unitCode)} · 학생: ${sName} ${sNo}`;

  const rows = p.items
    .map((it, i) => {
      const en = escapeHtml(it.english);
      const ko = it.studentTranslation && it.studentTranslation.trim()
        ? escapeHtml(it.studentTranslation)
        : '<span class="muted">(미제출)</span>';
      return `
        <div class="srow">
          <div class="srow-head">
            <span class="num">${i + 1}.</span>
            <span class="code">${escapeHtml(it.passageCode)}</span>
          </div>
          <div class="en">${en}</div>
          <div class="ko"><b>해석:</b> ${ko}</div>
        </div>`;
    })
    .join("");

  // 스타일 — passage 내 자동 페이지 분할 허용 (.srow 단위 break-inside:avoid)
  const body = `
<style>
  .uo-passage-page { padding: 4mm 5mm; }
  .srow {
    padding: 2mm 0 2.5mm; border-bottom: 0.3pt dashed #aaa;
    break-inside: avoid; page-break-inside: avoid;
  }
  .srow:last-child { border-bottom: none; }
  .srow-head { font-size: 8.5pt; color: #444; margin-bottom: 1mm; }
  .srow-head .num { font-weight: 700; margin-right: 1.5mm; }
  .srow-head .code { font-family: ui-monospace, "SF Mono", Menlo, monospace; }
  .srow .en { font-size: 11pt; line-height: 1.7; padding: 0.5mm 0; }
  .srow .ko {
    font-size: 10pt; line-height: 1.6; color: #222; padding: 1mm 0 0;
    min-height: 6mm; border-left: 1.5pt solid #999; padding-left: 2mm; margin-top: 1mm;
  }
  .srow .ko .muted { color: #888; }
  .uo-end-page { padding: 4mm 5mm; }
  .uo-end-grid {
    min-height: 90mm;
    background-image:
      linear-gradient(#bbb 0.3pt, transparent 0.3pt),
      linear-gradient(90deg, #bbb 0.3pt, transparent 0.3pt);
    background-size: 4mm 4mm;
    border: 0.5pt solid #000;
  }
  .uo-end-write { display: flex; flex-direction: column; gap: 6mm; padding-top: 4mm; }
  .uo-end-write-line { border-bottom: 0.5pt solid #000; height: 0; }
  .uo-end-grid-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; padding: 0 0 4mm; }
</style>

<!-- 통합 한글해석본 (1~N 페이지, 자동 분할) -->
<div class="page uo-passage-page">
  <div class="header">
    <div>
      <div class="eyebrow">Gongwoojeong · Unit Hand-out</div>
      <div class="title">유닛 통합 한글해석본 · ${escapeHtml(p.unitTitle)}</div>
      <div class="meta">${headerMeta}</div>
    </div>
    <div class="meta" style="text-align:right">
      <div>출력: ${stamp}</div>
      <div>지문 ${p.items.length}건</div>
    </div>
  </div>
  <div class="section">
    <div class="section-title">유닛 본문 — 영문 + 학생 제출 한글해석</div>
    ${rows || '<div class="srow"><div class="ko">(완료 지문 없음)</div></div>'}
  </div>
</div>

<!-- 유닛 끝 — 구조도 + 지스트 + 영작 (한 번만) -->
<div class="page uo-end-page">
  <div class="header">
    <div>
      <div class="eyebrow">Gongwoojeong · Unit Hand-out</div>
      <div class="title">유닛 마무리 · 구조도 · 지스트 · 영작</div>
      <div class="meta">${headerMeta}</div>
    </div>
    <div class="meta" style="text-align:right">
      <div>출력: ${stamp}</div>
      <div>유닛 정리</div>
    </div>
  </div>
  <div class="section">
    <div class="section-title">① 구조도</div>
    <div class="uo-end-grid"></div>
  </div>
  <div class="uo-end-grid-cols" style="padding: 0 5mm 4mm;">
    <div>
      <div class="section-title">② 지스트 (주제문장)</div>
      <div class="uo-end-write">
        <div class="uo-end-write-line"></div><div class="uo-end-write-line"></div>
        <div class="uo-end-write-line"></div><div class="uo-end-write-line"></div>
      </div>
    </div>
    <div>
      <div class="section-title">③ 영작</div>
      <div class="uo-end-write">
        <div class="uo-end-write-line"></div><div class="uo-end-write-line"></div>
        <div class="uo-end-write-line"></div><div class="uo-end-write-line"></div>
      </div>
    </div>
  </div>
</div>
`;
  return wrapDoc(`Unit HO ${p.unitCode}`, body);
};


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

export type PrintPaperSize = "A4" | "B5";

export const buildWordUnitCompactPrintHtml = (
  p: WordPayload,
  paperSize: PrintPaperSize = "B5",
): string => {
  const stamp = nowStamp();
  const sName = p.studentName ? escapeHtml(p.studentName) : "_______";
  const sNo = p.studentNo ? `(${escapeHtml(p.studentNo)})` : "";
  const modeLabel =
    p.mode === "ko" ? "한글 채우기" : p.mode === "en" ? "영어 채우기" : "혼합";
  // B5는 폭이 좁아서 컬럼 임계치를 더 낮게 잡는다
  const columnCount = paperSize === "B5"
    ? (p.items.length > 72 ? 3 : 2)
    : (p.items.length > 84 ? 4 : p.items.length > 36 ? 3 : 2);
  // B5(176×250) margin 8mm → 내용폭 160mm / A4(210×297) margin 8mm → 194mm
  const pageWidthMm = paperSize === "B5" ? 160 : 194;
  const pageSizeRule = paperSize === "B5" ? "B5 portrait" : "A4 portrait";
  const rowsPerColumn = Math.max(1, Math.ceil(p.items.length / columnCount));
  const columns = Array.from({ length: columnCount }, (_, col) =>
    p.items.slice(col * rowsPerColumn, (col + 1) * rowsPerColumn),
  );
  const blankSideOf = (i: number): "ko" | "en" =>
    p.mode === "ko" ? "ko" : p.mode === "en" ? "en" : i % 2 === 0 ? "ko" : "en";
  const renderRow = (it: { word: string; expected: string }, idx0: number): string => {
    const side = blankSideOf(idx0);
    const en = side === "en" ? `<span class="answer-blank"></span>` : escapeHtml(it.word);
    const ko = side === "ko" ? `<span class="answer-blank"></span>` : escapeHtml(it.expected || "—");
    return `<div class="compact-row"><span class="compact-num">${idx0 + 1}.</span><span class="compact-en">${en}</span><span class="compact-ko">${ko}</span></div>`;
  };

  const body = `
<style>
  @page { size: ${pageSizeRule}; margin: 8mm; }
  html, body { background: #fff; margin: 0; padding: 0; }
  body {
    font-family: 'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', system-ui, sans-serif;
    color: #000; font-size: 9pt;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  * { box-sizing: border-box; }
  .word-unit-page {
    width: ${pageWidthMm}mm; margin: 0 auto;
    page-break-after: auto; page-break-inside: avoid;
    position: relative; padding-bottom: 6mm; /* 하단 여유 — 프린터 푸터와 겹침 방지 */
  }
  .compact-header {
    display: flex; align-items: center; gap: 4mm; flex-wrap: wrap;
    padding-bottom: 1.5mm; border-bottom: 0.6pt solid #999; margin-bottom: 2.5mm;
  }
  /* .compact-logo 정의는 아래에 통합 */
  .compact-title { font-size: 10.5pt; font-weight: 800; letter-spacing: -0.01em; }
  .compact-meta { font-size: 7.5pt; color: #555; }
  .compact-meta b { color: #111; }
  .compact-meta-right { margin-left: auto; }
  .compact-watermark {
    position: absolute; left: 50%; top: 55%; transform: translate(-50%, -50%);
    width: 70%; max-width: 110mm; opacity: 0.08; pointer-events: none;
    z-index: 0;
    /* 흰색 배경을 시각적으로 제거 (로고가 흰 배경 PNG일 때) */
    mix-blend-mode: multiply;
  }
  .compact-logo { height: 7mm; width: auto; display: block; mix-blend-mode: multiply; }
  .compact-grid { position: relative; z-index: 1; display: grid; grid-template-columns: repeat(${columnCount}, minmax(0, 1fr)); gap: 2mm 5mm; }
  .compact-col { display: flex; flex-direction: column; }
  .compact-row {
    display: grid; grid-template-columns: 5mm minmax(0, 1fr) minmax(0, 1fr);
    gap: 1.5mm; align-items: end; min-height: ${columnCount >= 4 ? "5.6mm" : "6mm"};
    padding: 0.6mm 0;
    break-inside: avoid;
  }
  /* 행 구분선을 약하게 — 짝수행만 옅게 */
  .compact-col .compact-row:nth-child(even) { background: rgba(246,246,246,0.85); }
  .compact-num { font-size: 7pt; color: #888; text-align: right; padding-right: 0.5mm; }
  .compact-en { min-width: 0; font-size: ${columnCount >= 4 ? "7.7pt" : "8.7pt"}; font-weight: 700; overflow-wrap: anywhere; }
  .compact-ko { min-width: 0; font-size: ${columnCount >= 4 ? "7.2pt" : "8pt"}; color: #222; overflow-wrap: anywhere; }
  .answer-blank { display: inline-block; width: 100%; min-width: 12mm; height: 1em; border-bottom: 0.4pt solid #555; }
  .compact-empty { padding: 24mm; text-align: center; font-size: 11pt; color: #555; }
  .word-unit-page + .word-unit-page { margin-top: 4mm; page-break-before: always; }
  @media print { body { background: #fff !important; } }
</style>
<div class="word-unit-page">
  <img class="compact-watermark" src="/gwj-edu-logo.png" alt="" aria-hidden="true" />
  <div class="compact-header">
    <img class="compact-logo" src="/gwj-edu-logo.png" alt="공우정 영어" />
    <div class="compact-title">${escapeHtml(p.passageCode)}</div>
    <div class="compact-meta">${modeLabel} · ${p.items.length}문항</div>
    <div class="compact-meta compact-meta-right">학생 <b>${sName}</b> ${sNo} · 점수 ___/${p.items.length} · ${stamp}</div>
  </div>
  ${
    p.items.length === 0
      ? `<div class="compact-empty">출제할 단어가 없습니다.</div>`
      : `<div class="compact-grid">${columns
          .map((col, colIdx) => `<div class="compact-col">${col
            .map((it, i) => renderRow(it, colIdx * rowsPerColumn + i))
            .join("")}</div>`)
          .join("")}</div>`
  }
</div>
`;

  return `<!DOCTYPE html><html lang="ko"><head><title>${escapeHtml(`Unit Words ${p.passageCode}`)}</title><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head><body>${body}<script>try{window.__LOVABLE_PRINT_READY=true;}catch(e){}</script></body></html>`;
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
  /** 본문 단어 평탄화 — 학생 분석 라벨을 단어 위에 그릴 때 사용 */
  units?: FlatWordUnit[];
  /** 학생 owner_progress: ownerId → progress (품사/역할 라벨 원천) */
  studentProgress?: Record<string, AnyProgressLite>;
}

/** owner_id 에서 단어 인덱스 얻기 (단일 토큰 owner: tid::idx) */
const ownerIdToWordIdxLite = (ownerId: string): number | null => {
  const SEP = "::";
  if (ownerId.startsWith("span" + SEP) || ownerId.startsWith("__span__" + SEP)) return null;
  const parts = ownerId.split(SEP);
  const last = parts[parts.length - 1];
  const idx = parseInt(last, 10);
  return Number.isFinite(idx) ? idx : null;
};
/** span owner → [start, end] */
const ownerIdToSpanRange = (ownerId: string): [number, number] | null => {
  const SEP = "::";
  if (!(ownerId.startsWith("span" + SEP) || ownerId.startsWith("__span__" + SEP))) return null;
  const parts = ownerId.split(SEP);
  const range = parts[parts.length - 1];
  const [s, e] = range.split("-").map((n) => parseInt(n, 10));
  if (!Number.isFinite(s) || !Number.isFinite(e)) return null;
  return [s, e];
};

/**
 * 분석 채점본의 "본문(단어 칩 + 라벨) HTML"만 페이지 래퍼 없이 반환.
 * 통합 워크북에서 여러 문장의 분석본을 한 흐름에 붙일 때 사용.
 */
export const buildAnalysisPassageFragment = (p: AnalysisPayload): string => {
  const units = p.units ?? [];
  const studentProgress = p.studentProgress ?? {};
  const ownerStatus = new Map<string, CompareDetailRow["status"]>();
  p.details.forEach((d) => ownerStatus.set(d.ownerId, d.status));

  type WordCell = { label: string; status: CompareDetailRow["status"] | null; ownerId: string | null };
  const cells: WordCell[] = units.map(() => ({ label: "", status: null, ownerId: null }));
  Object.entries(studentProgress).forEach(([ownerId, prog]) => {
    const idx = ownerIdToWordIdxLite(ownerId);
    if (idx == null) return;
    if (idx < 0 || idx >= cells.length) return;
    const lbl = formatProgressLabel(prog);
    if (!lbl) return;
    if (cells[idx].label.length < lbl.length) {
      cells[idx].label = lbl;
      cells[idx].ownerId = ownerId;
      cells[idx].status = ownerStatus.get(ownerId) ?? null;
    }
  });
  Object.entries(studentProgress).forEach(([ownerId, prog]) => {
    const range = ownerIdToSpanRange(ownerId);
    if (!range) return;
    const [s, e] = range;
    const lbl = formatProgressLabel(prog);
    if (!lbl) return;
    if (s < 0 || s >= cells.length) return;
    if (!cells[s].label) {
      cells[s].label = `[${lbl}]`;
      cells[s].ownerId = ownerId;
      cells[s].status = ownerStatus.get(ownerId) ?? null;
    }
    for (let i = s; i <= e && i < cells.length; i++) {
      if (cells[i].status == null) cells[i].status = ownerStatus.get(ownerId) ?? null;
    }
  });

  const renderChip = (u: FlatWordUnit, c: WordCell): string => {
    const w = escapeHtml(u.word);
    if (!u.tokenId) return `<span class="tok static">${w}</span>`;
    const cls = ["tok", "chip"];
    if (c.status === "miss" || c.status === "partial") cls.push("s-bad");
    else if (c.status === "missing") cls.push("s-empty");
    else if (c.status === "extra") cls.push("s-extra");
    else if (c.status === "exact") cls.push("s-ok");
    if (!c.label) cls.push("s-blank");
    const lbl = c.label ? `<span class="lbl">${escapeHtml(c.label)}</span>` : "";
    return `<span class="${cls.join(" ")}">${w}${lbl}</span>`;
  };

  return units.length > 0
    ? `<div class="passage">${units.map((u, i) => renderChip(u, cells[i])).join(" ")}</div>`
    : `<div class="body-text">${escapeHtml(p.english)}</div>`;
};

/** 분석/단어 칩 공용 스타일 (combined workbook 에서 한 번만 inline) */
export const ANALYSIS_CHIP_STYLE = `
  .body-text { line-height: 1.9; font-size: 11pt; padding: 2mm 0; }
  .passage {
    line-height: 2.2; font-size: 11pt; padding: 3mm 0;
    word-spacing: 1.5pt;
  }
  .tok { display: inline-block; vertical-align: baseline; padding: 0 1pt; }
  .tok.static { color: #333; }
  .tok.chip {
    position: relative; padding: 0.4mm 1.2mm 4.5mm 1.2mm;
    margin: 1mm 0.4mm 4mm 0.4mm; border-radius: 1mm;
    border: 0.4pt solid transparent;
  }
  .tok.chip .lbl {
    position: absolute; left: 0; right: 0; bottom: 0.5mm;
    text-align: center; font-size: 6.5pt; line-height: 1;
    color: #000; font-weight: 600; white-space: nowrap;
    overflow: visible;
  }
  .tok.s-ok    { background: #f0f7ee; border-color: #c6deba; }
  .tok.s-bad   { background: #ffe9e9; border-color: #d28a8a; }
  .tok.s-extra { background: #fff7e6; border-color: #d6b87a; }
  .tok.s-empty { background: transparent; border-color: #999; border-style: dashed; }
  .tok.s-blank { color: #555; }
`;

export const buildAnalysisPrintHtml = (p: AnalysisPayload): string => {
  const stamp = nowStamp();
  const sName = p.studentName ? escapeHtml(p.studentName) : "_______";
  const sNo = p.studentNo ? `(${escapeHtml(p.studentNo)})` : "";
  const trans = p.studentTranslation ? escapeHtml(p.studentTranslation) : "(미제출)";

  // ----- ① 본문: 단어 칩 + 학생 분석 라벨 -----
  // 1) 단어 인덱스별로 (학생 라벨, 채점 status) 수집
  const units = p.units ?? [];
  const studentProgress = p.studentProgress ?? {};
  // owner_id → status (마스터키와 비교한 결과)
  const ownerStatus = new Map<string, CompareDetailRow["status"]>();
  p.details.forEach((d) => ownerStatus.set(d.ownerId, d.status));

  // 단어 인덱스별 라벨 (단일 토큰 우선) + status
  type WordCell = { label: string; status: CompareDetailRow["status"] | null; ownerId: string | null };
  const cells: WordCell[] = units.map(() => ({ label: "", status: null, ownerId: null }));
  // 단일 토큰 progress 매핑
  Object.entries(studentProgress).forEach(([ownerId, prog]) => {
    const idx = ownerIdToWordIdxLite(ownerId);
    if (idx == null) return;
    if (idx < 0 || idx >= cells.length) return;
    const lbl = formatProgressLabel(prog);
    if (!lbl) return;
    // 우선순위: 더 길고 구체적인 라벨이 이미 있다면 유지
    if (cells[idx].label.length < lbl.length) {
      cells[idx].label = lbl;
      cells[idx].ownerId = ownerId;
      cells[idx].status = ownerStatus.get(ownerId) ?? null;
    }
  });
  // span progress — 라벨이 비어있는 단어들에만 보조 표기
  // (인쇄 본문은 단어 단위라 span 라벨 한 줄을 첫 단어에 붙임)
  Object.entries(studentProgress).forEach(([ownerId, prog]) => {
    const range = ownerIdToSpanRange(ownerId);
    if (!range) return;
    const [s, e] = range;
    const lbl = formatProgressLabel(prog);
    if (!lbl) return;
    if (s < 0 || s >= cells.length) return;
    // 첫 단어 라벨이 비어있을 때만 'span:' 접두어로 표기
    if (!cells[s].label) {
      cells[s].label = `[${lbl}]`;
      cells[s].ownerId = ownerId;
      cells[s].status = ownerStatus.get(ownerId) ?? null;
    }
    // span 마킹 — 범위 단어들에 status 만 옅게 적용
    for (let i = s; i <= e && i < cells.length; i++) {
      if (cells[i].status == null) cells[i].status = ownerStatus.get(ownerId) ?? null;
    }
  });

  const renderChip = (u: FlatWordUnit, c: WordCell): string => {
    const w = escapeHtml(u.word);
    if (!u.tokenId) {
      // 분석 불가 토큰 (구두점/괄호 등) — 그냥 텍스트
      return `<span class="tok static">${w}</span>`;
    }
    const cls = ["tok", "chip"];
    // status 음영
    if (c.status === "miss" || c.status === "partial") cls.push("s-bad");
    else if (c.status === "missing") cls.push("s-empty");
    else if (c.status === "extra") cls.push("s-extra");
    else if (c.status === "exact") cls.push("s-ok");
    if (!c.label) cls.push("s-blank");
    const lbl = c.label ? `<span class="lbl">${escapeHtml(c.label)}</span>` : "";
    return `<span class="${cls.join(" ")}">${w}${lbl}</span>`;
  };

  const passageHtml = units.length > 0
    ? `<div class="passage">${units.map((u, i) => renderChip(u, cells[i])).join(" ")}</div>`
    : `<div class="body-text">${escapeHtml(p.english)}</div>`;

  // ----- 채점 결과 표 (요약) -----
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
    </div>`;

  const body = `
<style>
  .body-text { line-height: 1.9; font-size: 11pt; padding: 2mm 0; }
  .passage {
    line-height: 2.2; font-size: 11pt; padding: 3mm 0;
    word-spacing: 1.5pt;
  }
  .tok { display: inline-block; vertical-align: baseline; padding: 0 1pt; }
  .tok.static { color: #333; }
  .tok.chip {
    position: relative; padding: 0.4mm 1.2mm 4.5mm 1.2mm;
    margin: 1mm 0.4mm 4mm 0.4mm; border-radius: 1mm;
    border: 0.4pt solid transparent;
  }
  .tok.chip .lbl {
    position: absolute; left: 0; right: 0; bottom: 0.5mm;
    text-align: center; font-size: 6.5pt; line-height: 1;
    color: #000; font-weight: 600; white-space: nowrap;
    overflow: visible;
  }
  .tok.s-ok    { background: #f0f7ee; border-color: #c6deba; }
  .tok.s-bad   { background: #ffe9e9; border-color: #d28a8a; }
  .tok.s-extra { background: #fff7e6; border-color: #d6b87a; }
  .tok.s-empty { background: transparent; border-color: #999; border-style: dashed; }
  .tok.s-blank { color: #555; }
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
  .legend { font-size: 8pt; color: #555; padding: 1mm 0 2mm; }
  .legend .sw { display: inline-block; width: 4mm; height: 2.5mm; border: 0.4pt solid #888; margin: 0 1mm 0 3mm; vertical-align: middle; border-radius: 0.5mm; }
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
    <div class="section-title">① 학생 분석 본문 (단어 아래: 학생이 분석한 품사·역할)</div>
    ${passageHtml}
    <div class="legend">
      <span class="sw" style="background:#f0f7ee"></span>일치
      <span class="sw" style="background:#ffe9e9"></span>불일치
      <span class="sw" style="background:#fff7e6"></span>여분
      <span class="sw" style="background:transparent;border-style:dashed"></span>미분석
    </div>
    <div class="trans"><b>학생 한글해석:</b> ${trans}</div>
  </div>
  ${p.mode === "marked" ? markedBody : blankBody}
</div>
`;
  return wrapDoc(`Analysis ${p.sentenceId}`, body);
};

// ============================================================
// 통합 유닛 워크북 (앞면=영문분석+학생해석 / 뒷면=구조도)
// ============================================================
export interface UnitCombinedItem {
  passageCode: string;
  /** AnalysisPayload — 분석 채점본 데이터(units/studentProgress 포함) */
  analysis: AnalysisPayload;
  /** 학생 한글해석 (없으면 빈 문자열) */
  studentTranslation: string;
}
export interface UnitCombinedPayload {
  unitTitle: string;
  unitCode: string;
  studentName: string | null;
  studentNo: string | null;
  items: UnitCombinedItem[];
}

export const buildUnitCombinedWorkbookHtml = (p: UnitCombinedPayload): string => {
  const stamp = nowStamp();
  const sName = p.studentName ? escapeHtml(p.studentName) : "_______";
  const sNo = p.studentNo ? `(${escapeHtml(p.studentNo)})` : "";
  const headerMeta = `${escapeHtml(p.unitCode)} · 학생: ${sName} ${sNo}`;

  // 앞면: 모든 지문을 하나의 박스에 (문장별 줄바꿈만 유지), 한글해석도 한 박스에 모음
  const passageBlocks = p.items
    .map((it, i) => {
      const passageHtml = buildAnalysisPassageFragment(it.analysis);
      return `
        <div class="cb-prow">
          <div class="cb-pnum">${i + 1}.</div>
          <div class="cb-pbody">
            <div class="cb-pcode">${escapeHtml(it.passageCode)}</div>
            ${passageHtml}
          </div>
        </div>`;
    })
    .join("");

  const transBlocks = p.items
    .map((it, i) => {
      const koRaw = it.studentTranslation && it.studentTranslation.trim();
      const ko = koRaw
        ? escapeHtml(it.studentTranslation)
        : '<span class="muted">(미제출)</span>';
      return `
        <div class="cb-trow">
          <span class="cb-tnum">${i + 1}.</span>
          <span class="cb-tcode">${escapeHtml(it.passageCode)}</span>
          <span class="cb-ttext">${ko}</span>
        </div>`;
    })
    .join("");

  const structurePage = `
<div class="page cb-back">
  <div class="header">
    <div>
      <div class="eyebrow">Gongwoojeong · Unit Wrap-up</div>
      <div class="title">유닛 마무리 · ${escapeHtml(p.unitTitle)}</div>
      <div class="meta">${headerMeta}</div>
    </div>
    <div class="meta" style="text-align:right">
      <div>출력: ${stamp}</div>
      <div>구조도 · 지스트 · 영작 · 정독해석 · 재영작</div>
    </div>
  </div>
  <div class="section">
    <div class="section-title">① 구조도</div>
    <div class="cb-grid"></div>
  </div>
  <div class="section">
    <div class="section-title">② 지스트 (주제문장)</div>
    <div class="cb-write cb-write-wide">
      <div class="cb-line"></div><div class="cb-line"></div>
    </div>
  </div>
  <div class="section">
    <div class="section-title">③ 영작</div>
    <div class="cb-write cb-write-wide">
      <div class="cb-line"></div><div class="cb-line"></div>
    </div>
  </div>
  <div class="section">
    <div class="section-title">④ 정독해석</div>
    <div class="cb-write cb-write-wide">
      <div class="cb-line"></div><div class="cb-line"></div>
    </div>
  </div>
  <div class="section">
    <div class="section-title">⑤ 재영작</div>
    <div class="cb-write cb-write-wide">
      <div class="cb-line"></div><div class="cb-line"></div>
    </div>
  </div>
</div>`;

  const body = `
<style>
  ${ANALYSIS_CHIP_STYLE}
  .cb-passage-page { padding: 4mm 5mm; }
  .cb-front .section-title {
    font-size: 9pt; font-weight: 700; margin: 0.5mm 0 1mm;
    border-left: 2pt solid #000; padding-left: 2mm;
  }
  .cb-front { margin-bottom: 2mm; }
  /* 앞면: 분석 본문 통합 박스 */
  .cb-passages {
    border: 0.5pt solid #000; padding: 1.5mm 2.8mm;
  }
  .cb-prow {
    display: flex; gap: 1.5mm; padding: 0.6mm 0;
    border-bottom: 0.3pt dashed #bbb;
  }
  .cb-prow:last-child { border-bottom: none; }
  .cb-pnum { font-weight: 700; font-size: 8.5pt; color: #333; min-width: 4.5mm; padding-top: 0.4mm; }
  .cb-pbody { flex: 1; min-width: 0; }
  .cb-pcode {
    font-size: 6.5pt; color: #888; font-family: ui-monospace, "SF Mono", Menlo, monospace;
    margin-bottom: 0.3mm; letter-spacing: -0.02em;
  }
  .cb-pbody .passage,
  .cb-pbody .body-text {
    padding: 0 !important; margin: 0;
    line-height: 1.55 !important; font-size: 9pt !important;
    letter-spacing: 0; word-spacing: 0.02em;
  }
  /* 앞면: 한글해석 통합 박스 */
  .cb-trans-box {
    border: 0.5pt solid #000; padding: 1.3mm 2.8mm;
    font-size: 9pt; line-height: 1.55; color: #222; letter-spacing: 0;
  }
  .cb-trow { padding: 0.6mm 0; border-bottom: 0.3pt dashed #ccc; }
  .cb-trow:last-child { border-bottom: none; }
  .cb-tnum { font-weight: 700; margin-right: 1mm; }
  .cb-tcode {
    font-size: 6.5pt; color: #888; margin-right: 1.5mm;
    font-family: ui-monospace, "SF Mono", Menlo, monospace; letter-spacing: -0.02em;
  }
  .cb-ttext { white-space: pre-wrap; }
  .cb-ttext .muted { color: #888; }
  .cb-empty { padding: 4mm; text-align: center; font-size: 10pt; color: #777; }

  /* 뒷면 */
  .cb-back { padding: 0 0 4mm; }
  .cb-back .section { padding: 2mm 5mm; }
  .cb-back .section-title {
    font-size: 9.5pt; font-weight: 700; margin-bottom: 1mm;
    border-left: 2pt solid #000; padding-left: 2mm;
  }
  .cb-grid {
    min-height: 70mm;
    background-image:
      linear-gradient(#bbb 0.3pt, transparent 0.3pt),
      linear-gradient(90deg, #bbb 0.3pt, transparent 0.3pt);
    background-size: 4mm 4mm;
    border: 0.5pt solid #000;
  }
  .cb-write { display: flex; flex-direction: column; gap: 5mm; padding-top: 2mm; }
  .cb-write-wide { gap: 9mm; padding-top: 2mm; padding-bottom: 0.5mm; }
  .cb-line { border-bottom: 0.5pt solid #000; height: 0; }
</style>

<div class="page cb-passage-page">
  <div class="header">
    <div>
      <div class="eyebrow">Gongwoojeong · Unit Workbook</div>
      <div class="title">유닛 통합 워크북 · ${escapeHtml(p.unitTitle)}</div>
      <div class="meta">${headerMeta}</div>
    </div>
    <div class="meta" style="text-align:right">
      <div>출력: ${stamp}</div>
      <div>지문 ${p.items.length}건 · 앞면</div>
    </div>
  </div>
  <div class="section cb-front">
    <div class="section-title">① 본문 (학생 분석)</div>
    <div class="cb-passages">
      ${passageBlocks || '<div class="cb-empty">(완료 지문 없음)</div>'}
    </div>
  </div>
  <div class="section cb-front">
    <div class="section-title">② 학생 한글해석</div>
    <div class="cb-trans-box">
      ${transBlocks || '<div class="cb-empty">(미제출)</div>'}
    </div>
  </div>
</div>

${structurePage}
`;
  return wrapDoc(`UnitWorkbook ${p.unitCode}`, body);
};


// ============================================================
// gradeMeta — 선생님 평가 등급의 라벨/색상 메타
//
// DB·auth 의존성이 없는 순수 모듈. 화면 UI(sentenceApprovals)와
// 인쇄 템플릿(printTemplates/unitWorkbook)이 같은 라벨을 쓰도록
// 여기에만 정의한다.
// ============================================================

export type ApprovalGrade = "excellent" | "good" | "fair" | "poor" | "redo" | "coach";

export const GRADE_LABEL: Record<ApprovalGrade, string> = {
  excellent: "매우잘함",
  good: "잘함",
  fair: "보통",
  poor: "미흡",
  redo: "재학습",
  coach: "코칭",
};

export const GRADE_ORDER: ApprovalGrade[] = [
  "excellent",
  "good",
  "fair",
  "poor",
  "coach",
  "redo",
];

/** DB에 stored된 값이 알려진 등급인지 (레거시/미발매 값 차단) */
export const isApprovalGrade = (v: unknown): v is ApprovalGrade =>
  typeof v === "string" && Object.prototype.hasOwnProperty.call(GRADE_LABEL, v);

const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** 인쇄용 배경/테두리 — 흑백 복습지에서도 구분되도록 진한 테두리 + 연한 배경 */
const PRINT_STYLE: Record<ApprovalGrade, string> = {
  excellent: "background:#e7f6ee;border:0.4pt solid #1a7f4b;color:#0f5f38;",
  good: "background:#e8f1fb;border:0.4pt solid #1f6fb5;color:#124e80;",
  fair: "background:#fdf3d8;border:0.4pt solid #b58500;color:#7a5a00;",
  poor: "background:#fdeadd;border:0.4pt solid #c2620f;color:#8a4409;",
  redo: "background:#fde8ec;border:0.4pt solid #c2274a;color:#8f1a35;",
  coach: "background:#f3ecfd;border:0.4pt solid #7c3aed;color:#4c1d95;",
};

/**
 * 인쇄(워크북·핸드아웃)에서 배지를 빼는 등급.
 * "잘함"은 별도 표기 가치가 없다고 본 — 매우잘함/보통 이하만 남긴다.
 * 화면 UI 배지는 이 규칙의 영향을 받지 않는다.
 */
export const PRINT_HIDDEN_GRADES: readonly ApprovalGrade[] = ["good"];

/**
 * 인쇄 HTML용 등급 배지.
 * 클래스가 아니라 인라인 스타일 — 멀티 유닛 결합 시 <body> 만 추출해
 * 이어붙여도(doc 스타일 유실) 모양이 유지된다.
 */
export const gradeBadgeHtml = (grade: string | null | undefined): string => {
  if (!isApprovalGrade(grade)) return "";
  if (PRINT_HIDDEN_GRADES.includes(grade)) return "";
  return (
    `<span style="display:inline-block;font-size:6.5pt;font-weight:800;` +
    `border-radius:1mm;padding:0 1.2mm;margin-left:1.5mm;vertical-align:0.2mm;` +
    `-webkit-print-color-adjust:exact;print-color-adjust:exact;${PRINT_STYLE[grade]}">` +
    `${escapeHtml(GRADE_LABEL[grade])}</span>`
  );
};

/**
 * 인쇄 HTML용 재학습 회차 배지.
 * sentence_approvals.attempt_no = 1 은 처음 학습(재학습 없음) → 배지 없음.
 * attempt_no = 2 → "재학습 1회", 3 → "재학습 2회".
 * 흑백 복습지에서도 남도록 먹색 칩.
 */
export const redoRoundBadgeHtml = (attemptNo: number | null | undefined): string => {
  const rounds =
    typeof attemptNo === "number" && Number.isFinite(attemptNo)
      ? Math.floor(attemptNo) - 1
      : 0;
  if (rounds < 1) return "";
  return (
    `<span style="display:inline-block;font-size:6.5pt;font-weight:800;` +
    `border-radius:1mm;padding:0 1.2mm;margin-left:1.5mm;vertical-align:0.2mm;` +
    `-webkit-print-color-adjust:exact;print-color-adjust:exact;` +
    `background:#ededed;border:0.4pt solid #444;color:#111;">` +
    `재학습 ${rounds}회</span>`
  );
};

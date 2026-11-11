// ============================================================
// classSessionMeta — 수업 기록 요약·라벨 (DB/auth 의존성 없는 순수 모듈)
//   화면과 인쇄 템플릿이 같은 문구를 쓰도록 여기에만 정의한다.
// ============================================================
const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export interface ClassSession {
  user_id: string;
  sentence_id: string;
  approval_id: string | null;
  teacher_id: string | null;
  held_at: string;
}

export interface ClassSessionSummary {
  count: number;
  lastAt: string;
  lastTeacherId: string | null;
}

/** 문장별 수업 횟수와 가장 최근 수업 */
export function summarizeClassSessions(rows: ClassSession[]): Map<string, ClassSessionSummary> {
  const map = new Map<string, ClassSessionSummary>();
  for (const r of rows) {
    const cur = map.get(r.sentence_id);
    if (!cur) map.set(r.sentence_id, { count: 1, lastAt: r.held_at, lastTeacherId: r.teacher_id });
    else {
      cur.count += 1;
      if (r.held_at > cur.lastAt) { cur.lastAt = r.held_at; cur.lastTeacherId = r.teacher_id; }
    }
  }
  return map;
}

/** 서울 기준 "11/10" */
export function classDateLabel(iso: string): string {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric" }).formatToParts(d);
  const m = parts.find((p) => p.type === "month")?.value ?? "";
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  return `${m}/${day}`;
}

/** "수업 11/10" · 여러 번이면 "수업 2회 · 11/10" */
export function classSessionLabel(s: ClassSessionSummary | null | undefined): string {
  if (!s || s.count < 1) return "";
  const date = classDateLabel(s.lastAt);
  return s.count > 1 ? `수업 ${s.count}회 · ${date}` : `수업 ${date}`;
}

/** 인쇄용 배지 — 흑백에서도 보이도록 테두리 칩 */
export function classSessionBadgeHtml(s: ClassSessionSummary | null | undefined): string {
  const label = classSessionLabel(s);
  if (!label) return "";
  return (
    `<span style="display:inline-block;font-size:6.5pt;font-weight:800;` +
    `border-radius:1mm;padding:0 1.2mm;margin-left:1.5mm;vertical-align:0.2mm;` +
    `-webkit-print-color-adjust:exact;print-color-adjust:exact;` +
    `background:#fff;border:0.6pt dashed #222;color:#111;">` +
    `${escapeHtml(label)}</span>`
  );
}

/** 리포트용: "수업 2일 · 5문장 (11/10, 11/12)" — 같은 날 여러 문장은 하루로 센다 */
export function classSessionsReportText(rows: { sentenceId: string; heldAt: string }[]): string {
  if (!rows.length) return "";
  const dates = [...new Set([...rows].sort((a, b) => a.heldAt.localeCompare(b.heldAt)).map((r) => classDateLabel(r.heldAt)))];
  const sentences = new Set(rows.map((r) => r.sentenceId)).size;
  return `수업 ${dates.length}일 · ${sentences}문장 (${dates.join(", ")})`;
}

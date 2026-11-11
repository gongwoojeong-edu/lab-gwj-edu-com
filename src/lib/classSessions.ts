// ============================================================
// classSessions — "수업에서 다룬 문장" 기록 (수업 완료 때마다 한 줄씩 쌓임)
//   · 재제출 첨삭창 / 학생 재학습 화면 / 워크북 / 리포트가 모두 여기서 읽는다.
// ============================================================
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPages, fetchInChunks } from "@/lib/paginatedQuery";
import { escapeHtml } from "@/lib/printTemplates";

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

const COLS = "user_id,sentence_id,approval_id,teacher_id,held_at";

/** 학생 1명의 여러 문장 수업 기록 */
export async function fetchClassSessions(userId: string, sentenceIds: string[]): Promise<ClassSession[]> {
  const ids = [...new Set(sentenceIds)].filter(Boolean);
  if (!userId || !ids.length) return [];
  return fetchInChunks(ids, (chunk) =>
    fetchAllPages<ClassSession>((from, to) =>
      supabase.from("class_session_attendance").select(COLS)
        .eq("user_id", userId).in("sentence_id", chunk)
        .order("held_at").order("id").range(from, to) as never));
}

/** 기간 안에 열린 수업 기록 (리포트용) */
export async function fetchClassSessionsInPeriod(startIso: string, endIso: string): Promise<ClassSession[]> {
  return fetchAllPages<ClassSession>((from, to) =>
    supabase.from("class_session_attendance").select(COLS)
      .gte("held_at", startIso).lte("held_at", endIso)
      .order("held_at").order("id").range(from, to) as never);
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

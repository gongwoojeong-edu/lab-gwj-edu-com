// ============================================================
// assignmentDue — 과제 마감일 (null = 무기한) 공통 처리
// ============================================================

/** 마감 미경과 또는 마감일 없음(무기한) */
export function isAssignmentActive(
  dueAt: string | null | undefined,
  now = new Date(),
): boolean {
  if (dueAt == null || dueAt === "") return true;
  return new Date(dueAt) >= now;
}

/** Supabase `.or()` — 활성 과제 (마감 미경과 + 무기한) */
export function activeAssignmentDueOrFilter(nowIso: string): string {
  return `due_at.gte.${nowIso},due_at.is.null`;
}

export function resolveDueAtEndOfDay(dueDate: Date | undefined): string | null {
  if (!dueDate) return null;
  const endOfDay = new Date(dueDate);
  endOfDay.setHours(23, 59, 59, 999);
  return endOfDay.toISOString();
}

export function formatAssignmentRemaining(
  dueAt: string | null | undefined,
): { text: string; urgent: boolean } {
  if (!dueAt) return { text: "무기한", urgent: false };
  const ms = new Date(dueAt).getTime() - Date.now();
  if (ms < 0) return { text: "마감", urgent: true };
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  return {
    text: days > 0 ? `${days}일 ${hours}시간 남음` : `${hours}시간 남음`,
    urgent: days < 1,
  };
}

export function formatAssignmentDueLabel(dueAt: string | null | undefined): string {
  if (!dueAt) return "무기한";
  const d = new Date(dueAt);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 마감일 가까운 순 (무기한은 맨 뒤) */
export function compareAssignmentDue(
  a: string | null | undefined,
  b: string | null | undefined,
): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return new Date(a).getTime() - new Date(b).getTime();
}

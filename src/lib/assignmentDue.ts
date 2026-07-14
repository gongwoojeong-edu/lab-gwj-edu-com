// ============================================================
// assignmentDue — 과제 마감일 표시용 공통 처리
// 정책: 마감일은 학생에게 알려주는 안내일 뿐이며, 학습 진행·과제 노출에
//       영향을 주지 않는다. (지난 과제도 미완료면 계속 학습 가능)
// ============================================================

/**
 * @deprecated 마감일은 학습 가능 여부와 무관. 항상 true.
 * 기존 호출부 호환용으로 남겨 둠.
 */
export function isAssignmentActive(
  _dueAt?: string | null,
  _now?: Date,
): boolean {
  return true;
}

/**
 * @deprecated 마감 필터 사용 금지. 호출부에서는 이 필터를 붙이지 마세요.
 * 호환용: 항상 매칭되는 더미 OR (due_at 유무 모두).
 */
export function activeAssignmentDueOrFilter(_nowIso?: string): string {
  return "due_at.is.null,due_at.not.is.null";
}

export function resolveDueAtEndOfDay(dueDate: Date | undefined): string | null {
  if (!dueDate) return null;
  const endOfDay = new Date(dueDate);
  endOfDay.setHours(23, 59, 59, 999);
  return endOfDay.toISOString();
}

/** 학생/선생님 화면 표시용 — 학습 차단과 무관 */
export function formatAssignmentRemaining(
  dueAt: string | null | undefined,
): { text: string; urgent: boolean } {
  if (!dueAt) return { text: "마감 안내 없음", urgent: false };
  const ms = new Date(dueAt).getTime() - Date.now();
  if (ms < 0) return { text: "안내 마감일 지남", urgent: false };
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  return {
    text: days > 0 ? `안내 ${days}일 ${hours}시간 남음` : `안내 ${hours}시간 남음`,
    urgent: days < 1,
  };
}

export function formatAssignmentDueLabel(dueAt: string | null | undefined): string {
  if (!dueAt) return "마감 안내 없음";
  const d = new Date(dueAt);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 마감일 가까운 순 (안내일 없음은 맨 뒤) — 정렬용일 뿐 필터 아님 */
export function compareAssignmentDue(
  a: string | null | undefined,
  b: string | null | undefined,
): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return new Date(a).getTime() - new Date(b).getTime();
}

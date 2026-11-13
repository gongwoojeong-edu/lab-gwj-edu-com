// 퇴원생(오르빗 영어반 등록 해제) 제출은 승인 대기·보류함·배지에서 뺀다.
// 기록은 지우지 않고 화면에서만 숨기므로, 다시 등록되면 그대로 돌아온다.
// 선생님·관리자 본인 계정(모의수업 등)은 등록 여부와 무관하게 남긴다.

export interface EnrollmentRow { user_id: string; orbit_enrollment_active: boolean | null }

/** 퇴원 상태인 학생 id — 선생님·관리자 계정은 제외 */
export function withdrawnStudentIds(profiles: EnrollmentRow[], staffIds: Iterable<string>): Set<string> {
  const staff = new Set(staffIds);
  return new Set(profiles.filter(p => p.orbit_enrollment_active === false && !staff.has(p.user_id)).map(p => p.user_id));
}

export function excludeWithdrawn<T extends { user_id: string }>(rows: T[], withdrawn: Set<string>): T[] {
  if (!withdrawn.size) return rows;
  return rows.filter(r => !withdrawn.has(r.user_id));
}

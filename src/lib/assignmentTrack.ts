// ============================================================
// assignmentTrack — Path A: 과제를 내신/특별로 표시 구분
// (DB track 컬럼 없이 휴리스틱. 이후 exam_tag 등으로 교체 가능)
// 학생 홈·선생님 과제함·오늘 등원자 라벨을 동일 헬퍼로 통일.
// ============================================================

export type AssignmentTrack = "naeshin" | "special";

/** 뱃지/칩용 짧은 라벨 — 학생·선생님 동일 */
export const ASSIGNMENT_TRACK_LABEL: Record<AssignmentTrack, string> = {
  naeshin: "내신",
  special: "특별",
};

/** 섹션 제목 등 긴 라벨 */
export const ASSIGNMENT_TRACK_SECTION_LABEL: Record<AssignmentTrack, string> = {
  naeshin: "내신",
  special: "특별과제",
};

/**
 * 같은 시퀀스(제목+교재)에 문장이 여러 개면 내신 진도처럼 표시.
 * [재시험]/[재학습] 또는 단독 1건 단기 성격이면 특별.
 */
export function classifyAssignmentTrack(opts: {
  title: string;
  groupSize: number;
}): AssignmentTrack {
  const t = (opts.title ?? "").trim();
  if (/^\[재시험\]|^\[재학습\]/i.test(t)) return "special";
  if (opts.groupSize > 1) return "naeshin";
  // 단독 1건: 제목에 과/단원 패턴이면 내신, 아니면 특별
  if (/\d+\s*과|\bunit\b|단원/i.test(t)) return "naeshin";
  return "special";
}

export function assignmentTrackBadgeLabel(track: AssignmentTrack): string {
  return ASSIGNMENT_TRACK_LABEL[track];
}

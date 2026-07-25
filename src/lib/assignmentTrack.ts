// ============================================================
// assignmentTrack — Path A: 특별과제를 내신/특별로 표시 구분
// (DB track 컬럼 없이 휴리스틱. 이후 exam_tag 등으로 교체 가능)
// ============================================================

export type AssignmentTrack = "naeshin" | "special";

export const ASSIGNMENT_TRACK_LABEL: Record<AssignmentTrack, string> = {
  naeshin: "내신",
  special: "특별과제",
};

/**
 * 같은 시퀀스(제목+교재)에 문장이 여러 개면 내신 진도처럼 표시.
 * [재시험]/[재학습] 또는 단독 1건 단기 성격이면 특별과제.
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

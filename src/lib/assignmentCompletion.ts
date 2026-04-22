// ============================================================
// assignmentCompletion — 과제의 "완료" 판정 헬퍼
// 활성 과제 vs 과제함 분리 기준:
//   - 완료(done)  : 포함된 모든 단계가 모든 대상 학생에 대해 통과
//                   (analysis/wordtest는 status==="pass", pre/translation은 status==="done")
//   - 미완료(active): 그 외 (대상 1명이라도 미달)
//
// 활성 목록은 "마감 전 ∪ (마감 후이지만 미완료)" 모두 보여주고,
// 과제함은 "완료된 항목"만 보여준다. → 마감되었어도 미완료면 활성에 잔존.
// ============================================================
import type { AssignmentProgressMap } from "./assignmentProgress";

export interface AssignmentLike {
  id: string;
  student_id: string | null;
  include_pre: boolean;
  include_analysis: boolean;
  include_translation: boolean;
  include_wordtest: boolean;
}

/**
 * 한 학생의 단계별 진척이 해당 과제 기준으로 통과인지 판정.
 */
const userPassedAssignment = (
  asg: AssignmentLike,
  progress: AssignmentProgressMap | undefined,
  userId: string,
): boolean => {
  if (!progress) return false;
  const p = progress.get(userId);
  if (!p) return false;
  if (asg.include_pre && p.pre.status !== "done" && p.pre.status !== "pass") return false;
  if (asg.include_analysis && p.analysis.status !== "pass") return false;
  if (asg.include_translation && p.translation.status !== "done") return false;
  if (asg.include_wordtest && p.wordtest.status !== "pass") return false;
  return true;
};

/**
 * 과제 전체 완료 여부 — 모든 대상 학생이 통과해야 true.
 * 대상 학생이 0명이면 false (의미 없음).
 */
export const isAssignmentDone = (
  asg: AssignmentLike,
  progress: AssignmentProgressMap | undefined,
  allStudentIds: string[],
): boolean => {
  const targets = asg.student_id ? [asg.student_id] : allStudentIds;
  if (targets.length === 0) return false;
  // 단계가 하나도 포함되지 않은 과제는 완료 판정 불가 → 활성에 둠
  if (
    !asg.include_pre &&
    !asg.include_analysis &&
    !asg.include_translation &&
    !asg.include_wordtest
  ) {
    return false;
  }
  return targets.every((uid) => userPassedAssignment(asg, progress, uid));
};

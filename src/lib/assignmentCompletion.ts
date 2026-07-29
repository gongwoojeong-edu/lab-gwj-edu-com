// ============================================================
// assignmentCompletion — 과제의 "완료" 판정 헬퍼
// 활성 과제 vs 과제함 분리 기준:
//   - 완료(done)  : 포함된 모든 단계가 모든 대상 학생에 대해 통과
//                   (analysis/wordtest는 status==="pass", pre/translation은 status==="done")
//   - 미완료(active): 그 외 (대상 1명이라도 미달)
//
// 활성 목록은 미완료만 보여준다. 마감일은 안내용일 뿐 목록·학습에 영향 없음.
// 과제함은 "완료된 항목"만 보여준다.
// ============================================================
import type { AssignmentProgressMap } from "./assignmentProgress";

import {
  deriveTaskModeFromSteps,
  taskModeIncludesMemorize,
  type TaskMode,
} from "@/lib/taskMode";

export interface AssignmentLike {
  id: string;
  student_id: string | null;
  include_pre: boolean;
  include_analysis: boolean;
  include_translation: boolean;
  include_wordtest: boolean;
  task_mode?: TaskMode | null;
}

const resolveAssignmentMode = (asg: AssignmentLike): TaskMode =>
  asg.task_mode ??
  deriveTaskModeFromSteps({
    includePre: asg.include_pre,
    includeAnalysis: asg.include_analysis,
    includeTranslation: asg.include_translation,
    includeWordtest: asg.include_wordtest,
    includeMemorize: false,
  });

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
  // 학생 홈과 동일: 선생님 승인(pass)이면 단계 플래그와 무관하게 완료
  if (p.progressStatus === "pass") return true;
  const mode = resolveAssignmentMode(asg);
  const needsAnalysis = mode !== "memorize_only";
  const needsMem = taskModeIncludesMemorize(mode);

  if (needsAnalysis) {
    if (asg.include_pre && p.pre.status !== "done" && p.pre.status !== "pass") return false;
    if (asg.include_analysis && p.analysis.status !== "pass" && p.analysis.status !== "done") return false;
    if (asg.include_translation && p.translation.status !== "done") return false;
    if (asg.include_wordtest && p.wordtest.status !== "pass" && p.wordtest.status !== "done") return false;
  }
  if (needsMem && p.mem.status !== "pass") return false;
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
  const mode = resolveAssignmentMode(asg);
  const hasAnalysisSteps =
    mode !== "memorize_only" &&
    (asg.include_pre ||
      asg.include_analysis ||
      asg.include_translation ||
      asg.include_wordtest);
  const hasMem = taskModeIncludesMemorize(mode);
  if (!hasAnalysisSteps && !hasMem) return false;
  return targets.every((uid) => userPassedAssignment(asg, progress, uid));
};

// ============================================================
// taskMode — 분석만 / 암기만 / 분석+암기 resolve (선생님 설정 전용)
// ============================================================
import { isAssignmentActive } from "@/lib/assignmentDue";

export type TaskMode = "analysis_only" | "memorize_only" | "analysis_and_memorize";

export const TASK_MODES: TaskMode[] = [
  "analysis_only",
  "memorize_only",
  "analysis_and_memorize",
];

export const TASK_MODE_LABEL: Record<TaskMode, string> = {
  analysis_only: "분석만",
  memorize_only: "암기만",
  analysis_and_memorize: "분석+암기",
};

export const TASK_MODE_SHORT: Record<TaskMode, string> = {
  analysis_only: "분석",
  memorize_only: "암기",
  analysis_and_memorize: "분석+암기",
};

export const DEFAULT_TASK_MODE: TaskMode = "analysis_and_memorize";

/** 특별과제 학습 단계 체크박스 → task_mode (별도 드롭다운 불필요) */
export function deriveTaskModeFromSteps(opts: {
  includePre: boolean;
  includeAnalysis: boolean;
  includeTranslation: boolean;
  includeWordtest: boolean;
  includeMemorize: boolean;
}): TaskMode {
  const hasAnalysis =
    opts.includePre ||
    opts.includeAnalysis ||
    opts.includeTranslation ||
    opts.includeWordtest;
  if (opts.includeMemorize && !hasAnalysis) return "memorize_only";
  if (opts.includeMemorize && hasAnalysis) return "analysis_and_memorize";
  return "analysis_only";
}

export function taskModeIncludesMemorize(mode: TaskMode | null | undefined): boolean {
  return mode === "memorize_only" || mode === "analysis_and_memorize";
}

export interface TaskModeAssignmentRow {
  sentence_id: string | null;
  unit_id: string | null;
  task_mode: TaskMode | null;
  due_at: string | null;
}

export interface ResolveTaskModeInput {
  unitDefault: TaskMode;
  passageTaskMode: TaskMode | null;
  studentOverride: TaskMode | null;
  /** 마감 미경과 과제 — sentence 또는 unit 매칭 */
  assignments: TaskModeAssignmentRow[];
  sentenceId: string;
  unitId: string | null;
  now?: Date;
}

/** ④ 과제 > ③ 학생 override > ② 지문 > ① 유닛 */
export function resolveTaskMode(input: ResolveTaskModeInput): TaskMode {
  const now = input.now ?? new Date();
  const active = input.assignments.filter((a) => {
    if (!a.task_mode) return false;
    return isAssignmentActive(a.due_at, now);
  });

  const sentenceHit = active.find(
    (a) => a.sentence_id === input.sentenceId && a.task_mode,
  );
  if (sentenceHit?.task_mode) return sentenceHit.task_mode;

  if (input.unitId) {
    const unitHit = active.find(
      (a) =>
        a.unit_id === input.unitId &&
        !a.sentence_id &&
        a.task_mode,
    );
    if (unitHit?.task_mode) return unitHit.task_mode;
  }

  if (input.studentOverride) return input.studentOverride;
  if (input.passageTaskMode) return input.passageTaskMode;
  return input.unitDefault;
}

export function showsAnalysisLearn(mode: TaskMode): boolean {
  return mode === "analysis_only" || mode === "analysis_and_memorize";
}

export function showsMemorizeLearn(mode: TaskMode, analysisPassed: boolean): boolean {
  if (mode === "memorize_only") return true;
  if (mode === "analysis_and_memorize") return analysisPassed;
  return false;
}

/** 학생 학습 진입 경로 */
export function learnPathForSentence(
  sentenceId: string,
  mode: TaskMode,
  analysisPassed: boolean,
): string {
  const enc = encodeURIComponent(sentenceId);
  if (mode === "memorize_only") {
    return `/learn/sentence/${enc}/memorize`;
  }
  if (mode === "analysis_and_memorize" && analysisPassed) {
    return `/learn/sentence/${enc}/memorize`;
  }
  return `/learn/sentence/${enc}`;
}

export function startButtonLabel(mode: TaskMode, analysisPassed: boolean): string {
  if (mode === "memorize_only") return "문장암기 시작";
  if (mode === "analysis_only") return "구문 학습 시작";
  if (analysisPassed) return "문장암기 시작";
  return "구문 학습 시작";
}

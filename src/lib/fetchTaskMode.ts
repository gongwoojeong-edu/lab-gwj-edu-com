// ============================================================
// fetchTaskModeForSentence — DB에서 task_mode resolve 입력 수집
// ============================================================
import { supabase } from "@/integrations/supabase/client";
import { getCurrentUserId } from "@/lib/authState";
import {
  DEFAULT_TASK_MODE,
  resolveTaskMode,
  type TaskMode,
  type TaskModeAssignmentRow,
} from "@/lib/taskMode";
import { activeAssignmentDueOrFilter } from "@/lib/assignmentDue";

export interface SentenceTaskContext {
  taskMode: TaskMode;
  unitId: string | null;
  unitDefault: TaskMode;
  passageTaskMode: TaskMode | null;
}

export async function fetchTaskModeForSentence(
  sentenceId: string,
): Promise<SentenceTaskContext> {
  const userId = await getCurrentUserId();

  const { data: passageRow } = await supabase
    .from("textbook_passages")
    .select("unit_id, task_mode")
    .eq("code", sentenceId)
    .maybeSingle();

  const rec = passageRow as { unit_id: string; task_mode: TaskMode | null } | null;
  const unitId = rec?.unit_id ?? null;
  const passageTaskMode = rec?.task_mode ?? null;

  let unitDefault: TaskMode = DEFAULT_TASK_MODE;
  if (unitId) {
    const { data: unitRow } = await supabase
      .from("textbook_units")
      .select("default_task_mode")
      .eq("id", unitId)
      .maybeSingle();
    unitDefault =
      ((unitRow as { default_task_mode?: TaskMode } | null)?.default_task_mode) ??
      DEFAULT_TASK_MODE;
  }

  let studentOverride: TaskMode | null = null;
  if (userId) {
    const { data: ov } = await supabase
      .from("student_passage_overrides")
      .select("task_mode")
      .eq("user_id", userId)
      .eq("sentence_id", sentenceId)
      .maybeSingle();
    studentOverride =
      ((ov as { task_mode: TaskMode | null } | null)?.task_mode) ?? null;
  }

  const nowIso = new Date().toISOString();
  let assignQuery = supabase
    .from("assignments")
    .select("sentence_id, unit_id, task_mode, due_at")
    .or(activeAssignmentDueOrFilter(nowIso));

  if (userId) {
    assignQuery = assignQuery.or(`student_id.eq.${userId},student_id.is.null`);
  } else {
    assignQuery = assignQuery.is("student_id", null);
  }

  const { data: assignRows } = await assignQuery;
  const assignments = ((assignRows ?? []) as TaskModeAssignmentRow[]).filter(
    (a) =>
      a.task_mode &&
      (a.sentence_id === sentenceId ||
        (unitId && a.unit_id === unitId && !a.sentence_id)),
  );

  const taskMode = resolveTaskMode({
    unitDefault,
    passageTaskMode,
    studentOverride,
    assignments,
    sentenceId,
    unitId,
  });

  return { taskMode, unitId, unitDefault, passageTaskMode };
}

export async function fetchTaskModesForSentences(
  sentenceIds: string[],
): Promise<Record<string, TaskMode>> {
  const out: Record<string, TaskMode> = {};
  await Promise.all(
    sentenceIds.map(async (id) => {
      const ctx = await fetchTaskModeForSentence(id);
      out[id] = ctx.taskMode;
    }),
  );
  return out;
}

import { supabase } from "@/integrations/supabase/client";
import { getCurrentUserId } from "@/lib/authState";
import { summarizeUnitProgress } from "@/lib/unitWorkbook";

export type UnitWorkflowStatus =
  | "learning"
  | "print_pending"
  | "printed"
  | "workbook_submitted"
  | "completed";

export type TeacherGrade = "A" | "B" | "C" | "D" | "E";

export interface UnitWorkflowRow {
  user_id: string;
  unit_id: string;
  status: UnitWorkflowStatus;
  print_requested_at: string | null;
  printed_at: string | null;
  printed_by: string | null;
  workbook_submitted_at: string | null;
  teacher_grade: TeacherGrade | null;
  teacher_memo: string | null;
  completed_at: string | null;
  completed_by: string | null;
  created_at: string;
  updated_at: string;
}

export async function fetchUnitWorkflow(
  userId: string,
  unitId: string,
): Promise<UnitWorkflowRow | null> {
  const { data } = await supabase
    .from("unit_workflows")
    .select("*")
    .eq("user_id", userId)
    .eq("unit_id", unitId)
    .maybeSingle();
  return (data as UnitWorkflowRow | null) ?? null;
}

export async function fetchUnitWorkflowsForUser(
  userId: string,
): Promise<Record<string, UnitWorkflowRow>> {
  const { data } = await supabase
    .from("unit_workflows")
    .select("*")
    .eq("user_id", userId);
  const map: Record<string, UnitWorkflowRow> = {};
  ((data ?? []) as UnitWorkflowRow[]).forEach((r) => {
    map[r.unit_id] = r;
  });
  return map;
}

export async function fetchPendingUnitPrintWorkflows(): Promise<UnitWorkflowRow[]> {
  const { data, error } = await supabase
    .from("unit_workflows")
    .select("*")
    .eq("status", "print_pending")
    .order("print_requested_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as UnitWorkflowRow[];
}

export async function fetchWorkbookSubmittedWorkflows(): Promise<UnitWorkflowRow[]> {
  const { data, error } = await supabase
    .from("unit_workflows")
    .select("*")
    .eq("status", "workbook_submitted")
    .order("workbook_submitted_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as UnitWorkflowRow[];
}

async function upsertWorkflow(
  userId: string,
  unitId: string,
  patch: Partial<UnitWorkflowRow>,
): Promise<UnitWorkflowRow> {
  const { data, error } = await supabase
    .from("unit_workflows")
    .upsert(
      { user_id: userId, unit_id: unitId, ...patch },
      { onConflict: "user_id,unit_id" },
    )
    .select("*")
    .single();
  if (error) throw error;
  return data as UnitWorkflowRow;
}

/** 유닛 내 모든 지문 학습 완료 여부 */
export async function isUnitOnlineLearningComplete(
  unitId: string,
  userId: string,
): Promise<boolean> {
  const summary = await summarizeUnitProgress(unitId, userId);
  return summary.totalPassages > 0 && summary.pendingCodes.length === 0;
}

/** 학생: 유닛 인쇄 요청 */
export async function requestUnitPrint(userId: string, unitId: string): Promise<UnitWorkflowRow> {
  const ready = await isUnitOnlineLearningComplete(unitId, userId);
  if (!ready) throw new Error("유닛 학습을 모두 마친 후 인쇄를 요청할 수 있습니다.");

  const prev = await fetchUnitWorkflow(userId, unitId);
  if (prev?.status === "print_pending") return prev;
  if (prev && !["learning", "print_pending"].includes(prev.status)) {
    throw new Error("이미 인쇄 요청을 처리했거나 다음 단계입니다.");
  }

  return upsertWorkflow(userId, unitId, {
    status: "print_pending",
    print_requested_at: new Date().toISOString(),
  });
}

/** 선생님: 유닛 워크북 인쇄 완료 */
export async function markUnitPrinted(userId: string, unitId: string): Promise<UnitWorkflowRow> {
  const teacherId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("unit_workflows")
    .update({
      status: "printed",
      printed_at: new Date().toISOString(),
      printed_by: teacherId,
    })
    .eq("user_id", userId)
    .eq("unit_id", unitId)
    .eq("status", "print_pending")
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("인쇄 대기 중인 요청이 없습니다.");
  return data as UnitWorkflowRow;
}

/** 학생: 워크북 탐구 활동 완료 */
export async function submitUnitWorkbook(userId: string, unitId: string): Promise<UnitWorkflowRow> {
  const prev = await fetchUnitWorkflow(userId, unitId);
  if (!prev || prev.status !== "printed") {
    throw new Error("선생님 인쇄 후 워크북 활동을 완료할 수 있습니다.");
  }
  return upsertWorkflow(userId, unitId, {
    status: "workbook_submitted",
    workbook_submitted_at: new Date().toISOString(),
  });
}

/** 선생님: 유닛 학습완료 + ABCDE 평가 */
export async function completeUnitLearning(
  userId: string,
  unitId: string,
  grade: TeacherGrade,
  memo: string,
): Promise<UnitWorkflowRow> {
  const teacherId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("unit_workflows")
    .update({
      status: "completed",
      teacher_grade: grade,
      teacher_memo: memo.trim() || null,
      completed_at: new Date().toISOString(),
      completed_by: teacherId,
    })
    .eq("user_id", userId)
    .eq("unit_id", unitId)
    .eq("status", "workbook_submitted")
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("워크북 제출 대기 중인 유닛이 아닙니다.");
  return data as UnitWorkflowRow;
}

/** 같은 권(textbook) 내 이전 유닛 id (unit_no 기준) */
export async function getPreviousUnitId(unitId: string): Promise<string | null> {
  const { data: unit } = await supabase
    .from("textbook_units")
    .select("id, textbook_id, unit_no")
    .eq("id", unitId)
    .maybeSingle();
  if (!unit) return null;

  const { data: prev } = await supabase
    .from("textbook_units")
    .select("id")
    .eq("textbook_id", unit.textbook_id)
    .lt("unit_no", unit.unit_no)
    .order("unit_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (prev?.id as string | null) ?? null;
}

/** 이전 유닛 학습완료(선생님 승인) 후에만 접근 가능 */
export async function canAccessUnit(userId: string, unitId: string): Promise<boolean> {
  const prevId = await getPreviousUnitId(unitId);
  if (!prevId) return true;
  const prev = await fetchUnitWorkflow(userId, prevId);
  return prev?.status === "completed";
}

export function subscribeToUnitWorkflows(onChange: () => void) {
  const ch = supabase
    .channel(`unit_workflows_${Math.random().toString(36).slice(2)}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "unit_workflows" },
      () => onChange(),
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(ch);
  };
}

export const UNIT_WORKFLOW_LABELS: Record<UnitWorkflowStatus, string> = {
  learning: "학습 중",
  print_pending: "인쇄 요청",
  printed: "인쇄 완료 · 워크북",
  workbook_submitted: "승인 대기",
  completed: "학습 완료",
};

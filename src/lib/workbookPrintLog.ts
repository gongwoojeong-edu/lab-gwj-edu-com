// ============================================================
// workbookPrintLog — 책장에서 뽑은 워크북 인쇄 기록 (인쇄할 때마다 한 줄씩 쌓임)
// ============================================================
import { supabase } from "@/integrations/supabase/client";
import { getCurrentUserId } from "@/lib/authState";
import type { WorkbookPrintLog } from "@/lib/workbookPrintLogMeta";
export * from "@/lib/workbookPrintLogMeta";

const COLS = "student_id,unit_ids,mode,answer_key,hide_translation,passage_count,printed_by,printed_at";

export async function recordWorkbookPrint(input: {
  studentId: string;
  unitIds: string[];
  mode: string;
  answerKey?: boolean;
  hideTranslation?: boolean;
  passageCount: number;
}): Promise<void> {
  const uid = await getCurrentUserId();
  if (!uid) throw new Error("로그인 정보가 없어 인쇄 기록을 남기지 못했어요");
  const { error } = await supabase.from("workbook_print_logs").insert({
    student_id: input.studentId,
    unit_ids: input.unitIds,
    mode: input.mode,
    answer_key: !!input.answerKey,
    hide_translation: !!input.hideTranslation,
    passage_count: input.passageCount,
    printed_by: uid,
  });
  if (error) throw error;
}

/** 학생 1명이 해당 유닛들을 인쇄한 기록 (최신순) */
export async function fetchWorkbookPrints(studentId: string, unitIds: string[]): Promise<WorkbookPrintLog[]> {
  if (!studentId || unitIds.length === 0) return [];
  const { data, error } = await supabase
    .from("workbook_print_logs")
    .select(COLS)
    .eq("student_id", studentId)
    .overlaps("unit_ids", unitIds)
    .order("printed_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as WorkbookPrintLog[];
}

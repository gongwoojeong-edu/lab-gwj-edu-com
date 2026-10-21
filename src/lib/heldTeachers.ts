import { supabase } from "@/integrations/supabase/client";

export interface HeldTeacher { id: string; name: string }

export async function fetchHeldTeachers(): Promise<HeldTeacher[]> {
  const { data, error } = await supabase.rpc("held_teacher_directory");
  if (error) throw error;
  return data ?? [];
}

export function filterHeldByTeacher<T extends { held_teacher_id?: string | null }>(rows: T[], teacherId: string): T[] {
  if (teacherId === "all") return rows;
  return rows.filter(row => teacherId === "unassigned" ? !row.held_teacher_id : row.held_teacher_id === teacherId);
}
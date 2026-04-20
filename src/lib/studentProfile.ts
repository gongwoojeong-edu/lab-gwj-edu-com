import { supabase } from "@/integrations/supabase/client";
import type { LevelCode } from "@/lib/levels";

export interface StudentProfile {
  user_id: string;
  student_no: string;
  display_name: string | null;
  start_level: LevelCode;
  current_level: LevelCode;
  current_no: number;
  teacher_id: string | null;
}

export const fetchMyProfile = async (): Promise<StudentProfile | null> => {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return null;
  const { data } = await supabase
    .from("student_profiles")
    .select("*")
    .eq("user_id", u.user.id)
    .maybeSingle();
  return (data as StudentProfile) ?? null;
};

export const updateMyProgress = async (level: LevelCode, no: number): Promise<void> => {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return;
  await supabase
    .from("student_profiles")
    .update({ current_level: level, current_no: no })
    .eq("user_id", u.user.id);
};

export const fetchAllStudents = async (): Promise<StudentProfile[]> => {
  const { data } = await supabase
    .from("student_profiles")
    .select("*")
    .order("student_no", { ascending: true });
  return (data as StudentProfile[]) ?? [];
};

export const updateStudentStartLevel = async (
  userId: string,
  startLevel: LevelCode,
): Promise<void> => {
  await supabase
    .from("student_profiles")
    .update({ start_level: startLevel, current_level: startLevel, current_no: 1 })
    .eq("user_id", userId);
};

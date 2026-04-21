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
  analysis_pass_threshold: number;
  hint_mode_enabled: boolean;
  word_test_time_limit_sec: number;
}

export const updateStudentWordTestTimeLimit = async (
  userId: string,
  seconds: number,
): Promise<void> => {
  await supabase
    .from("student_profiles")
    .update({ word_test_time_limit_sec: Math.max(0, Math.min(120, Math.round(seconds))) })
    .eq("user_id", userId);
};

export const updateStudentHintMode = async (
  userId: string,
  enabled: boolean,
): Promise<void> => {
  await supabase
    .from("student_profiles")
    .update({ hint_mode_enabled: enabled })
    .eq("user_id", userId);
};

export const fetchStudentFailCounts = async (): Promise<Record<string, number>> => {
  const { data } = await supabase
    .from("sentence_progress")
    .select("user_id, status")
    .eq("status", "fail");
  const map: Record<string, number> = {};
  ((data ?? []) as { user_id: string | null }[]).forEach((r) => {
    if (!r.user_id) return;
    map[r.user_id] = (map[r.user_id] ?? 0) + 1;
  });
  return map;
};

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

export interface StudentStats {
  user_id: string;
  pass_count: number;
  last_activity_at: string | null;
}

/** 학생별 Pass 수 + 마지막 활동 시각(가장 최근 sentence_progress.updated_at)을 묶어서 조회 */
export const fetchStudentStatsMap = async (): Promise<Record<string, StudentStats>> => {
  const { data } = await supabase
    .from("sentence_progress")
    .select("user_id, status, updated_at");
  const map: Record<string, StudentStats> = {};
  ((data ?? []) as { user_id: string | null; status: string; updated_at: string }[]).forEach((row) => {
    if (!row.user_id) return;
    const cur = map[row.user_id] ?? { user_id: row.user_id, pass_count: 0, last_activity_at: null };
    if (row.status === "pass") cur.pass_count += 1;
    if (!cur.last_activity_at || row.updated_at > cur.last_activity_at) {
      cur.last_activity_at = row.updated_at;
    }
    map[row.user_id] = cur;
  });
  return map;
};

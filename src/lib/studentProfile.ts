import { supabase } from "@/integrations/supabase/client";
import { getCurrentUserId } from "@/lib/authState";
import type { LevelCode } from "@/lib/levels";

export interface StudentProfile {
  user_id: string;
  student_no: string;
  display_name: string | null;
  start_level: LevelCode;
  /** 시작 시리즈(책) id. null이면 해당 레벨 전체 */
  start_series_id: string | null;
  /** 시작 권 id (textbooks.id). null이면 시리즈 전체 */
  start_volume_id: string | null;
  /** 시작 유닛 id. null이면 권 전체 */
  start_unit_id: string | null;
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
  const userId = await getCurrentUserId();
  if (!userId) return null;
  const { data } = await supabase
    .from("student_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  return (data as StudentProfile) ?? null;
};

export const updateMyProgress = async (level: LevelCode, no: number): Promise<void> => {
  const userId = await getCurrentUserId();
  if (!userId) return;
  await supabase
    .from("student_profiles")
    .update({ current_level: level, current_no: no })
    .eq("user_id", userId);
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.from("student_profiles") as any)
    .update({
      start_level: startLevel,
      current_level: startLevel,
      current_no: 1,
      // 레벨만 바꾸면 하위 범위 지정도 초기화 (전체로 되돌림)
      start_series_id: null,
      start_volume_id: null,
      start_unit_id: null,
    })
    .eq("user_id", userId);
};

/** 시작 범위(레벨/책/권/유닛) 통합 업데이트. null = 해당 단계 전체 */
export const updateStudentStartScope = async (
  userId: string,
  scope: {
    start_level: LevelCode;
    start_series_id: string | null;
    start_volume_id: string | null;
    start_unit_id: string | null;
  },
): Promise<void> => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.from("student_profiles") as any)
    .update({
      start_level: scope.start_level,
      current_level: scope.start_level,
      current_no: 1,
      start_series_id: scope.start_series_id,
      start_volume_id: scope.start_volume_id,
      start_unit_id: scope.start_unit_id,
    })
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

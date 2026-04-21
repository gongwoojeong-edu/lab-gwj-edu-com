import { supabase } from "@/integrations/supabase/client";

export interface HandoutResult {
  id: string;
  user_id: string;
  teacher_id: string | null;
  test_date: string; // ISO yyyy-mm-dd
  session_no: number;
  word_ho_score: number | null;
  syntax_ho_result: "PASS" | "FAIL" | null;
  is_integrated: boolean;
  created_at: string;
  updated_at: string;
}

export const WORD_HO_PASS_THRESHOLD = 80;

/** ISO yyyy-mm-dd from a Date (local timezone). */
export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Fetch all handout rows for a given test_date (across students). */
export async function fetchHandoutResultsByDate(testDate: string): Promise<Record<string, HandoutResult>> {
  const { data, error } = await supabase
    .from("handout_results")
    .select("*")
    .eq("test_date", testDate);
  if (error) throw error;
  const map: Record<string, HandoutResult> = {};
  for (const row of (data ?? []) as HandoutResult[]) {
    map[row.user_id] = row;
  }
  return map;
}

/** Fetch handout rows for a specific user, recent N days. */
export async function fetchHandoutResultsForUser(userId: string, days = 14): Promise<HandoutResult[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const { data, error } = await supabase
    .from("handout_results")
    .select("*")
    .eq("user_id", userId)
    .gte("test_date", toIsoDate(since))
    .order("test_date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as HandoutResult[];
}

/** Compute next session_no for student on a date (1 + count of prior dates). */
async function computeSessionNo(userId: string, testDate: string): Promise<number> {
  const { count } = await supabase
    .from("handout_results")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .lt("test_date", testDate);
  return (count ?? 0) + 1;
}

/** Upsert a handout row with a partial update. Returns the updated row. */
export async function upsertHandoutResult(params: {
  userId: string;
  teacherId: string | null;
  testDate: string;
  wordHoScore?: number | null;
  syntaxHoResult?: "PASS" | "FAIL" | null;
}): Promise<HandoutResult> {
  const { userId, teacherId, testDate, wordHoScore, syntaxHoResult } = params;

  // Existing row?
  const { data: existing } = await supabase
    .from("handout_results")
    .select("*")
    .eq("user_id", userId)
    .eq("test_date", testDate)
    .maybeSingle();

  const sessionNo = existing?.session_no ?? (await computeSessionNo(userId, testDate));

  const next = {
    user_id: userId,
    teacher_id: teacherId,
    test_date: testDate,
    session_no: sessionNo,
    word_ho_score:
      wordHoScore !== undefined ? wordHoScore : (existing?.word_ho_score ?? null),
    syntax_ho_result:
      syntaxHoResult !== undefined ? syntaxHoResult : (existing?.syntax_ho_result ?? null),
  };

  const { data, error } = await supabase
    .from("handout_results")
    .upsert(next, { onConflict: "user_id,test_date" })
    .select("*")
    .single();
  if (error) throw error;
  return data as HandoutResult;
}

/** Ensure a handout_results row exists for (user, date). No-op if exists. */
export async function ensureHandoutRow(
  userId: string,
  teacherId: string | null,
  testDate: string,
): Promise<HandoutResult> {
  const { data: existing } = await supabase
    .from("handout_results")
    .select("*")
    .eq("user_id", userId)
    .eq("test_date", testDate)
    .maybeSingle();
  if (existing) return existing as HandoutResult;

  const sessionNo = await computeSessionNo(userId, testDate);
  const { data, error } = await supabase
    .from("handout_results")
    .upsert(
      {
        user_id: userId,
        teacher_id: teacherId,
        test_date: testDate,
        session_no: sessionNo,
        word_ho_score: null,
        syntax_ho_result: null,
      },
      { onConflict: "user_id,test_date" },
    )
    .select("*")
    .single();
  if (error) throw error;
  return data as HandoutResult;
}

export async function setIsIntegrated(rowId: string, isIntegrated: boolean): Promise<void> {
  const { error } = await supabase
    .from("handout_results")
    .update({ is_integrated: isIntegrated })
    .eq("id", rowId);
  if (error) throw error;
}

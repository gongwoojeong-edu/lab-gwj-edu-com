import { supabase } from "@/integrations/supabase/client";

export interface HandoutResult {
  id: string;
  user_id: string;
  teacher_id: string | null;
  test_date: string; // ISO yyyy-mm-dd
  session_no: number;
  sentence_id: string | null;
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
    // Key: 학생 단독 입력(예: TeacherHome)에서는 sentence_id=null 행만 사용 →
    // userId 키 그대로 사용 (마지막에 발견된 row가 우세).
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

/** sentence_id 기준 기존 row 조회. sentence_id 가 null/undefined 면 sentence_id IS NULL 조건. */
async function findExistingRow(
  userId: string,
  testDate: string,
  sentenceId: string | null | undefined,
): Promise<HandoutResult | null> {
  let q = supabase
    .from("handout_results")
    .select("*")
    .eq("user_id", userId)
    .eq("test_date", testDate);
  if (sentenceId) {
    q = q.eq("sentence_id", sentenceId);
  } else {
    q = q.is("sentence_id", null);
  }
  const { data } = await q.maybeSingle();
  return (data as HandoutResult | null) ?? null;
}

/** Upsert a handout row with a partial update. Returns the updated row. */
export async function upsertHandoutResult(params: {
  userId: string;
  teacherId: string | null;
  testDate: string;
  sentenceId?: string | null;
  wordHoScore?: number | null;
  syntaxHoResult?: "PASS" | "FAIL" | null;
}): Promise<HandoutResult> {
  const { userId, teacherId, testDate, sentenceId, wordHoScore, syntaxHoResult } = params;

  const existing = await findExistingRow(userId, testDate, sentenceId ?? null);

  const sessionNo = existing?.session_no ?? (await computeSessionNo(userId, testDate));

  // 기존 행이 있으면 update, 없으면 insert — sentence_id 가 null 인 행에 대한
  // unique 제약은 COALESCE 기반 인덱스로 보장됨.
  if (existing) {
    const patch: Record<string, unknown> = {
      teacher_id: teacherId,
      session_no: sessionNo,
    };
    if (wordHoScore !== undefined) patch.word_ho_score = wordHoScore;
    if (syntaxHoResult !== undefined) patch.syntax_ho_result = syntaxHoResult;
    const { data, error } = await supabase
      .from("handout_results")
      .update(patch)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw error;
    return data as HandoutResult;
  }

  const insertRow = {
    user_id: userId,
    teacher_id: teacherId,
    test_date: testDate,
    session_no: sessionNo,
    sentence_id: sentenceId ?? null,
    word_ho_score: wordHoScore ?? null,
    syntax_ho_result: syntaxHoResult ?? null,
  };
  const { data, error } = await supabase
    .from("handout_results")
    .insert(insertRow)
    .select("*")
    .single();
  if (error) throw error;
  return data as HandoutResult;
}

/** Ensure a handout_results row exists for (user, date, sentence). No-op if exists. */
export async function ensureHandoutRow(
  userId: string,
  teacherId: string | null,
  testDate: string,
  sentenceId?: string | null,
): Promise<HandoutResult> {
  const existing = await findExistingRow(userId, testDate, sentenceId ?? null);
  if (existing) return existing;
  return upsertHandoutResult({ userId, teacherId, testDate, sentenceId: sentenceId ?? null });
}

export async function setIsIntegrated(rowId: string, isIntegrated: boolean): Promise<void> {
  const { error } = await supabase
    .from("handout_results")
    .update({ is_integrated: isIntegrated })
    .eq("id", rowId);
  if (error) throw error;
}

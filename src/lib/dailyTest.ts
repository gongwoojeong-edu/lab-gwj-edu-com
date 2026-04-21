import { supabase } from "@/integrations/supabase/client";
import type { HandoutResult } from "./handoutResults";

/**
 * Weighted integrated score:
 *   analysis 40% + word test 30% + word HO 20% + syntax HO 10%
 */
export const WEIGHTS = {
  analysis: 0.4,
  wordTest: 0.3,
  wordHo: 0.2,
  syntaxHo: 0.1,
} as const;

export const INTEGRATED_PASS_THRESHOLD = 80;

export interface DailyScores {
  online_analysis: number | null; // 0-100
  online_word_test: number | null; // 0-100
  offline_word_handout: number | null; // 0-100
  offline_syntax_handout: "PASS" | "FAIL" | null;
  integrated_total: number | null;
}

export interface DailyTestRecord {
  schema_version: "1.0";
  student_id: string;
  test_date: string;
  session_no: number;
  scores: DailyScores;
  is_integrated: boolean;
  generated_at: string;
  printed_count: number;
}

/** Count of printed print_requests for a student on a given date. */
export async function fetchPrintedCount(userId: string, testDate: string): Promise<number> {
  const dayStart = `${testDate}T00:00:00`;
  const dayEnd = `${testDate}T23:59:59.999`;
  const { count } = await supabase
    .from("print_requests")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "printed")
    .gte("handled_at", dayStart)
    .lte("handled_at", dayEnd);
  return count ?? 0;
}

/** Fetch daily averages for online metrics for a student on a given date. */
export async function fetchOnlineDailyAverages(userId: string, testDate: string): Promise<{
  analysis: number | null;
  wordTest: number | null;
}> {
  const dayStart = `${testDate}T00:00:00`;
  const dayEnd = `${testDate}T23:59:59.999`;

  const [{ data: attempts }, { data: wordTests }] = await Promise.all([
    supabase
      .from("sentence_attempt_logs")
      .select("analysis_match_rate")
      .eq("user_id", userId)
      .gte("completed_at", dayStart)
      .lte("completed_at", dayEnd),
    supabase
      .from("word_test_results")
      .select("score")
      .eq("user_id", userId)
      .gte("taken_at", dayStart)
      .lte("taken_at", dayEnd),
  ]);

  const analysisVals = ((attempts ?? []) as { analysis_match_rate: number }[]).map(
    (r) => Number(r.analysis_match_rate) * 100,
  );
  const wordVals = ((wordTests ?? []) as { score: number }[]).map((r) => Number(r.score));

  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  return { analysis: avg(analysisVals), wordTest: avg(wordVals) };
}

export function computeIntegratedTotal(scores: Omit<DailyScores, "integrated_total">): number | null {
  const { online_analysis, online_word_test, offline_word_handout, offline_syntax_handout } = scores;
  if (
    online_analysis == null ||
    online_word_test == null ||
    offline_word_handout == null ||
    offline_syntax_handout == null
  ) {
    return null;
  }
  const syntaxNum = offline_syntax_handout === "PASS" ? 100 : 0;
  return (
    online_analysis * WEIGHTS.analysis +
    online_word_test * WEIGHTS.wordTest +
    offline_word_handout * WEIGHTS.wordHo +
    syntaxNum * WEIGHTS.syntaxHo
  );
}

export async function buildDailyTestRecord(
  userId: string,
  handout: HandoutResult,
): Promise<DailyTestRecord> {
  const [{ analysis, wordTest }, printedCount] = await Promise.all([
    fetchOnlineDailyAverages(userId, handout.test_date),
    fetchPrintedCount(userId, handout.test_date),
  ]);
  const partial: Omit<DailyScores, "integrated_total"> = {
    online_analysis: analysis,
    online_word_test: wordTest,
    offline_word_handout: handout.word_ho_score,
    offline_syntax_handout: handout.syntax_ho_result,
  };
  const integrated = computeIntegratedTotal(partial);
  return {
    schema_version: "1.0",
    student_id: userId,
    test_date: handout.test_date,
    session_no: handout.session_no,
    scores: { ...partial, integrated_total: integrated },
    is_integrated: handout.is_integrated,
    generated_at: new Date().toISOString(),
    printed_count: printedCount,
  };
}

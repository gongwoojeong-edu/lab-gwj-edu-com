import { supabase } from "@/integrations/supabase/client";

export type StepStatus = "pass" | "fail" | "done" | "missing";

export interface StepResult {
  status: StepStatus;
  score: number | null; // 0..100, null if not applicable
}

export interface UserStepProgress {
  pre: StepResult;
  analysis: StepResult;
  translation: StepResult;
  wordtest: StepResult;
}

export type AssignmentProgressMap = Map<string, UserStepProgress>;

const empty = (): UserStepProgress => ({
  pre: { status: "missing", score: null },
  analysis: { status: "missing", score: null },
  translation: { status: "missing", score: null },
  wordtest: { status: "missing", score: null },
});

/**
 * Fetch per-user progress on each assignment step for a sentence.
 * Returns Map<userId, UserStepProgress> covering exactly targetUserIds.
 */
export async function fetchAssignmentProgress(
  sentenceId: string,
  targetUserIds: string[],
): Promise<AssignmentProgressMap> {
  const map: AssignmentProgressMap = new Map();
  targetUserIds.forEach((id) => map.set(id, empty()));

  if (!sentenceId || targetUserIds.length === 0) return map;

  const [preRes, analysisRes, translationRes, wordtestRes, progressRes] = await Promise.all([
    supabase
      .from("word_pre_results")
      .select("user_id, completed, known_words, unknown_words, taken_at")
      .eq("sentence_id", sentenceId)
      .in("user_id", targetUserIds)
      .order("taken_at", { ascending: false }),
    supabase
      .from("sentence_attempt_logs")
      .select("user_id, analysis_passed, analysis_match_rate")
      .eq("sentence_id", sentenceId)
      .in("user_id", targetUserIds),
    supabase
      .from("sentence_translations")
      .select("user_id, submitted_at")
      .eq("sentence_id", sentenceId)
      .in("user_id", targetUserIds),
    supabase
      .from("word_test_results")
      .select("user_id, passed, score")
      .eq("sentence_id", sentenceId)
      .in("user_id", targetUserIds),
    // sentence_progress: 즉시 저장된 부분 결과 (attempt log 생성 전이라도 활용)
    supabase
      .from("sentence_progress")
      .select("user_id, pre_done, analysis_done, translation_done, word_test_done, analysis_match_rate")
      .eq("sentence_id", sentenceId)
      .in("user_id", targetUserIds),
  ]);

  // pre — latest row per user
  const seenPre = new Set<string>();
  ((preRes.data ?? []) as any[]).forEach((row) => {
    const uid = row.user_id as string | null;
    if (!uid || seenPre.has(uid)) return;
    seenPre.add(uid);
    const known = (row.known_words ?? []) as string[];
    const unknown = (row.unknown_words ?? []) as string[];
    const total = known.length + unknown.length;
    const score = total > 0 ? Math.round((known.length / total) * 100) : null;
    const completed = !!row.completed;
    const cur = map.get(uid);
    if (cur) {
      cur.pre = { status: completed ? "done" : "missing", score };
    }
  });

  // analysis — best PASS match rate per user; if no pass, best fail rate
  const analysisBest = new Map<string, { passed: boolean; rate: number }>();
  ((analysisRes.data ?? []) as any[]).forEach((row) => {
    const uid = row.user_id as string | null;
    if (!uid) return;
    const passed = !!row.analysis_passed;
    const rate = Number(row.analysis_match_rate ?? 0);
    const cur = analysisBest.get(uid);
    if (!cur) {
      analysisBest.set(uid, { passed, rate });
    } else if (passed && !cur.passed) {
      analysisBest.set(uid, { passed, rate });
    } else if (passed === cur.passed && rate > cur.rate) {
      analysisBest.set(uid, { passed, rate });
    }
  });
  analysisBest.forEach((v, uid) => {
    const cur = map.get(uid);
    if (cur) {
      cur.analysis = {
        status: v.passed ? "pass" : "fail",
        score: Math.round(v.rate * 100),
      };
    }
  });

  // sentence_progress fallback — attempt log이 아직 없어도 즉시 저장된 부분 결과를 활용
  ((progressRes.data ?? []) as any[]).forEach((row) => {
    const uid = row.user_id as string | null;
    if (!uid) return;
    const cur = map.get(uid);
    if (!cur) return;
    // 분석: attempt log가 없어 missing이면 sentence_progress의 즉시 저장 점수로 대체
    if (cur.analysis.status === "missing" && row.analysis_done) {
      const rate = row.analysis_match_rate != null ? Number(row.analysis_match_rate) : null;
      cur.analysis = {
        status: "done",
        score: rate != null ? Math.round(rate * 100) : null,
      };
    }
    // pre/wordtest는 progress 플래그도 확인 (일부 row 누락 보완)
    if (cur.pre.status === "missing" && row.pre_done) {
      cur.pre = { status: "done", score: null };
    }
    if (cur.wordtest.status === "missing" && row.word_test_done) {
      cur.wordtest = { status: "pass", score: null };
    }
  });

  // translation — existence
  const seenT = new Set<string>();
  ((translationRes.data ?? []) as any[]).forEach((row) => {
    const uid = row.user_id as string | null;
    if (!uid || seenT.has(uid)) return;
    seenT.add(uid);
    const cur = map.get(uid);
    if (cur) cur.translation = { status: "done", score: null };
  });

  // wordtest — best PASS score per user; else best fail score
  const wtBest = new Map<string, { passed: boolean; score: number }>();
  ((wordtestRes.data ?? []) as any[]).forEach((row) => {
    const uid = row.user_id as string | null;
    if (!uid) return;
    const passed = !!row.passed;
    const score = Number(row.score ?? 0);
    const cur = wtBest.get(uid);
    if (!cur) {
      wtBest.set(uid, { passed, score });
    } else if (passed && !cur.passed) {
      wtBest.set(uid, { passed, score });
    } else if (passed === cur.passed && score > cur.score) {
      wtBest.set(uid, { passed, score });
    }
  });
  wtBest.forEach((v, uid) => {
    const cur = map.get(uid);
    if (cur) {
      // score field is typically 0..1; normalize to 0..100
      const normalized = v.score <= 1 ? v.score * 100 : v.score;
      cur.wordtest = {
        status: v.passed ? "pass" : "fail",
        score: Math.round(normalized),
      };
    }
  });

  return map;
}

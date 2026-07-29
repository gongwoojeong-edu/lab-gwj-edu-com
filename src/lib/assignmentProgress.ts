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
  mem: StepResult;
  /** sentence_progress.status — 선생님 승인(pass) 시 완료 단축 */
  progressStatus?: string | null;
}

export type AssignmentProgressMap = Map<string, UserStepProgress>;

export interface FetchAssignmentProgressOpts {
  /** 회독 격리 키. 있으면 해당 assignment_id 행을 우선 */
  assignmentId?: string | null;
  /**
   * 과제 round_no.
   * null/≤1 이면 assignment_id IS NULL 레거시 진도를 fallback 허용 (학생 홈과 동일).
   * ≥2 이면 sealed assignment_id 행만 사용.
   */
  roundNo?: number | null;
}

const empty = (): UserStepProgress => ({
  pre: { status: "missing", score: null },
  analysis: { status: "missing", score: null },
  translation: { status: "missing", score: null },
  wordtest: { status: "missing", score: null },
  mem: { status: "missing", score: null },
  progressStatus: null,
});

/** 학생 홈과 동일: 1회독(또는 round 미지정)만 null assignment 진도 fallback */
export const allowsNullAssignmentFallback = (
  roundNo?: number | null,
): boolean => roundNo == null || roundNo <= 1;

type ScopedRow = { user_id: string | null; assignment_id?: string | null };

/**
 * 사용자별로 assignment_id 매칭 행을 고른다.
 * - assignmentId가 있으면 그 행 우선
 * - 없고 allowNull이면 assignment_id IS NULL
 * - assignmentId 미지정 + allowNull → null만 (레거시 호출)
 */
function pickScopedRows<T extends ScopedRow>(
  rows: T[],
  targetUserIds: string[],
  opts?: FetchAssignmentProgressOpts,
): T[] {
  const allowNull = allowsNullAssignmentFallback(opts?.roundNo);
  const assignmentId = opts?.assignmentId ?? null;
  const byUser = new Map<string, T[]>();
  rows.forEach((row) => {
    const uid = row.user_id;
    if (!uid || !targetUserIds.includes(uid)) return;
    const list = byUser.get(uid) ?? [];
    list.push(row);
    byUser.set(uid, list);
  });

  const out: T[] = [];
  byUser.forEach((list) => {
    if (assignmentId) {
      const scoped = list.filter((r) => r.assignment_id === assignmentId);
      if (scoped.length > 0) {
        out.push(...scoped);
        return;
      }
      if (allowNull) {
        out.push(...list.filter((r) => r.assignment_id == null));
      }
      return;
    }
    // 레거시: assignmentId 미지정 → 현재 회독(null)만
    out.push(...list.filter((r) => r.assignment_id == null));
  });
  return out;
}

/**
 * Fetch per-user progress on each assignment step for a sentence.
 * Returns Map<userId, UserStepProgress> covering exactly targetUserIds.
 *
 * 학생 홈과 같이 assignment_id를 존중한다.
 * round_no ≤ 1(또는 null)일 때만 assignment_id IS NULL fallback.
 */
export async function fetchAssignmentProgress(
  sentenceId: string,
  targetUserIds: string[],
  opts?: FetchAssignmentProgressOpts,
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
      .select("user_id, assignment_id, analysis_passed, analysis_match_rate")
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
      .select(
        "user_id, assignment_id, status, pre_done, analysis_done, translation_done, word_test_done, analysis_match_rate, mem_passed_at, mem_listen_done",
      )
      .eq("sentence_id", sentenceId)
      .in("user_id", targetUserIds),
  ]);

  // pre — latest row per user (pre는 assignment 스코프 없음)
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

  // analysis — best PASS match rate per user within assignment scope
  const analysisBest = new Map<string, { passed: boolean; rate: number }>();
  pickScopedRows(
    (analysisRes.data ?? []) as Array<{
      user_id: string | null;
      assignment_id: string | null;
      analysis_passed: boolean | null;
      analysis_match_rate: number | null;
    }>,
    targetUserIds,
    opts,
  ).forEach((row) => {
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
  pickScopedRows(
    (progressRes.data ?? []) as Array<{
      user_id: string | null;
      assignment_id: string | null;
      status: string | null;
      pre_done: boolean | null;
      analysis_done: boolean | null;
      translation_done: boolean | null;
      word_test_done: boolean | null;
      analysis_match_rate: number | null;
      mem_passed_at: string | null;
      mem_listen_done: boolean | null;
    }>,
    targetUserIds,
    opts,
  ).forEach((row) => {
    const uid = row.user_id as string | null;
    if (!uid) return;
    const cur = map.get(uid);
    if (!cur) return;
    if (row.status) cur.progressStatus = row.status;
    // 분석: attempt log가 없어 missing이면 sentence_progress의 즉시 저장 점수로 대체
    if (row.analysis_done && cur.analysis.status !== "pass") {
      const rate = row.analysis_match_rate != null ? Number(row.analysis_match_rate) : null;
      cur.analysis = {
        status: "done",
        score: rate != null ? Math.round(rate * 100) : cur.analysis.score,
      };
    }
    // pre/wordtest는 progress 플래그도 확인 (일부 row 누락 보완)
    if (cur.pre.status === "missing" && row.pre_done) {
      cur.pre = { status: "done", score: null };
    }
    if (row.word_test_done && cur.wordtest.status !== "pass") {
      cur.wordtest = { status: "pass", score: null };
    }
    if (cur.translation.status === "missing" && row.translation_done) {
      cur.translation = { status: "done", score: null };
    }
    if (row.mem_passed_at) {
      cur.mem = { status: "pass", score: null };
    } else if (row.mem_listen_done) {
      cur.mem = { status: "done", score: null };
    }
  });

  // translation — existence (assignment 스코프 컬럼 없음)
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

  // 단어테스트가 done/pass면 pre(단어학습)도 완료로 간주 — pre는 wordtest 준비 단계
  map.forEach((cur) => {
    if (cur.pre.status === "missing" && (cur.wordtest.status === "pass" || cur.wordtest.status === "done")) {
      cur.pre = { status: "done", score: null };
    }
  });

  return map;
}

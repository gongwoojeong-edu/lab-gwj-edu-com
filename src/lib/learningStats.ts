import { supabase } from "@/integrations/supabase/client";
import { LEVELS, type LevelCode } from "@/lib/levels";
import { WEIGHTS } from "@/lib/dailyTest";
import { toIsoDate } from "@/lib/handoutResults";

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────
export type AttemptSource = "regular" | "review" | "assignment" | "test" | string;

export interface AchievementDistribution {
  pass: number;
  fail: number;
  pending: number;
  total: number;
}

export interface ClassKpis {
  activeToday: number;
  totalStudents: number;
  passSentencesToday: number;
  avgIntegratedToday: number | null;
  weeklyActiveStudents: number;
}

export interface LevelTrendPoint {
  date: string; // yyyy-mm-dd
  /** Level → integrated score average for that day */
  [levelCode: string]: number | string | null;
}

export interface SourceBreakdownPoint {
  date: string; // yyyy-mm-dd
  regular: number;
  review: number;
  assignment: number;
  test: number;
}

export interface RecentAttemptRow {
  id: string;
  sentence_id: string;
  level: LevelCode | string;
  attempt_source: AttemptSource;
  attempt_no: number;
  analysis_passed: boolean;
  analysis_match_rate: number;
  word_test_passed: boolean;
  word_test_score: number;
  completed_at: string;
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────
const sentenceLevel = (sentenceId: string): string => {
  // L05-001 → L05
  const m = sentenceId.match(/^(L\d{2})/);
  return m ? m[1] : "L00";
};

// ─────────────────────────────────────────────────────────────────
// Class-wide KPI
// ─────────────────────────────────────────────────────────────────
export async function fetchClassKpis(): Promise<ClassKpis> {
  const today = toIsoDate(new Date());
  const todayStart = `${today}T00:00:00`;
  const todayEnd = `${today}T23:59:59.999`;

  // 1) 카운터 4종은 서버 함수 한 번 호출로 처리 (수천 행 다운로드 제거)
  const { data: kpiRow, error: kpiErr } = await (supabase as unknown as {
    rpc: (name: string) => Promise<{ data: any; error: any }>;
  }).rpc("class_kpis_today");
  if (kpiErr) {
    console.warn("[learningStats] class_kpis_today rpc failed", kpiErr);
  }
  const row = Array.isArray(kpiRow) ? kpiRow[0] : kpiRow;
  const activeToday = Number(row?.active_today ?? 0);
  const totalStudents = Number(row?.total_students ?? 0);
  const passSentencesToday = Number(row?.pass_sentences_today ?? 0);
  const weeklyActiveStudents = Number(row?.weekly_active_students ?? 0);

  // 2) 통합점수는 오늘 활동한 학생만 대상으로 별도 계산.
  //    활동자가 없으면 추가 요청조차 하지 않는다.
  let avgIntegratedToday: number | null = null;
  if (activeToday > 0) {
    const [
      { data: activeUsers },
      { data: todaysHandouts },
    ] = await Promise.all([
      supabase
        .from("sentence_attempt_logs")
        .select("user_id")
        .gte("completed_at", todayStart)
        .lte("completed_at", todayEnd),
      supabase
        .from("handout_results")
        .select("user_id, word_ho_score, syntax_ho_result")
        .eq("test_date", today),
    ]);

    const activeTodaySet = new Set((activeUsers ?? []).map((r) => r.user_id));
    const userIds = Array.from(activeTodaySet);
    const onlineByUser = new Map<
      string,
      { analysisSum: number; analysisN: number; wordSum: number; wordN: number }
    >();

    if (userIds.length > 0) {
      const [{ data: aRows }, { data: wRows }] = await Promise.all([
        supabase
          .from("sentence_attempt_logs")
          .select("user_id, analysis_match_rate")
          .in("user_id", userIds)
          .gte("completed_at", todayStart)
          .lte("completed_at", todayEnd),
        supabase
          .from("word_test_results")
          .select("user_id, score")
          .in("user_id", userIds)
          .gte("taken_at", todayStart)
          .lte("taken_at", todayEnd),
      ]);
      (aRows ?? []).forEach((r) => {
        const u = r.user_id as string;
        const v = Number(r.analysis_match_rate ?? 0) * 100;
        const cur = onlineByUser.get(u) ?? { analysisSum: 0, analysisN: 0, wordSum: 0, wordN: 0 };
        cur.analysisSum += v;
        cur.analysisN += 1;
        onlineByUser.set(u, cur);
      });
      (wRows ?? []).forEach((r) => {
        const u = r.user_id as string;
        const v = Number(r.score ?? 0) * 100;
        const cur = onlineByUser.get(u) ?? { analysisSum: 0, analysisN: 0, wordSum: 0, wordN: 0 };
        cur.wordSum += v;
        cur.wordN += 1;
        onlineByUser.set(u, cur);
      });
    }

    const handoutByUser = new Map<string, { word: number | null; syntax: "PASS" | "FAIL" | null }>();
    (todaysHandouts ?? []).forEach((r) => {
      handoutByUser.set(r.user_id as string, {
        word: r.word_ho_score == null ? null : Number(r.word_ho_score),
        syntax: r.syntax_ho_result as "PASS" | "FAIL" | null,
      });
    });

    const integratedScores: number[] = [];
    const allUsers = new Set<string>([...activeTodaySet, ...handoutByUser.keys()]);
    allUsers.forEach((u) => {
      const o = onlineByUser.get(u);
      const h = handoutByUser.get(u);
      const parts: { v: number; w: number }[] = [];
      if (o && o.analysisN > 0) parts.push({ v: o.analysisSum / o.analysisN, w: WEIGHTS.analysis });
      if (o && o.wordN > 0) parts.push({ v: o.wordSum / o.wordN, w: WEIGHTS.wordTest });
      if (h?.word != null) parts.push({ v: h.word, w: WEIGHTS.wordHo });
      if (h?.syntax) parts.push({ v: h.syntax === "PASS" ? 100 : 0, w: WEIGHTS.syntaxHo });
      if (parts.length === 0) return;
      const totalW = parts.reduce((s, p) => s + p.w, 0);
      const total = parts.reduce((s, p) => s + p.v * p.w, 0) / totalW;
      integratedScores.push(total);
    });
    if (integratedScores.length > 0) {
      avgIntegratedToday =
        integratedScores.reduce((a, b) => a + b, 0) / integratedScores.length;
    }
  }

  return {
    activeToday,
    totalStudents,
    passSentencesToday,
    avgIntegratedToday,
    weeklyActiveStudents,
  };
}


// ─────────────────────────────────────────────────────────────────
// Per-student widgets
// ─────────────────────────────────────────────────────────────────
export async function fetchAchievementDistribution(userId: string): Promise<AchievementDistribution> {
  const { data } = await supabase
    .from("sentence_progress")
    .select("status")
    .eq("user_id", userId);
  const rows = data ?? [];
  let pass = 0;
  let fail = 0;
  let pending = 0;
  rows.forEach((r) => {
    if (r.status === "pass") pass += 1;
    else if (r.status === "fail") fail += 1;
    else pending += 1;
  });
  return { pass, fail, pending, total: rows.length };
}

export async function fetchLevelTrend(userId: string, days = 30): Promise<LevelTrendPoint[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceIso = since.toISOString();

  const [{ data: attempts }, { data: words }, { data: handouts }] = await Promise.all([
    supabase
      .from("sentence_attempt_logs")
      .select("sentence_id, analysis_match_rate, completed_at")
      .eq("user_id", userId)
      .gte("completed_at", sinceIso),
    supabase
      .from("word_test_results")
      .select("sentence_id, score, taken_at")
      .eq("user_id", userId)
      .gte("taken_at", sinceIso),
    supabase
      .from("handout_results")
      .select("test_date, word_ho_score, syntax_ho_result")
      .eq("user_id", userId)
      .gte("test_date", toIsoDate(since)),
  ]);

  // Aggregate by date+level
  type Bucket = { aSum: number; aN: number; wSum: number; wN: number };
  const map = new Map<string, Map<string, Bucket>>(); // date → level → Bucket

  const ensure = (date: string, level: string): Bucket => {
    let lvls = map.get(date);
    if (!lvls) {
      lvls = new Map();
      map.set(date, lvls);
    }
    let b = lvls.get(level);
    if (!b) {
      b = { aSum: 0, aN: 0, wSum: 0, wN: 0 };
      lvls.set(level, b);
    }
    return b;
  };

  (attempts ?? []).forEach((r) => {
    const date = (r.completed_at as string).slice(0, 10);
    const level = sentenceLevel(r.sentence_id as string);
    const b = ensure(date, level);
    b.aSum += Number(r.analysis_match_rate ?? 0) * 100;
    b.aN += 1;
  });

  (words ?? []).forEach((r) => {
    const date = (r.taken_at as string).slice(0, 10);
    const level = sentenceLevel(r.sentence_id as string);
    const b = ensure(date, level);
    b.wSum += Number(r.score ?? 0) * 100;
    b.wN += 1;
  });

  // Handout (no level info) — distribute to "ALL" series; we'll skip those to keep level-pure
  // Compose points
  const points: LevelTrendPoint[] = [];
  const dates = Array.from(map.keys()).sort();
  const handoutByDate = new Map<string, { w: number | null; s: "PASS" | "FAIL" | null }>();
  (handouts ?? []).forEach((h) => {
    handoutByDate.set(h.test_date as string, {
      w: h.word_ho_score == null ? null : Number(h.word_ho_score),
      s: h.syntax_ho_result as "PASS" | "FAIL" | null,
    });
  });

  for (const date of dates) {
    const lvls = map.get(date)!;
    const point: LevelTrendPoint = { date };
    lvls.forEach((b, level) => {
      const parts: { v: number; w: number }[] = [];
      if (b.aN > 0) parts.push({ v: b.aSum / b.aN, w: WEIGHTS.analysis });
      if (b.wN > 0) parts.push({ v: b.wSum / b.wN, w: WEIGHTS.wordTest });
      const h = handoutByDate.get(date);
      if (h?.w != null) parts.push({ v: h.w, w: WEIGHTS.wordHo });
      if (h?.s) parts.push({ v: h.s === "PASS" ? 100 : 0, w: WEIGHTS.syntaxHo });
      if (parts.length === 0) {
        point[level] = null;
      } else {
        const totalW = parts.reduce((s, p) => s + p.w, 0);
        point[level] = Math.round((parts.reduce((s, p) => s + p.v * p.w, 0) / totalW) * 10) / 10;
      }
    });
    points.push(point);
  }

  return points;
}

export async function fetchSourceBreakdown(userId: string, days = 14): Promise<SourceBreakdownPoint[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const { data } = await supabase
    .from("sentence_attempt_logs")
    .select("attempt_source, completed_at")
    .eq("user_id", userId)
    .gte("completed_at", since.toISOString());

  const map = new Map<string, SourceBreakdownPoint>();
  // Pre-fill for continuous x-axis
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1 - i));
    const key = toIsoDate(d);
    map.set(key, { date: key, regular: 0, review: 0, assignment: 0, test: 0 });
  }

  (data ?? []).forEach((r) => {
    const date = (r.completed_at as string).slice(0, 10);
    const cur = map.get(date);
    if (!cur) return;
    const src = (r.attempt_source as AttemptSource) ?? "regular";
    if (src === "review") cur.review += 1;
    else if (src === "assignment") cur.assignment += 1;
    else if (src === "test") cur.test += 1;
    else cur.regular += 1;
  });

  return Array.from(map.values());
}

export async function fetchRecentAttempts(userId: string, limit = 20): Promise<RecentAttemptRow[]> {
  const { data } = await supabase
    .from("sentence_attempt_logs")
    .select(
      "id, sentence_id, attempt_source, attempt_no, analysis_passed, analysis_match_rate, word_test_passed, word_test_score, completed_at",
    )
    .eq("user_id", userId)
    .order("completed_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((r) => ({
    id: r.id as string,
    sentence_id: r.sentence_id as string,
    level: sentenceLevel(r.sentence_id as string),
    attempt_source: (r.attempt_source as AttemptSource) ?? "regular",
    attempt_no: Number(r.attempt_no ?? 1),
    analysis_passed: Boolean(r.analysis_passed),
    analysis_match_rate: Number(r.analysis_match_rate ?? 0),
    word_test_passed: Boolean(r.word_test_passed),
    word_test_score: Number(r.word_test_score ?? 0),
    completed_at: r.completed_at as string,
  }));
}

// Re-export for convenience
export { LEVELS };

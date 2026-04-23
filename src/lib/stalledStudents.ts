import { supabase } from "@/integrations/supabase/client";

export interface StalledStudent {
  user_id: string;
  sentence_id: string;
  last_activity_at: string;
  pre_done: boolean;
  word_test_done: boolean;
  analysis_done: boolean;
  translation_done: boolean;
  analysis_match_rate: number | null;
  word_test_score: number | null;
  word_test_passed: boolean | null;
  // 가장 최근 도달 단계
  furthest_step: "pre" | "wordtest" | "analysis" | "translation" | "none";
}

export interface StalledAssignmentTarget {
  assignment_id: string;
  assignment_title: string;
  due_at: string;
  sentence_id: string;
  user_id: string;
  include_pre: boolean;
  include_analysis: boolean;
  include_translation: boolean;
  include_wordtest: boolean;
  // 진척
  pre_done: boolean;
  word_test_done: boolean;
  analysis_done: boolean;
  translation_done: boolean;
  word_test_score: number | null;
  hours_until_due: number;
}

const STALL_DAYS = 3;

const computeFurthest = (r: {
  pre_done: boolean;
  word_test_done: boolean;
  analysis_done: boolean;
  translation_done: boolean;
}): StalledStudent["furthest_step"] => {
  if (r.translation_done) return "translation";
  if (r.analysis_done) return "analysis";
  if (r.word_test_done) return "wordtest";
  if (r.pre_done) return "pre";
  return "none";
};

/**
 * 장기 정체: last_activity_at이 STALL_DAYS일 이상 + translation_done=false + 어떤 단계라도 시작한 학생
 */
export async function fetchLongStalled(): Promise<StalledStudent[]> {
  const cutoff = new Date(Date.now() - STALL_DAYS * 24 * 3_600_000).toISOString();

  const { data: progRows } = await supabase
    .from("sentence_progress")
    .select(
      "user_id, sentence_id, last_activity_at, pre_done, word_test_done, analysis_done, translation_done, analysis_match_rate",
    )
    .eq("translation_done", false)
    .lte("last_activity_at", cutoff)
    .order("last_activity_at", { ascending: true })
    .limit(200);

  const list = (progRows ?? []).filter(
    (r: any) => r.pre_done || r.word_test_done || r.analysis_done,
  );

  if (list.length === 0) return [];

  // 단어테스트 최고 점수 일괄 조회
  const userIds = Array.from(new Set(list.map((r: any) => r.user_id).filter(Boolean)));
  const sentenceIds = Array.from(new Set(list.map((r: any) => r.sentence_id)));
  const { data: wtRows } = await supabase
    .from("word_test_results")
    .select("user_id, sentence_id, passed, score")
    .in("user_id", userIds)
    .in("sentence_id", sentenceIds);

  const wtMap = new Map<string, { passed: boolean; score: number }>();
  ((wtRows ?? []) as any[]).forEach((r) => {
    const key = `${r.user_id}::${r.sentence_id}`;
    const score = Number(r.score ?? 0);
    const passed = !!r.passed;
    const cur = wtMap.get(key);
    if (!cur || (passed && !cur.passed) || (passed === cur.passed && score > cur.score)) {
      wtMap.set(key, { passed, score });
    }
  });

  return list.map((r: any) => {
    const key = `${r.user_id}::${r.sentence_id}`;
    const wt = wtMap.get(key);
    return {
      user_id: r.user_id,
      sentence_id: r.sentence_id,
      last_activity_at: r.last_activity_at,
      pre_done: !!r.pre_done,
      word_test_done: !!r.word_test_done,
      analysis_done: !!r.analysis_done,
      translation_done: !!r.translation_done,
      analysis_match_rate: r.analysis_match_rate != null ? Number(r.analysis_match_rate) : null,
      word_test_score: wt ? (wt.score <= 1 ? Math.round(wt.score * 100) : Math.round(wt.score)) : null,
      word_test_passed: wt ? wt.passed : null,
      furthest_step: computeFurthest(r),
    } as StalledStudent;
  });
}

/**
 * 마감 임박 미완료: assignments.due_at이 24시간 이내 + 모든 단계 미완료 학생
 */
export async function fetchImminentIncomplete(): Promise<StalledAssignmentTarget[]> {
  const nowIso = new Date().toISOString();
  const in24h = new Date(Date.now() + 24 * 3_600_000).toISOString();

  const { data: asgs } = await supabase
    .from("assignments")
    .select(
      "id, title, due_at, sentence_id, student_id, include_pre, include_analysis, include_translation, include_wordtest",
    )
    .gte("due_at", nowIso)
    .lte("due_at", in24h)
    .order("due_at", { ascending: true });

  if (!asgs || asgs.length === 0) return [];

  // 전체 학생 user_id (student_id null 과제 대상 보완용)
  const { data: allStudents } = await supabase
    .from("student_profiles")
    .select("user_id");
  const allIds = (allStudents ?? []).map((s: any) => s.user_id as string);

  const results: StalledAssignmentTarget[] = [];

  for (const a of asgs as any[]) {
    if (!a.sentence_id) continue;
    const targets: string[] = a.student_id ? [a.student_id] : allIds;
    if (targets.length === 0) continue;

    const { data: progRows } = await supabase
      .from("sentence_progress")
      .select(
        "user_id, pre_done, word_test_done, analysis_done, translation_done",
      )
      .eq("sentence_id", a.sentence_id)
      .in("user_id", targets);

    const progMap = new Map<string, any>();
    ((progRows ?? []) as any[]).forEach((r) => progMap.set(r.user_id, r));

    const { data: wtRows } = await supabase
      .from("word_test_results")
      .select("user_id, passed, score")
      .eq("sentence_id", a.sentence_id)
      .in("user_id", targets);
    const wtMap = new Map<string, { passed: boolean; score: number }>();
    ((wtRows ?? []) as any[]).forEach((r) => {
      const score = Number(r.score ?? 0);
      const passed = !!r.passed;
      const cur = wtMap.get(r.user_id);
      if (!cur || (passed && !cur.passed) || (passed === cur.passed && score > cur.score)) {
        wtMap.set(r.user_id, { passed, score });
      }
    });

    for (const uid of targets) {
      const p = progMap.get(uid);
      const isComplete =
        p &&
        (!a.include_pre || p.pre_done) &&
        (!a.include_wordtest || p.word_test_done) &&
        (!a.include_analysis || p.analysis_done) &&
        (!a.include_translation || p.translation_done);
      if (isComplete) continue;

      const wt = wtMap.get(uid);
      results.push({
        assignment_id: a.id,
        assignment_title: a.title,
        due_at: a.due_at,
        sentence_id: a.sentence_id,
        user_id: uid,
        include_pre: a.include_pre,
        include_analysis: a.include_analysis,
        include_translation: a.include_translation,
        include_wordtest: a.include_wordtest,
        pre_done: !!p?.pre_done,
        word_test_done: !!p?.word_test_done,
        analysis_done: !!p?.analysis_done,
        translation_done: !!p?.translation_done,
        word_test_score: wt ? (wt.score <= 1 ? Math.round(wt.score * 100) : Math.round(wt.score)) : null,
        hours_until_due: Math.max(0, Math.floor((new Date(a.due_at).getTime() - Date.now()) / 3_600_000)),
      });
    }
  }

  return results.sort((a, b) => a.hours_until_due - b.hours_until_due);
}

export const STALL_THRESHOLD_DAYS = STALL_DAYS;

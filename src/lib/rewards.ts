// Rewards: points, streak, and sentence pass marking.
import { supabase } from "@/integrations/supabase/client";
import { upsertSentenceProgress } from "@/integrations/supabase/storage";

export const POINTS = {
  firstPass: 10,
  retryPass: 5,
  perfectBonus: 5,
  streakMilestoneBonus: 20,
  streakMilestone: 5,
};

export interface StudentRewards {
  points: number;
  current_streak: number;
  best_streak: number;
  threshold: number;
}

export const fetchStudentRewards = async (): Promise<StudentRewards | null> => {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return null;
  const { data } = await supabase
    .from("student_profiles")
    .select("points, current_streak, best_streak, word_test_pass_threshold")
    .eq("user_id", u.user.id)
    .maybeSingle();
  if (!data) return null;
  return {
    points: data.points ?? 0,
    current_streak: data.current_streak ?? 0,
    best_streak: data.best_streak ?? 0,
    threshold: Number(data.word_test_pass_threshold ?? 0.8),
  };
};

export interface PassRewardResult {
  delta: number;
  streak: number;
  bestStreak: number;
  totalPoints: number;
  milestoneHit: boolean;
}

export const grantPassReward = async (
  sentenceId: string,
  score: number,
  attemptNo: number,
): Promise<PassRewardResult | null> => {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return null;
  const userId = u.user.id;

  const { data: prof } = await supabase
    .from("student_profiles")
    .select("points, current_streak, best_streak")
    .eq("user_id", userId)
    .maybeSingle();
  const curPoints = prof?.points ?? 0;
  const curStreak = prof?.current_streak ?? 0;
  const curBest = prof?.best_streak ?? 0;

  let delta = attemptNo <= 1 ? POINTS.firstPass : POINTS.retryPass;
  if (score >= 1) delta += POINTS.perfectBonus;
  const nextStreak = curStreak + 1;
  const milestoneHit = nextStreak > 0 && nextStreak % POINTS.streakMilestone === 0;
  if (milestoneHit) delta += POINTS.streakMilestoneBonus;
  const nextBest = Math.max(curBest, nextStreak);
  const nextPoints = curPoints + delta;

  await supabase
    .from("student_profiles")
    .update({
      points: nextPoints,
      current_streak: nextStreak,
      best_streak: nextBest,
    })
    .eq("user_id", userId);

  await supabase.from("points_log").insert({
    user_id: userId,
    sentence_id: sentenceId,
    delta,
    reason: milestoneHit ? "streak_bonus" : "word_test_pass",
  });

  // 단어테스트 통과는 word_test_done 만 마킹한다.
  // status='pass'는 한글 해석 제출(=recordAttempt) 또는 선생님 override 시점에서만 설정.
  // 여기서 status를 'pass'로 바꾸면 다음 지문 산정(nextSentence)이 이 지문을 완료로 간주해
  // 학생이 구문분석/한글해석 단계로 진입하지 못한 채 다음 지문으로 건너뛰어 버린다.
  await upsertSentenceProgress(sentenceId, {
    word_test_done: true,
  });

  return {
    delta,
    streak: nextStreak,
    bestStreak: nextBest,
    totalPoints: nextPoints,
    milestoneHit,
  };
};

export const resetStreakOnFail = async (): Promise<void> => {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return;
  await supabase.from("student_profiles").update({ current_streak: 0 }).eq("user_id", u.user.id);
};

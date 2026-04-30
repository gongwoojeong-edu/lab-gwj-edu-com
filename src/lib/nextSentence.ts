import { SENTENCES, type Sentence } from "@/data/sentences";
import { type LevelCode } from "@/lib/levels";
import { supabase } from "@/integrations/supabase/client";
import { fetchMyProfile, updateMyProgress, type StudentProfile } from "@/lib/studentProfile";
import { hydrateSentencesFromDb } from "@/lib/sentenceSource";

export interface NextSentenceResult {
  sentence: Sentence | null;
  profile: StudentProfile | null;
  done: boolean;
  /** 지정 레벨에 등록된 지문 자체가 0개인 경우(학습 자료 미준비) */
  noContent?: boolean;
}

export const resolveNextSentence = async (): Promise<NextSentenceResult> => {
  // DB 지문이 SENTENCES에 머지될 때까지 대기 (실패해도 정적 폴백)
  await hydrateSentencesFromDb();
  const profile = await fetchMyProfile();
  if (!profile) return { sentence: null, profile: null, done: false };

  // 선생님이 학생목록에서 지정한 학년(start_level)을 항상 기준으로 삼는다.
  const targetLevel = profile.start_level;

  // pull all passed sentence ids for this user
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return { sentence: null, profile, done: false };
  const { data: passedRows } = await supabase
    .from("sentence_progress")
    .select("sentence_id, status")
    .eq("user_id", u.user.id)
    .in("status", ["pass", "fail"]);
  const passed = new Set(((passedRows ?? []) as { sentence_id: string }[]).map((r) => r.sentence_id));

  const inLevel = SENTENCES.filter((s) => s.level === targetLevel).sort((a, b) => a.no - b.no);

  // 지정 레벨에 등록된 지문이 0개 → 학습 자료 미준비 상태(완료가 아님)
  if (inLevel.length === 0) {
    return { sentence: null, profile, done: false, noContent: true };
  }

  const found = inLevel.find((s) => !passed.has(s.id));
  if (found) {
    if (profile.current_level !== targetLevel || profile.current_no !== found.no) {
      await updateMyProgress(targetLevel, found.no);
    }
    return { sentence: found, profile: { ...profile, current_level: targetLevel, current_no: found.no }, done: false };
  }
  if (profile.current_level !== targetLevel) {
    await updateMyProgress(targetLevel, 1);
  }
  return { sentence: null, profile: { ...profile, current_level: targetLevel }, done: true };
};

export const advanceAfterPass = async (justPassed: Sentence): Promise<void> => {
  // 진도(current_level/current_no)는 항상 선생님이 지정한 start_level 기준으로만 갱신.
  // 학생이 링크로 다른 레벨 문장을 풀어도 지정 레벨이 흔들리지 않도록 한다.
  const profile = await fetchMyProfile();
  if (!profile) return;
  if (justPassed.level !== profile.start_level) {
    // 지정 외 레벨 학습은 진도에 반영하지 않음
    return;
  }
  await updateMyProgress(profile.start_level, justPassed.no + 1);
};

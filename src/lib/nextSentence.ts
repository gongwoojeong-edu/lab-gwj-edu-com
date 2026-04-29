import { SENTENCES, type Sentence } from "@/data/sentences";
import { type LevelCode } from "@/lib/levels";
import { supabase } from "@/integrations/supabase/client";
import { fetchMyProfile, updateMyProgress, type StudentProfile } from "@/lib/studentProfile";
import { hydrateSentencesFromDb } from "@/lib/sentenceSource";

export interface NextSentenceResult {
  sentence: Sentence | null;
  profile: StudentProfile | null;
  done: boolean;
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
  // 같은 학년 안에서 다음 번호로만 이동한다. 학년 변경은 선생님 설정(start_level)만 따른다.
  await updateMyProgress(justPassed.level, justPassed.no + 1);
};

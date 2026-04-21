import { SENTENCES, type Sentence } from "@/data/sentences";
import { LEVELS, type LevelCode } from "@/lib/levels";
import { supabase } from "@/integrations/supabase/client";
import { fetchMyProfile, updateMyProgress, type StudentProfile } from "@/lib/studentProfile";
import { hydrateSentencesFromDb } from "@/lib/sentenceSource";

export interface NextSentenceResult {
  sentence: Sentence | null;
  profile: StudentProfile | null;
  done: boolean;
}

const compareLevel = (a: LevelCode, b: LevelCode) => a.localeCompare(b);

export const resolveNextSentence = async (): Promise<NextSentenceResult> => {
  // DB 지문이 SENTENCES에 머지될 때까지 대기 (실패해도 정적 폴백)
  await hydrateSentencesFromDb();
  const profile = await fetchMyProfile();
  if (!profile) return { sentence: null, profile: null, done: false };

  // start floor: never go below start_level
  const startIdx = LEVELS.findIndex((l) => l.code === profile.start_level);
  const curIdx = LEVELS.findIndex((l) => l.code === profile.current_level);
  const beginIdx = Math.max(curIdx, startIdx);

  // pull all passed sentence ids for this user
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return { sentence: null, profile, done: false };
  const { data: passedRows } = await supabase
    .from("sentence_progress")
    .select("sentence_id, status")
    .eq("user_id", u.user.id)
    .in("status", ["pass", "fail"]);
  const passed = new Set(((passedRows ?? []) as { sentence_id: string }[]).map((r) => r.sentence_id));

  for (let i = beginIdx; i < LEVELS.length; i++) {
    const level = LEVELS[i].code;
    const inLevel = SENTENCES.filter((s) => s.level === level).sort((a, b) => a.no - b.no);
    if (inLevel.length === 0) continue;
    const found = inLevel.find((s) => !passed.has(s.id));
    if (found) {
      // sync profile.current_level/no if drifted
      if (
        profile.current_level !== level ||
        profile.current_no !== found.no ||
        compareLevel(profile.current_level, profile.start_level) < 0
      ) {
        await updateMyProgress(level, found.no);
      }
      return { sentence: found, profile: { ...profile, current_level: level, current_no: found.no }, done: false };
    }
  }
  return { sentence: null, profile, done: true };
};

export const advanceAfterPass = async (justPassed: Sentence): Promise<void> => {
  // simply mark that we want the next one — resolveNextSentence will figure out which.
  await updateMyProgress(justPassed.level, justPassed.no + 1);
};

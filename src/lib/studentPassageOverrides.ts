import { supabase } from "@/integrations/supabase/client";

export interface StudentPassageOverride {
  user_id: string;
  sentence_id: string;
  skip_pre: boolean;
}

/** 학생의 모든 sentence override 조회 */
export const fetchOverridesForStudent = async (
  userId: string,
): Promise<StudentPassageOverride[]> => {
  const { data, error } = await supabase
    .from("student_passage_overrides")
    .select("user_id, sentence_id, skip_pre")
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? []) as StudentPassageOverride[];
};

/** 본인(학생) + 특정 sentence 의 override 조회 */
export const fetchMyOverrideForSentence = async (
  sentenceId: string,
): Promise<StudentPassageOverride | null> => {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return null;
  const { data } = await supabase
    .from("student_passage_overrides")
    .select("user_id, sentence_id, skip_pre")
    .eq("user_id", u.user.id)
    .eq("sentence_id", sentenceId)
    .maybeSingle();
  return (data as StudentPassageOverride) ?? null;
};

/** 교사: 학생×sentence skip_pre 토글 (upsert) */
export const upsertSkipPre = async (
  userId: string,
  sentenceId: string,
  skipPre: boolean,
): Promise<void> => {
  const { data: u } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("student_passage_overrides")
    .upsert(
      {
        user_id: userId,
        sentence_id: sentenceId,
        skip_pre: skipPre,
        created_by: u.user?.id ?? null,
      },
      { onConflict: "user_id,sentence_id" },
    );
  if (error) throw error;
};

/** 교사: 학생×sentence override 행 자체 삭제 */
export const deleteOverride = async (
  userId: string,
  sentenceId: string,
): Promise<void> => {
  const { error } = await supabase
    .from("student_passage_overrides")
    .delete()
    .eq("user_id", userId)
    .eq("sentence_id", sentenceId);
  if (error) throw error;
};

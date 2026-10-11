import { supabase } from "@/integrations/supabase/client";

/** 학생별 지정. 다른 override(스킵 등)는 변경하지 않는다. */
export async function setImportantSentence(userId: string, sentenceId: string, important: boolean): Promise<void> {
  const { data, error } = await supabase.from("student_passage_overrides")
    .upsert({ user_id: userId, sentence_id: sentenceId, important_sentence: important }, { onConflict: "user_id,sentence_id" })
    .select("sentence_id").single();
  if (error) throw error;
  if (!data) throw new Error("중요문장 표시를 저장하지 못했습니다.");
}

export async function fetchImportantSentenceIds(userId: string, codes: string[]): Promise<Set<string>> {
  const ids = new Set<string>();
  for (let i = 0; i < codes.length; i += 200) {
    const { data, error } = await supabase.from("student_passage_overrides")
      .select("sentence_id").eq("user_id", userId).eq("important_sentence", true)
      .in("sentence_id", codes.slice(i, i + 200));
    if (error) throw error;
    for (const row of data ?? []) ids.add(row.sentence_id);
  }
  return ids;
}
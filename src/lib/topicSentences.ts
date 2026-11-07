import { supabase } from "@/integrations/supabase/client";

/** 학생별 주제문 지정: 중요·스킵·승인 상태는 변경하지 않는다. */
export async function setTopicSentence(userId: string, sentenceId: string, topic: boolean): Promise<void> {
  const { data, error } = await supabase.from("student_passage_overrides")
    .upsert({ user_id: userId, sentence_id: sentenceId, topic_sentence: topic }, { onConflict: "user_id,sentence_id" })
    .select("sentence_id").single();
  if (error) throw error;
  if (!data) throw new Error("주제문 표시를 저장하지 못했습니다.");
}

export async function fetchTopicSentenceIds(userId: string, codes: string[]): Promise<Set<string>> {
  const ids = new Set<string>();
  for (let i = 0; i < codes.length; i += 200) {
    const { data, error } = await supabase.from("student_passage_overrides")
      .select("sentence_id").eq("user_id", userId).eq("topic_sentence", true)
      .in("sentence_id", codes.slice(i, i + 200));
    if (error) throw error;
    for (const row of data ?? []) ids.add(row.sentence_id);
  }
  return ids;
}
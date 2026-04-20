import { supabase } from "@/integrations/supabase/client";

export type AssistEntry = {
  word: string;
  stage: "speak" | "meaning";
  type: "stuck" | "teacher_skip";
  attempts: number;
  lastHeard?: string;
};

export interface WordPreResult {
  sentence_id: string;
  known_words: string[];
  unknown_words: string[];
  completed: boolean;
}

export const insertWordPreResult = async (
  sentenceId: string,
  known: string[],
  unknown: string[],
  assistLog: AssistEntry[] = [],
): Promise<void> => {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return;
  await supabase.from("word_pre_results").insert({
    user_id: u.user.id,
    sentence_id: sentenceId,
    known_words: known,
    unknown_words: unknown,
    completed: true,
    assist_log: assistLog as unknown as never,
  });
};

export const fetchLatestWordPre = async (sentenceId: string): Promise<WordPreResult | null> => {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return null;
  const { data } = await supabase
    .from("word_pre_results")
    .select("sentence_id, known_words, unknown_words, completed")
    .eq("user_id", u.user.id)
    .eq("sentence_id", sentenceId)
    .order("taken_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as WordPreResult) ?? null;
};

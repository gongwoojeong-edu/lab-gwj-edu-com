import { supabase } from "@/integrations/supabase/client";

/** Merge source text, vocabulary and each learner's translations in one transaction. */
export async function mergePassagesWithTranslations(ids: string[]): Promise<void> {
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length < 2) throw new Error("서로 다른 문장을 두 개 이상 선택해 주세요.");
  const { error } = await supabase.rpc("merge_passages_with_translations", { p_ids: uniqueIds });
  if (error) throw error;
}
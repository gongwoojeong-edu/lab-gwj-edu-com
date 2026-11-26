import { supabase } from "@/integrations/supabase/client";
import type { ReferentAnswer, ReferentKind } from "@/lib/pronounReferents";

type Row = { user_id: string; word_index: number; word: string; kind: string; target_index: number | null; outside_text: string | null; non_pronoun_type: string | null };
const toAnswer = (r: Row): ReferentAnswer => ({
  wordIndex: r.word_index, word: r.word, kind: r.kind as ReferentKind,
  targetIndex: r.target_index, outsideText: r.outside_text, nonPronounType: r.non_pronoun_type,
});
const COLS = "user_id, word_index, word, kind, target_index, outside_text, non_pronoun_type";

export async function fetchReferents(userId: string, sentenceId: string): Promise<ReferentAnswer[]> {
  const { data, error } = await supabase.from("pronoun_referents").select(COLS)
    .eq("user_id", userId).eq("sentence_id", sentenceId).order("word_index");
  if (error) throw error;
  return ((data ?? []) as Row[]).map(toAnswer);
}

/** 문장 하나의 지시어 답을 통째로 교체 저장 */
export async function saveReferents(userId: string, sentenceId: string, answers: ReferentAnswer[]): Promise<void> {
  const keep = answers.map((a) => a.wordIndex);
  let del = supabase.from("pronoun_referents").delete().eq("user_id", userId).eq("sentence_id", sentenceId);
  if (keep.length) del = del.not("word_index", "in", `(${keep.join(",")})`);
  const { error: dErr } = await del;
  if (dErr) throw dErr;
  if (!answers.length) return;
  const now = new Date().toISOString();
  const { error } = await supabase.from("pronoun_referents").upsert(answers.map((a) => ({
    user_id: userId, sentence_id: sentenceId, word_index: a.wordIndex, word: a.word, kind: a.kind,
    target_index: a.kind === "in_sentence" ? a.targetIndex ?? null : null,
    outside_text: a.kind === "outside" ? a.outsideText?.trim() ?? null : null,
    non_pronoun_type: a.kind === "non_pronoun" ? a.nonPronounType ?? null : null,
    updated_at: now,
  })), { onConflict: "user_id,sentence_id,word_index" });
  if (error) throw error;
}

/** 원장(admin) 계정이 등록한 정답. 여러 명이면 먼저 나온 것 */
export async function fetchMasterReferents(sentenceId: string): Promise<Map<number, ReferentAnswer>> {
  const { data: roles, error: rolesError } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
  if (rolesError) throw rolesError;
  const ids = ((roles ?? []) as { user_id: string }[]).map((r) => r.user_id);
  const out = new Map<number, ReferentAnswer>();
  if (!ids.length) return out;
  const { data, error } = await supabase.from("pronoun_referents").select(COLS)
    .eq("sentence_id", sentenceId).in("user_id", ids);
  if (error) throw error;
  for (const r of (data ?? []) as Row[]) if (!out.has(r.word_index)) out.set(r.word_index, toAnswer(r));
  return out;
}

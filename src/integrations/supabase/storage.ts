// ============================================================
// storage.ts — Supabase CRUD wrappers for all learning data
// Anonymous-friendly: user_id is null when not logged in.
// ============================================================
import { supabase } from "./client";

const getUserId = async (): Promise<string | null> => {
  try {
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
};

// ---------- sentence_progress ----------
export interface SentenceProgressRow {
  sentence_id: string;
  pre_done: boolean;
  analysis_done: boolean;
  translation_done: boolean;
  word_test_done: boolean;
  status: "in_progress" | "pass";
  passed_at: string | null;
}

export const fetchSentenceProgress = async (sentenceId: string): Promise<SentenceProgressRow | null> => {
  const userId = await getUserId();
  let q = supabase.from("sentence_progress").select("*").eq("sentence_id", sentenceId);
  q = userId ? q.eq("user_id", userId) : q.is("user_id", null);
  const { data } = await q.maybeSingle();
  return (data as SentenceProgressRow) ?? null;
};

export const upsertSentenceProgress = async (
  sentenceId: string,
  patch: Partial<Omit<SentenceProgressRow, "sentence_id">>,
): Promise<void> => {
  const userId = await getUserId();
  const existing = await fetchSentenceProgress(sentenceId);
  const next = {
    user_id: userId,
    sentence_id: sentenceId,
    pre_done: existing?.pre_done ?? false,
    analysis_done: existing?.analysis_done ?? false,
    translation_done: existing?.translation_done ?? false,
    word_test_done: existing?.word_test_done ?? false,
    status: existing?.status ?? "in_progress",
    passed_at: existing?.passed_at ?? null,
    ...patch,
  };
  await supabase.from("sentence_progress").upsert(next, { onConflict: "user_id,sentence_id" });
};

// ---------- owner_progress ----------
export interface OwnerProgressRow {
  sentence_id: string;
  owner_id: string;
  progress: unknown;
  custom_answer: unknown;
  completed: boolean;
}

export const fetchOwnerProgressForSentence = async (sentenceId: string): Promise<OwnerProgressRow[]> => {
  const userId = await getUserId();
  let q = supabase.from("owner_progress").select("*").eq("sentence_id", sentenceId);
  q = userId ? q.eq("user_id", userId) : q.is("user_id", null);
  const { data } = await q;
  return (data as OwnerProgressRow[]) ?? [];
};

export const upsertOwnerProgress = async (row: OwnerProgressRow): Promise<void> => {
  const userId = await getUserId();
  const payload = { user_id: userId, ...row } as never;
  await supabase.from("owner_progress").upsert(payload, { onConflict: "user_id,sentence_id,owner_id" });
};

export const deleteOwnerProgress = async (sentenceId: string, ownerId: string): Promise<void> => {
  const userId = await getUserId();
  let q = supabase.from("owner_progress").delete().eq("sentence_id", sentenceId).eq("owner_id", ownerId);
  q = userId ? q.eq("user_id", userId) : q.is("user_id", null);
  await q;
};

// ---------- sentence_translations ----------
export const fetchTranslation = async (sentenceId: string): Promise<string | null> => {
  const userId = await getUserId();
  let q = supabase.from("sentence_translations").select("text").eq("sentence_id", sentenceId);
  q = userId ? q.eq("user_id", userId) : q.is("user_id", null);
  const { data } = await q.maybeSingle();
  return (data?.text as string) ?? null;
};

export const upsertTranslation = async (sentenceId: string, text: string): Promise<void> => {
  const userId = await getUserId();
  await supabase.from("sentence_translations").upsert(
    { user_id: userId, sentence_id: sentenceId, text, submitted_at: new Date().toISOString() },
    { onConflict: "user_id,sentence_id" },
  );
};

// ---------- word_test_results ----------
export interface WordTestItem {
  word: string;
  expected: string;
  given: string;
  correct: boolean;
}

export const insertWordTestResult = async (
  sentenceId: string,
  items: WordTestItem[],
  score: number,
  passed: boolean,
): Promise<void> => {
  const userId = await getUserId();
  const payload = {
    user_id: userId,
    sentence_id: sentenceId,
    items: items as unknown as object,
    score,
    passed,
  } as never;
  await supabase.from("word_test_results").insert(payload);
};

export const fetchLatestWordTest = async (sentenceId: string) => {
  const userId = await getUserId();
  let q = supabase.from("word_test_results").select("*").eq("sentence_id", sentenceId);
  q = userId ? q.eq("user_id", userId) : q.is("user_id", null);
  const { data } = await q.order("taken_at", { ascending: false }).limit(1).maybeSingle();
  return data;
};

// ---------- badge_offsets ----------
export const fetchBadgeOffsets = async (sentenceId: string): Promise<Record<string, number>> => {
  const userId = await getUserId();
  let q = supabase.from("badge_offsets").select("owner_id, dx").eq("sentence_id", sentenceId);
  q = userId ? q.eq("user_id", userId) : q.is("user_id", null);
  const { data } = await q;
  const map: Record<string, number> = {};
  (data ?? []).forEach((r: { owner_id: string; dx: number }) => {
    map[r.owner_id] = r.dx;
  });
  return map;
};

export const upsertBadgeOffset = async (sentenceId: string, ownerId: string, dx: number): Promise<void> => {
  const userId = await getUserId();
  await supabase.from("badge_offsets").upsert(
    { user_id: userId, sentence_id: sentenceId, owner_id: ownerId, dx },
    { onConflict: "user_id,sentence_id,owner_id" },
  );
};

// ---------- modifier_relations ----------
export interface RelationRow {
  source_owner_id: string;
  target_owner_id: string;
}

export const fetchModifierRelations = async (sentenceId: string): Promise<RelationRow[]> => {
  const userId = await getUserId();
  let q = supabase.from("modifier_relations").select("source_owner_id, target_owner_id").eq("sentence_id", sentenceId);
  q = userId ? q.eq("user_id", userId) : q.is("user_id", null);
  const { data } = await q;
  return (data as RelationRow[]) ?? [];
};

export const upsertModifierRelation = async (sentenceId: string, rel: RelationRow): Promise<void> => {
  const userId = await getUserId();
  await supabase.from("modifier_relations").upsert(
    { user_id: userId, sentence_id: sentenceId, ...rel },
    { onConflict: "user_id,sentence_id,source_owner_id" },
  );
};

export const deleteModifierRelation = async (sentenceId: string, source: string): Promise<void> => {
  const userId = await getUserId();
  let q = supabase.from("modifier_relations").delete().eq("sentence_id", sentenceId).eq("source_owner_id", source);
  q = userId ? q.eq("user_id", userId) : q.is("user_id", null);
  await q;
};

// ---------- referent_relations ----------
export const fetchReferentRelations = async (sentenceId: string): Promise<RelationRow[]> => {
  const userId = await getUserId();
  let q = supabase.from("referent_relations").select("source_owner_id, target_owner_id").eq("sentence_id", sentenceId);
  q = userId ? q.eq("user_id", userId) : q.is("user_id", null);
  const { data } = await q;
  return (data as RelationRow[]) ?? [];
};

export const upsertReferentRelation = async (sentenceId: string, rel: RelationRow): Promise<void> => {
  const userId = await getUserId();
  await supabase.from("referent_relations").upsert(
    { user_id: userId, sentence_id: sentenceId, ...rel },
    { onConflict: "user_id,sentence_id,source_owner_id" },
  );
};

export const deleteReferentRelation = async (sentenceId: string, source: string): Promise<void> => {
  const userId = await getUserId();
  let q = supabase.from("referent_relations").delete().eq("sentence_id", sentenceId).eq("source_owner_id", source);
  q = userId ? q.eq("user_id", userId) : q.is("user_id", null);
  await q;
};

// ---------- idioms ----------
export interface IdiomRow {
  sentence_id: string;
  indices: number[];
  surface: string;
  meaning: string;
  created_at?: string;
}

export const fetchIdiomsAll = async (): Promise<IdiomRow[]> => {
  const userId = await getUserId();
  let q = supabase.from("idioms").select("*");
  q = userId ? q.eq("user_id", userId) : q.is("user_id", null);
  const { data } = await q.order("created_at", { ascending: true });
  return (data as IdiomRow[]) ?? [];
};

export const upsertIdiomRow = async (row: IdiomRow): Promise<void> => {
  const userId = await getUserId();
  await supabase.from("idioms").upsert(
    { user_id: userId, ...row },
    { onConflict: "user_id,sentence_id,indices" },
  );
};

export const deleteIdiomRow = async (sentenceId: string, indices: number[]): Promise<void> => {
  const userId = await getUserId();
  let q = supabase.from("idioms").delete().eq("sentence_id", sentenceId).eq("indices", indices);
  q = userId ? q.eq("user_id", userId) : q.is("user_id", null);
  await q;
};

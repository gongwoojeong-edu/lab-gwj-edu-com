// ============================================================
// storage.ts — Supabase CRUD wrappers for all learning data
// Anonymous-friendly: user_id is null when not logged in.
// ============================================================
import { supabase } from "./client";
import { getCurrentUserId } from "@/lib/authState";

const getUserId = async (): Promise<string | null> => {
  return getCurrentUserId();
};

const requireUserId = async (): Promise<string> => {
  const userId = await getUserId();
  if (!userId) {
    throw new Error("로그인이 확인되지 않아 저장할 수 없습니다. 다시 로그인해 주세요.");
  }
  return userId;
};

// ---------- sentence_progress ----------
export type SentenceProgressStatus = "pending" | "pass" | "fail" | "hold";

export interface SentenceProgressRow {
  sentence_id: string;
  pre_done: boolean;
  analysis_done: boolean;
  translation_done: boolean;
  word_test_done: boolean;
  status: SentenceProgressStatus;
  passed_at: string | null;
  analysis_match_rate: number | null;
  last_activity_at: string | null;
  redo_requested_at?: string | null;
  last_redo_memo?: string | null;
  last_grade?: string | null;
  last_memo?: string | null;
  mem_listen_done?: boolean;
  mem_scramble_done?: boolean;
  mem_cloze_done?: boolean;
  mem_dictation_done?: boolean;
  mem_speech_done?: boolean;
  mem_record_done?: boolean;
  mem_ko_to_en_done?: boolean;
  mem_en_to_ko_done?: boolean;
  mem_direction?: string | null;
  mem_passed_at?: string | null;
  mem_attempt_count?: number;
}


export const fetchSentenceProgress = async (sentenceId: string): Promise<SentenceProgressRow | null> => {
  const userId = await getUserId();
  let q = supabase.from("sentence_progress").select("*").eq("sentence_id", sentenceId);
  q = userId ? q.eq("user_id", userId) : q.is("user_id", null);
  const { data, error } = await q.maybeSingle();
  if (error) throw error;
  return (data as SentenceProgressRow) ?? null;
};

export const upsertSentenceProgress = async (
  sentenceId: string,
  patch: Partial<Omit<SentenceProgressRow, "sentence_id">> & { touchActivity?: boolean },
): Promise<void> => {
  const userId = await requireUserId();
  const existing = await fetchSentenceProgress(sentenceId);
  const { touchActivity, ...rest } = patch;
  const next: Record<string, unknown> = {
    user_id: userId,
    sentence_id: sentenceId,
    pre_done: existing?.pre_done ?? false,
    analysis_done: existing?.analysis_done ?? false,
    translation_done: existing?.translation_done ?? false,
    word_test_done: existing?.word_test_done ?? false,
    status: existing?.status ?? "pending",
    passed_at: existing?.passed_at ?? null,
    analysis_match_rate: existing?.analysis_match_rate ?? null,
    mem_listen_done: existing?.mem_listen_done ?? false,
    mem_scramble_done: existing?.mem_scramble_done ?? false,
    mem_cloze_done: existing?.mem_cloze_done ?? false,
    mem_dictation_done: existing?.mem_dictation_done ?? false,
    mem_speech_done: existing?.mem_speech_done ?? false,
    mem_record_done: existing?.mem_record_done ?? false,
    mem_ko_to_en_done: existing?.mem_ko_to_en_done ?? false,
    mem_en_to_ko_done: existing?.mem_en_to_ko_done ?? false,
    mem_direction: existing?.mem_direction ?? null,
    mem_passed_at: existing?.mem_passed_at ?? null,
    mem_attempt_count: existing?.mem_attempt_count ?? 0,
    ...rest,
  };
  // 명시적으로 touchActivity=true이거나, 진행 패치(어떤 단계 done/status)일 때 last_activity_at 갱신
  const isProgressPatch =
    touchActivity ||
    "pre_done" in rest ||
    "analysis_done" in rest ||
    "translation_done" in rest ||
    "word_test_done" in rest ||
    "analysis_match_rate" in rest ||
    "status" in rest ||
    "mem_listen_done" in rest ||
    "mem_scramble_done" in rest ||
    "mem_cloze_done" in rest ||
    "mem_dictation_done" in rest ||
    "mem_speech_done" in rest ||
    "mem_record_done" in rest ||
    "mem_ko_to_en_done" in rest ||
    "mem_en_to_ko_done" in rest ||
    "mem_passed_at" in rest ||
    "mem_attempt_count" in rest;
  if (isProgressPatch) {
    next.last_activity_at = new Date().toISOString();
  }
  const { error } = await supabase.from("sentence_progress").upsert(next as never, { onConflict: "user_id,sentence_id" });
  if (error) throw error;
};

// ---------- sentence_attempt_logs ----------
export type AttemptSource = "regular" | "review" | "assignment" | "test";

export interface AttemptLogInput {
  sentence_id: string;
  attempt_no: number;
  analysis_match_rate: number;
  analysis_passed: boolean;
  word_test_score: number;
  word_test_passed: boolean;
  owner_diff: unknown;
  translation_text?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  attempt_source?: AttemptSource;
}

export interface AttemptLogRow {
  id: string;
  user_id: string;
  sentence_id: string;
  attempt_no: number;
  analysis_match_rate: number;
  analysis_passed: boolean;
  word_test_score: number;
  word_test_passed: boolean;
  owner_diff: unknown;
  translation_text: string | null;
  started_at: string | null;
  completed_at: string;
  created_at: string;
}

export const insertAttemptLog = async (input: AttemptLogInput): Promise<void> => {
  const userId = await requireUserId();
  const payload = {
    user_id: userId,
    sentence_id: input.sentence_id,
    attempt_no: input.attempt_no,
    analysis_match_rate: input.analysis_match_rate,
    analysis_passed: input.analysis_passed,
    word_test_score: input.word_test_score,
    word_test_passed: input.word_test_passed,
    owner_diff: (input.owner_diff ?? []) as never,
    translation_text: input.translation_text ?? null,
    started_at: input.started_at ?? null,
    completed_at: input.completed_at ?? new Date().toISOString(),
    attempt_source: input.attempt_source ?? "regular",
  };
  const { error } = await supabase.from("sentence_attempt_logs").insert(payload);
  if (error) throw error;
};

export const fetchAttemptLogs = async (sentenceId: string, userId?: string): Promise<AttemptLogRow[]> => {
  const uid = userId ?? (await getUserId());
  if (!uid) return [];
  const { data } = await supabase
    .from("sentence_attempt_logs")
    .select("*")
    .eq("sentence_id", sentenceId)
    .eq("user_id", uid)
    .order("completed_at", { ascending: false });
  return (data as AttemptLogRow[]) ?? [];
};

export const fetchAttemptCount = async (sentenceId: string): Promise<number> => {
  const userId = await getUserId();
  if (!userId) return 0;
  const { count } = await supabase
    .from("sentence_attempt_logs")
    .select("id", { count: "exact", head: true })
    .eq("sentence_id", sentenceId)
    .eq("user_id", userId);
  return count ?? 0;
};

// ---------- owner_progress ----------
export interface OwnerProgressRow {
  sentence_id: string;
  owner_id: string;
  progress: unknown;
  custom_answer: unknown;
  completed: boolean;
}

export const fetchOwnerProgressForSentence = async (
  sentenceId: string,
  userIdOverride?: string,
): Promise<OwnerProgressRow[]> => {
  const userId = userIdOverride ?? (await getUserId());
  let q = supabase.from("owner_progress").select("*").eq("sentence_id", sentenceId);
  q = userId ? q.eq("user_id", userId) : q.is("user_id", null);
  const { data } = await q;
  return (data as OwnerProgressRow[]) ?? [];
};

export const upsertOwnerProgress = async (row: OwnerProgressRow): Promise<void> => {
  const userId = await requireUserId();
  const payload = { user_id: userId, ...row } as never;
  const { error } = await supabase.from("owner_progress").upsert(payload, { onConflict: "user_id,sentence_id,owner_id" });
  if (error) throw error;
};

export const deleteOwnerProgress = async (sentenceId: string, ownerId: string): Promise<void> => {
  const userId = await getUserId();
  let q = supabase.from("owner_progress").delete().eq("sentence_id", sentenceId).eq("owner_id", ownerId);
  q = userId ? q.eq("user_id", userId) : q.is("user_id", null);
  const { error } = await q;
  if (error) throw error;
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
  const { error } = await supabase.from("sentence_translations").upsert(
    { user_id: userId, sentence_id: sentenceId, text, submitted_at: new Date().toISOString() },
    { onConflict: "user_id,sentence_id" },
  );
  if (error) throw error;
};

// ---------- word_test_results ----------
export interface WordTestItem {
  word: string;
  expected: string;
  given: string;
  correct: boolean;
}

export interface WrongWord {
  word: string;
  expected: string;
  given: string;
}

export const insertWordTestResult = async (
  sentenceId: string,
  items: WordTestItem[],
  score: number,
  passed: boolean,
  extras?: {
    mode?: "spell" | "meaning" | "mixed";
    attempt_no?: number;
    wrong_words?: WrongWord[];
    remediation_done?: boolean;
  },
): Promise<void> => {
  const userId = await getUserId();
  const payload = {
    user_id: userId,
    sentence_id: sentenceId,
    items: items as unknown as object,
    score,
    passed,
    mode: extras?.mode ?? "mixed",
    attempt_no: extras?.attempt_no ?? 1,
    wrong_words: (extras?.wrong_words ?? []) as unknown as object,
    remediation_done: extras?.remediation_done ?? false,
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

export const fetchWordTestAttemptCount = async (sentenceId: string): Promise<number> => {
  const userId = await getUserId();
  let q = supabase
    .from("word_test_results")
    .select("id", { count: "exact", head: true })
    .eq("sentence_id", sentenceId);
  q = userId ? q.eq("user_id", userId) : q.is("user_id", null);
  const { count } = await q;
  return count ?? 0;
};

/** Returns the set of word-test modes that have at least one PASS for this sentence/user. */
export const fetchPassedWordTestModes = async (sentenceId: string): Promise<string[]> => {
  const userId = await getUserId();
  let q = supabase
    .from("word_test_results")
    .select("mode,passed")
    .eq("sentence_id", sentenceId)
    .eq("passed", true);
  q = userId ? q.eq("user_id", userId) : q.is("user_id", null);
  const { data } = await q;
  return Array.from(new Set((data ?? []).map((r) => r.mode as string)));
};

export const markLatestRemediationDone = async (sentenceId: string): Promise<void> => {
  const userId = await getUserId();
  let q = supabase.from("word_test_results").select("id").eq("sentence_id", sentenceId);
  q = userId ? q.eq("user_id", userId) : q.is("user_id", null);
  const { data } = await q.order("taken_at", { ascending: false }).limit(1).maybeSingle();
  if (data?.id) {
    await supabase.from("word_test_results").update({ remediation_done: true }).eq("id", data.id);
  }
};

// ---------- badge_offsets ----------
export const fetchBadgeOffsets = async (
  sentenceId: string,
  userIdOverride?: string,
): Promise<Record<string, number>> => {
  const userId = userIdOverride ?? (await getUserId());
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

export const fetchModifierRelations = async (
  sentenceId: string,
  userIdOverride?: string,
): Promise<RelationRow[]> => {
  const userId = userIdOverride ?? (await getUserId());
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
export const fetchReferentRelations = async (
  sentenceId: string,
  userIdOverride?: string,
): Promise<RelationRow[]> => {
  const userId = userIdOverride ?? (await getUserId());
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

export const fetchIdiomsAll = async (userIdOverride?: string): Promise<IdiomRow[]> => {
  const userId = userIdOverride ?? (await getUserId());
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

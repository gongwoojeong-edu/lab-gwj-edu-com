import { supabase } from "@/integrations/supabase/client";
import { getCurrentUserId } from "@/lib/authState";

export interface StudentPassageOverride {
  user_id: string;
  sentence_id: string;
  skip_pre: boolean;
  /** 문장 전체 건너뛰기 (선생님 지정) */
  skip_sentence: boolean;
}

const SELECT = "user_id, sentence_id, skip_pre, skip_sentence";

/** 학생의 모든 sentence override 조회 */
export const fetchOverridesForStudent = async (
  userId: string,
): Promise<StudentPassageOverride[]> => {
  const { data, error } = await supabase
    .from("student_passage_overrides")
    .select(SELECT)
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? []) as StudentPassageOverride[];
};

/** 본인(학생) + 특정 sentence 의 override 조회 */
export const fetchMyOverrideForSentence = async (
  sentenceId: string,
): Promise<StudentPassageOverride | null> => {
  const userId = await getCurrentUserId();
  if (!userId) return null;
  const { data } = await supabase
    .from("student_passage_overrides")
    .select(SELECT)
    .eq("user_id", userId)
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
  const currentUserId = await getCurrentUserId();
  const { error } = await supabase
    .from("student_passage_overrides")
    .upsert(
      {
        user_id: userId,
        sentence_id: sentenceId,
        skip_pre: skipPre,
        created_by: currentUserId,
      },
      { onConflict: "user_id,sentence_id" },
    );
  if (error) throw error;
};

/** 학생×sentence 문장 전체 건너뛰기 토글 (upsert) */
export const upsertSkipSentence = async (
  userId: string,
  sentenceId: string,
  skip: boolean,
): Promise<void> => {
  const currentUserId = await getCurrentUserId();
  const { error } = await supabase
    .from("student_passage_overrides")
    .upsert(
      {
        user_id: userId,
        sentence_id: sentenceId,
        skip_sentence: skip,
        created_by: currentUserId,
      },
      { onConflict: "user_id,sentence_id" },
    );
  if (error) throw error;
};

/** 여러 학생 × 여러 지문 스킵 일괄 지정/해제 */
export const bulkSetSkipSentence = async (
  userIds: string[],
  sentenceIds: string[],
  skip: boolean,
): Promise<number> => {
  if (userIds.length === 0 || sentenceIds.length === 0) return 0;
  const currentUserId = await getCurrentUserId();
  const rows = userIds.flatMap((uid) =>
    sentenceIds.map((sid) => ({
      user_id: uid,
      sentence_id: sid,
      skip_sentence: skip,
      created_by: currentUserId,
    })),
  );
  // 배치로 나눠 upsert (URL/페이로드 크기 안전)
  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase
      .from("student_passage_overrides")
      .upsert(rows.slice(i, i + CHUNK), { onConflict: "user_id,sentence_id" });
    if (error) throw error;
  }
  return rows.length;
};

/** 특정 학생의 스킵 지정된 지문 코드 집합 */
export const fetchSkippedSentenceIds = async (
  userId: string,
): Promise<Set<string>> => {
  const { data, error } = await supabase
    .from("student_passage_overrides")
    .select("sentence_id, skip_sentence")
    .eq("user_id", userId)
    .eq("skip_sentence", true);
  if (error) return new Set();
  return new Set(((data ?? []) as { sentence_id: string }[]).map((r) => r.sentence_id));
};

/** 여러 학생의 스킵 지정 현황 (userId → sentenceId 집합) */
export const fetchSkipMapForStudents = async (
  userIds: string[],
  sentenceIds?: string[],
): Promise<Record<string, Set<string>>> => {
  const map: Record<string, Set<string>> = {};
  if (userIds.length === 0) return map;
  let q = supabase
    .from("student_passage_overrides")
    .select("user_id, sentence_id, skip_sentence")
    .in("user_id", userIds)
    .eq("skip_sentence", true);
  if (sentenceIds && sentenceIds.length > 0) q = q.in("sentence_id", sentenceIds);
  const { data } = await q;
  for (const r of (data ?? []) as { user_id: string; sentence_id: string }[]) {
    (map[r.user_id] ??= new Set()).add(r.sentence_id);
  }
  return map;
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

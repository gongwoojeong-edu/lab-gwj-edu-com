// ============================================================
// unknownWords.ts — 학생별 "모르는 단어" 누적
// 한글해석 단계에서 학생이 모르는 단어를 골라 저장해 두면
// 워크북 맨 뒤 "사전활동" 부록(뜻·품사 쓰기)으로 출력된다.
// ============================================================
import { supabase } from "@/integrations/supabase/client";

export interface UnknownWordItem {
  id: string;
  user_id: string;
  word: string;
  sentence_id: string | null;
  created_at: string;
}

// student_unknown_words 는 자동 생성 타입(types.ts)에 아직 없을 수 있어
// 이 파일 내부에서만 타입 단언을 사용한다.
/* eslint-disable @typescript-eslint/no-explicit-any */
const table = () => (supabase as any).from("student_unknown_words");

/** 비교용 정규화: trim + 소문자 */
export const normalizeWord = (word: string): string => word.trim().toLowerCase();

/** 대소문자 무시 중복 제거 — 첫 번째 원래 표기와 입력 순서를 보존 */
export const dedupeWords = (words: string[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of words) {
    const word = raw.trim();
    const key = normalizeWord(word);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(word);
  }
  return out;
};

/** 문장을 단어 토큰으로 분리 — 가장자리 구두점 제거, 내부 구두점(don't, well-known) 보존 */
export const tokenizeWords = (sentence: string): string[] =>
  sentence
    .split(/\s+/)
    .map((token) => token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter(Boolean);

export const listUnknownWords = async (userId: string): Promise<UnknownWordItem[]> => {
  const { data, error } = await table()
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw error;
  return (data ?? []) as UnknownWordItem[];
};

/** 단어 추가 — 이미 있는 단어(대소문자 무시)는 조용히 무시 */
export const addUnknownWord = async (
  userId: string,
  word: string,
  sentenceId?: string | null,
): Promise<void> => {
  const trimmed = word.trim();
  if (!trimmed) return;
  const { error } = await table().insert({
    user_id: userId,
    word: trimmed,
    sentence_id: sentenceId ?? null,
  });
  // 23505 = unique violation (이미 저장된 단어)
  if (error && error.code !== "23505") throw error;
};

export const removeUnknownWord = async (id: string): Promise<void> => {
  const { error } = await table().delete().eq("id", id);
  if (error) throw error;
};

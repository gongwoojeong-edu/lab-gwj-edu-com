// ============================================================
// wordExtraction.ts — fetch / trigger AI word extractions
// 1순위 데이터 소스: sentence_word_extractions 캐시
// ============================================================
import { supabase } from "@/integrations/supabase/client";
import type { WordTestEntry } from "@/lib/wordTestBuilder";

export interface ExtractedWord {
  word: string;
  meaning: string;
  pos: string;
}

export interface ExtractionRow {
  sentence_id: string;
  english: string;
  words: ExtractedWord[];
  model: string | null;
  updated_at: string;
}

export const fetchExtraction = async (sentenceId: string): Promise<ExtractionRow | null> => {
  const { data, error } = await supabase
    .from("sentence_word_extractions")
    .select("*")
    .eq("sentence_id", sentenceId)
    .maybeSingle();
  if (error) {
    console.warn("fetchExtraction error", error);
    return null;
  }
  if (!data) return null;
  return {
    sentence_id: data.sentence_id,
    english: data.english,
    words: Array.isArray(data.words) ? (data.words as ExtractedWord[]) : [],
    model: data.model,
    updated_at: data.updated_at,
  };
};

export const extractedToEntries = (words: ExtractedWord[]): WordTestEntry[] =>
  words
    .filter((w) => w.word.trim() && w.meaning.trim())
    .map((w, i) => ({
      ownerId: `extract:${i}`,
      word: w.word.trim(),
      expected: w.meaning.trim(),
    }));

/** Teacher/admin only — invokes the edge function and refreshes the cache. */
export const runExtraction = async (
  sentenceId: string,
  english: string,
): Promise<{ count: number; words: ExtractedWord[] } | { error: string; status?: number }> => {
  const { data, error } = await supabase.functions.invoke("extract-sentence-words", {
    body: { sentenceId, english },
  });
  if (error) {
    // supabase-js wraps non-2xx into FunctionsHttpError
    const status = (error as { context?: { status?: number } }).context?.status;
    return { error: error.message ?? "extraction failed", status };
  }
  return data as { count: number; words: ExtractedWord[] };
};

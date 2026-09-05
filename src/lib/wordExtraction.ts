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
  /** 사전 원형(lemma) — 예: taken → take (선택) */
  base?: string;
  /** 문법 형태 표기 — 예: 과거분사, 현재분사, 복수형, 비교급 (선택) */
  form?: string;
}

export interface ExtractionRow {
  sentence_id: string;
  english: string;
  words: ExtractedWord[];
  model: string | null;
  updated_at: string;
}

/**
 * AI 추출 오류 방어 —
 * 모델이 같은 꼬리말을 여러 단어 끝에 반복해서 붙이는 오류(예: "elements Closely",
 * "incorporate Closely" …)나 프롬프트 찌꺼기("head_word:", "Base:" 등)를 제거한다.
 * 정상적인 숙어(take care of)나 원형 표기는 건드리지 않는다.
 */
const normText = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();

const stripJunk = (raw: string) =>
  raw
    .replace(/\s*(head_word|base|form|pos)\s*[:：].*$/i, "")
    .replace(/\s*Extracting core vocabulary.*$/i, "")
    .replace(/[^\x00-\x7F]+$/g, "")
    .trim();

export const sanitizeExtractedWords = (
  words: ExtractedWord[],
  english: string,
): ExtractedWord[] => {
  const eng = normText(english || "");
  const has = (w: string) => !!w && eng.includes(normText(w));

  // 1) 본문에 없는 항목들의 "마지막 토큰"이 2번 이상 반복되면 반복 꼬리말로 판단
  const tailCount = new Map<string, number>();
  for (const w of words) {
    const raw = stripJunk(w.word ?? "");
    if (!raw || !eng || has(raw)) continue;
    const toks = raw.split(/\s+/);
    if (toks.length < 2) continue;
    const tail = toks[toks.length - 1].toLowerCase();
    tailCount.set(tail, (tailCount.get(tail) ?? 0) + 1);
  }

  const out: ExtractedWord[] = [];
  for (const w of words) {
    let word = stripJunk(w.word ?? "");
    if (!word) continue;
    if (eng && !has(word)) {
      const toks = word.split(/\s+/);
      const tail = toks[toks.length - 1]?.toLowerCase() ?? "";
      if (toks.length >= 2 && (tailCount.get(tail) ?? 0) >= 2) {
        const trimmed = toks.slice(0, -1).join(" ");
        if (has(trimmed)) word = trimmed;
      }
    }
    if (out.some((o) => o.word.toLowerCase() === word.toLowerCase())) continue;
    out.push({ ...w, word });
  }
  return out;
};


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
  const rawWords = Array.isArray(data.words) ? (data.words as unknown as ExtractedWord[]) : [];
  return {
    sentence_id: data.sentence_id,
    english: data.english,
    words: sanitizeExtractedWords(rawWords, data.english ?? ""),
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
      pos: w.pos?.trim() || undefined,
      form: w.form?.trim() || undefined,
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

/** Teacher/admin only — overwrite the words array for a sentence. */
export const saveExtractionWords = async (
  sentenceId: string,
  english: string,
  words: ExtractedWord[],
): Promise<void> => {
  const cleaned = words
    .map((w) => ({
      word: w.word.trim(),
      meaning: w.meaning.trim(),
      pos: (w.pos ?? "").trim(),
      ...(w.base?.trim() ? { base: w.base.trim() } : {}),
      ...(w.form?.trim() ? { form: w.form.trim() } : {}),
    }))
    .filter((w) => w.word && w.meaning);
  const { error } = await supabase
    .from("sentence_word_extractions")
    .upsert(
      {
        sentence_id: sentenceId,
        english,
        words: cleaned as unknown as never,
        model: "manual-edit",
      },
      { onConflict: "sentence_id" },
    );
  if (error) throw error;
};

/** Admin only (per RLS) — remove the entire extraction cache for a sentence. */
export const deleteExtraction = async (sentenceId: string): Promise<void> => {
  const { error } = await supabase
    .from("sentence_word_extractions")
    .delete()
    .eq("sentence_id", sentenceId);
  if (error) throw error;
};


/** Teacher/admin only — 수동 검수 완료 표기 토글 */
export const setExtractionReviewed = async (
  sentenceId: string,
  reviewed: boolean,
): Promise<void> => {
  const uid = (await supabase.auth.getUser()).data.user?.id ?? null;
  const { error } = await supabase
    .from("sentence_word_extractions")
    .update({
      reviewed_at: reviewed ? new Date().toISOString() : null,
      reviewed_by: reviewed ? uid : null,
    } as never)
    .eq("sentence_id", sentenceId);
  if (error) throw error;
};

// ============================================================
// fetchMemPassage — 암기 학습용 지문 mem_* 필드 조회
// ============================================================
import { supabase } from "@/integrations/supabase/client";
import type { SentenceToken } from "@/data/sentences";
import { buildTokensFromEnglish } from "@/lib/sentenceSource";
import { buildClozeSpec } from "@/lib/memorizationPassage";

export interface MemPassageData {
  code: string;
  english: string;
  korean: string;
  mem_tokens: SentenceToken[];
  mem_korean_chunks: string[];
  mem_cloze_spec: { blankIds: string[] };
  mem_status: "draft" | "ready";
}

export async function fetchMemPassageByCode(code: string): Promise<MemPassageData | null> {
  const { data, error } = await supabase
    .from("textbook_passages")
    .select("code, english, korean, mem_tokens, mem_korean_chunks, mem_cloze_spec, mem_status")
    .eq("code", code)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const rec = data as Record<string, unknown>;
  const english = String(rec.english ?? "").trim();
  const korean = String(rec.korean ?? "").trim();
  let mem_tokens = (rec.mem_tokens ?? null) as SentenceToken[] | null;
  if (!mem_tokens?.length) {
    mem_tokens = buildTokensFromEnglish(english);
  }
  const mem_korean_chunks = (rec.mem_korean_chunks ?? []) as string[];
  let mem_cloze_spec = (rec.mem_cloze_spec ?? null) as { blankIds: string[] } | null;
  if (!mem_cloze_spec?.blankIds?.length) {
    mem_cloze_spec = buildClozeSpec(mem_tokens);
  }

  return {
    code: rec.code as string,
    english,
    korean,
    mem_tokens,
    mem_korean_chunks,
    mem_cloze_spec,
    mem_status: ((rec.mem_status as string) ?? "draft") as "draft" | "ready",
  };
}

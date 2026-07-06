// ============================================================
// memorizationPassage — 암기용 자동구성 · mem_status · task_mode 저장
// ============================================================
import { supabase } from "@/integrations/supabase/client";
import { buildTokensFromEnglish, stripKoreanFromEnglishSource } from "@/lib/sentenceSource";
import type { SentenceToken } from "@/data/sentences";
import { mapPassageRowFromRecord, type Passage } from "@/lib/textbooks";
import type { TaskMode } from "@/lib/taskMode";

/** 한글 어구 split (빈칸·어순용) */
export function splitKoreanChunks(korean: string): string[] {
  if (!korean.trim()) return [];
  return korean
    .split(/(?:[,，/]|(?:\s*;\s*)|(?:\.\s+(?=[가-힣])))/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** content word 상위 빈칸 후보 (구문 정답 없을 때) */
export function buildClozeSpec(tokens: SentenceToken[]): { blankIds: string[] } {
  const words = tokens.filter(
    (t): t is Extract<SentenceToken, { type: "analyzable" }> =>
      t.type === "analyzable" && t.text.length > 2,
  );
  const n = Math.max(1, Math.ceil(words.length * 0.3));
  return { blankIds: words.slice(0, n).map((w) => w.id) };
}

/** 영문만으로 암기 mem_* 필드 자동 구성 (한글은 기존 값 유지) */
export async function composePassageMemorization(passageId: string): Promise<Passage> {
  const { data: row, error: fetchErr } = await supabase
    .from("textbook_passages")
    .select("*")
    .eq("id", passageId)
    .single();
  if (fetchErr) throw fetchErr;

  const rec = row as Record<string, unknown>;
  const english = stripKoreanFromEnglishSource(rec.english as string);
  const mem_tokens = buildTokensFromEnglish(english);
  const korean = ((rec.korean as string | null) ?? "").trim();
  const mem_korean_chunks = korean ? splitKoreanChunks(korean) : [];
  const mem_cloze_spec = buildClozeSpec(mem_tokens);

  const patch = {
    mem_tokens,
    mem_korean_chunks,
    mem_cloze_spec,
    mem_composed_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("textbook_passages")
    .update(patch as never)
    .eq("id", passageId)
    .select("*")
    .single();
  if (error) throw error;
  return mapPassageRowFromRecord(data as Record<string, unknown>);
}

export async function setPassageMemReady(code: string, ready: boolean): Promise<void> {
  const { error } = await supabase
    .from("textbook_passages")
    .update({ mem_status: ready ? "ready" : "draft" })
    .eq("code", code);
  if (error) throw error;
}

export async function updatePassageTaskMode(
  passageId: string,
  taskMode: TaskMode | null,
): Promise<void> {
  const { error } = await supabase
    .from("textbook_passages")
    .update({ task_mode: taskMode })
    .eq("id", passageId);
  if (error) throw error;
}

export async function updateUnitDefaultTaskMode(
  unitId: string,
  taskMode: TaskMode,
): Promise<void> {
  const { error } = await supabase
    .from("textbook_units")
    .update({ default_task_mode: taskMode })
    .eq("id", unitId);
  if (error) throw error;
}

export async function updateUnitMemSettings(
  unitId: string,
  opts: {
    defaultMemDirection?: "ko_to_en" | "en_to_ko" | "both";
    memRequireRecord?: boolean;
  },
): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (opts.defaultMemDirection != null) patch.default_mem_direction = opts.defaultMemDirection;
  if (opts.memRequireRecord != null) patch.mem_require_record = opts.memRequireRecord;
  if (Object.keys(patch).length === 0) return;
  const { error } = await supabase.from("textbook_units").update(patch as never).eq("id", unitId);
  if (error) throw error;
}

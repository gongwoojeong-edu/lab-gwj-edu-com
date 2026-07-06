// ============================================================
// passageAudio — TTS 오디오 조회·생성 (generate-passage-audio EF)
// ============================================================
import { supabase } from "@/integrations/supabase/client";
import { speakChunk } from "@/lib/syllables";

const BUCKET = "passage-audio";

export interface PassageAudioRow {
  id: string;
  sentence_id: string;
  storage_path: string;
  voice_label: string | null;
  duration_ms: number | null;
  source: "upload" | "tts";
  created_at: string;
}

export async function fetchPassageAudioRow(
  sentenceId: string,
): Promise<PassageAudioRow | null> {
  const { data, error } = await supabase
    .from("passage_audio")
    .select("*")
    .eq("sentence_id", sentenceId)
    .maybeSingle();
  if (error) throw error;
  return (data as PassageAudioRow) ?? null;
}

export async function getPassageAudioSignedUrl(
  storagePath: string,
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, 3600);
  if (error) return null;
  return data?.signedUrl ?? null;
}

export async function resolvePassageAudioUrl(
  sentenceId: string,
): Promise<{ url: string | null; source: "tts" | "upload" | null }> {
  const row = await fetchPassageAudioRow(sentenceId);
  if (!row) return { url: null, source: null };
  const url = await getPassageAudioSignedUrl(row.storage_path);
  return { url, source: row.source };
}

/** TTS URL → 실패 시 브라우저 TTS fallback */
export async function playPassageAudioEnglish(
  sentenceId: string,
  english: string,
  onEnd?: () => void,
): Promise<void> {
  const finish = () => onEnd?.();
  try {
    const { url } = await resolvePassageAudioUrl(sentenceId);
    if (url) {
      const audio = new Audio(url);
      audio.onended = finish;
      audio.onerror = () => speakChunk(english, { rate: 0.82, lang: "en-US" }, finish);
      try {
        await audio.play();
        return;
      } catch {
        /* fallback below */
      }
    }
  } catch {
    /* fallback below */
  }
  speakChunk(english, { rate: 0.82, lang: "en-US" }, finish);
}

export type GeneratePassageAudioResult = {
  ok: boolean;
  cached?: boolean;
  sentenceId?: string;
  error?: string;
};

export async function generatePassageAudio(
  sentenceId: string,
  english?: string,
  force = false,
): Promise<GeneratePassageAudioResult> {
  const { data, error } = await supabase.functions.invoke("generate-passage-audio", {
    body: { sentenceId, english, force },
  });
  if (error) {
    const ctx = (error as { context?: { json?: () => Promise<unknown> } }).context;
    try {
      const body = await ctx?.json?.();
      const message = (body as { error?: string } | null)?.error;
      if (message) return { ok: false, error: message };
    } catch {
      /* fall through */
    }
    return { ok: false, error: error.message };
  }
  const result = (data ?? {}) as GeneratePassageAudioResult & { error?: string };
  if (result.error) return { ok: false, error: result.error };
  return { ok: true, cached: result.cached, sentenceId: result.sentenceId };
}

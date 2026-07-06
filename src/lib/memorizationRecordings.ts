// ============================================================
// memorizationRecordings — E단계 녹음 업로드·조회
// ============================================================
import { supabase } from "@/integrations/supabase/client";
import { getCurrentUserId } from "@/lib/authState";
import type { MemDirection } from "@/lib/memorizationText";

const BUCKET = "mem-recordings";

export interface MemRecordingRow {
  id: string;
  user_id: string;
  sentence_id: string;
  storage_path: string;
  mime: string | null;
  duration_ms: number | null;
  mem_direction: string | null;
  created_at: string;
}

export async function uploadMemRecording(
  sentenceId: string,
  blob: Blob,
  direction: MemDirection,
  durationMs?: number,
): Promise<MemRecordingRow> {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("로그인이 필요합니다.");

  const ext = blob.type.includes("mp4") ? "mp4" : "webm";
  const path = `${userId}/${sentenceId}/${Date.now()}.${ext}`;

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: blob.type || "audio/webm",
    upsert: false,
  });
  if (upErr) throw upErr;

  const { data, error } = await supabase
    .from("memorization_recordings")
    .insert({
      user_id: userId,
      sentence_id: sentenceId,
      storage_path: path,
      mime: blob.type || null,
      duration_ms: durationMs ?? null,
      mem_direction: direction,
    } as Record<string, unknown>)
    .select("*")
    .single();
  if (error) throw error;
  return data as MemRecordingRow;
}

export async function getMemRecordingSignedUrl(storagePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, 3600);
  if (error) return null;
  return data?.signedUrl ?? null;
}

export async function fetchLatestRecording(
  userId: string,
  sentenceId: string,
): Promise<MemRecordingRow | null> {
  const { data, error } = await supabase
    .from("memorization_recordings")
    .select("*")
    .eq("user_id", userId)
    .eq("sentence_id", sentenceId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as MemRecordingRow) ?? null;
}

// ============================================================
// azureSpeechAssess — Azure 발음 평가 EF 클라이언트
// ============================================================
import { supabase } from "@/integrations/supabase/client";

export interface AzurePronunciationResult {
  ok: boolean;
  available: boolean;
  passed?: boolean;
  pronScore?: number;
  accuracy?: number;
  fluency?: number;
  completeness?: number;
  transcript?: string;
  passThreshold?: number;
  error?: string;
}

let availabilityCache: boolean | null = null;

export async function checkAzureSpeechAvailable(): Promise<boolean> {
  if (availabilityCache != null) return availabilityCache;
  try {
    const { data, error } = await supabase.functions.invoke("azure-speech-pronunciation", {
      body: { probe: true },
    });
    if (error) {
      availabilityCache = false;
      return false;
    }
    availabilityCache = !!(data as { available?: boolean })?.available;
    return availabilityCache;
  } catch {
    availabilityCache = false;
    return false;
  }
}

export async function assessPronunciationWithAzure(
  blob: Blob,
  referenceText: string,
  language: "en-US" | "ko-KR",
): Promise<AzurePronunciationResult> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const audioBase64 = btoa(binary);

  const { data, error } = await supabase.functions.invoke("azure-speech-pronunciation", {
    body: {
      referenceText,
      language,
      audioBase64,
      mime: blob.type || "audio/webm",
    },
  });

  if (error) {
    return { ok: false, available: false, error: error.message };
  }

  const result = (data ?? {}) as AzurePronunciationResult;
  if (result.error) {
    return { ok: false, available: result.available ?? true, error: result.error };
  }
  return { ...result, ok: true, available: true };
}

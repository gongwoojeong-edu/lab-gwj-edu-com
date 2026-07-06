// Edge Function: azure-speech-pronunciation
// Azure Speech pronunciation assessment (ko_to_en 영어 발음 우선)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const b64 = (s: string) => btoa(s);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON =
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
    const AZURE_SPEECH_KEY = Deno.env.get("AZURE_SPEECH_KEY");
    const AZURE_SPEECH_REGION = Deno.env.get("AZURE_SPEECH_REGION") ?? "koreacentral";
    if (!AZURE_SPEECH_KEY) return json({ error: "AZURE_SPEECH_KEY missing", available: false }, 503);

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    if (body?.probe) return json({ ok: true, available: true });

    const referenceText = String(body?.referenceText ?? "").trim();
    const language = String(body?.language ?? "en-US");
    const audioBase64 = String(body?.audioBase64 ?? "").trim();
    const mime = String(body?.mime ?? "audio/webm");

    if (!referenceText || !audioBase64) {
      return json({ error: "referenceText and audioBase64 required" }, 400);
    }

    const audioBytes = Uint8Array.from(atob(audioBase64), (c) => c.charCodeAt(0));
    if (audioBytes.length < 100) return json({ error: "Audio too short" }, 400);

    const pronConfig = {
      ReferenceText: referenceText,
      GradingSystem: "HundredMark",
      Granularity: "FullText",
      Dimension: "Comprehensive",
      EnableMiscue: true,
    };

    const langParam = language.startsWith("ko") ? "ko-KR" : "en-US";
    const url =
      `https://${AZURE_SPEECH_REGION}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1` +
      `?language=${encodeURIComponent(langParam)}&format=detailed`;

    const contentType = mime.includes("wav")
      ? "audio/wav"
      : mime.includes("mp4")
        ? "audio/mp4"
        : "audio/webm; codecs=opus";

    const azureResp = await fetch(url, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": AZURE_SPEECH_KEY,
        "Content-Type": contentType,
        Accept: "application/json;text/xml",
        "Pronunciation-Assessment": b64(JSON.stringify(pronConfig)),
      },
      body: audioBytes,
    });

    const rawText = await azureResp.text();
    if (!azureResp.ok) {
      console.error("Azure speech error", azureResp.status, rawText.slice(0, 300));
      return json({ error: `Azure ${azureResp.status}`, available: true }, 502);
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      return json({ error: "Invalid Azure response", available: true }, 502);
    }

    const nbest = (parsed.NBest as Array<Record<string, unknown>> | undefined)?.[0];
    const pron = (nbest?.PronunciationAssessment ?? parsed.PronunciationAssessment) as
      | Record<string, number>
      | undefined;
    const accuracy = pron?.AccuracyScore ?? pron?.PronScore ?? 0;
    const fluency = pron?.FluencyScore ?? 0;
    const completeness = pron?.CompletenessScore ?? 0;
    const pronScore = pron?.PronScore ?? Math.round((accuracy + fluency + completeness) / 3);
    const transcript = String(nbest?.Display ?? parsed.DisplayText ?? "");

    const passThreshold = langParam === "en-US" ? 80 : 75;
    const passed = pronScore >= passThreshold;

    return json({
      ok: true,
      available: true,
      passed,
      pronScore,
      accuracy,
      fluency,
      completeness,
      transcript,
      passThreshold,
    });
  } catch (e) {
    console.error("azure-speech-pronunciation error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error", available: true }, 500);
  }
});

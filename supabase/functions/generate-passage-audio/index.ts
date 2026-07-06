// Edge Function: generate-passage-audio
// OpenAI TTS → Storage passage-audio → passage_audio row
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BUCKET = "passage-audio";
const VOICE = "nova";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function synthesizeMp3(text: string, apiKey: string): Promise<Uint8Array> {
  const resp = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "tts-1",
      voice: VOICE,
      input: text.slice(0, 4096),
      response_format: "mp3",
    }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`OpenAI TTS ${resp.status}: ${t.slice(0, 200)}`);
  }
  return new Uint8Array(await resp.arrayBuffer());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON =
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) return json({ error: "OPENAI_API_KEY missing on server" }, 503);

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);
    const uid = userData.user.id;

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE);
    const { data: roleRows, error: roleErr } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", uid);
    if (roleErr) return json({ error: roleErr.message }, 500);
    const roles = (roleRows ?? []).map((r) => r.role);
    if (!roles.includes("teacher") && !roles.includes("admin")) {
      return json({ error: "Forbidden: staff only" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const sentenceId = String(body?.sentenceId ?? "").trim();
    let english = String(body?.english ?? "").trim();
    const force = !!body?.force;

    if (!sentenceId) return json({ error: "sentenceId required" }, 400);

    if (!english) {
      const { data: passage } = await admin
        .from("textbook_passages")
        .select("english")
        .eq("code", sentenceId)
        .maybeSingle();
      english = String((passage as { english?: string } | null)?.english ?? "").trim();
    }
    if (!english) return json({ error: "english text not found" }, 400);

    if (!force) {
      const { data: existing } = await admin
        .from("passage_audio")
        .select("id, storage_path, voice_label, source")
        .eq("sentence_id", sentenceId)
        .maybeSingle();
      if (existing) {
        return json({ ok: true, cached: true, sentenceId, row: existing });
      }
    }

    const mp3 = await synthesizeMp3(english, OPENAI_API_KEY);
    const storagePath = `tts/${sentenceId.replace(/[^a-zA-Z0-9._-]/g, "_")}.mp3`;

    const { error: upErr } = await admin.storage.from(BUCKET).upload(storagePath, mp3, {
      contentType: "audio/mpeg",
      upsert: true,
    });
    if (upErr) return json({ error: upErr.message }, 500);

    const row = {
      sentence_id: sentenceId,
      storage_path: storagePath,
      voice_label: VOICE,
      duration_ms: null,
      source: "tts",
      updated_at: new Date().toISOString(),
    };

    const { data: saved, error: dbErr } = await admin
      .from("passage_audio")
      .upsert(row, { onConflict: "sentence_id" })
      .select("*")
      .single();
    if (dbErr) return json({ error: dbErr.message }, 500);

    return json({ ok: true, cached: false, sentenceId, row: saved });
  } catch (e) {
    console.error("generate-passage-audio error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

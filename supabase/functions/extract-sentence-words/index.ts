// Edge function: extract-sentence-words
// Uses Lovable AI Gateway to extract 5-10 core PRE-learning words from a sentence.
// Only callable by teacher/admin.
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "LOVABLE_API_KEY missing" }, 500);

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    // Validate user via JWT
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);
    const uid = userData.user.id;

    // Service-role client for role check + upsert (bypasses RLS safely after our own check)
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE);
    const { data: roleRows, error: roleErr } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", uid);
    if (roleErr) return json({ error: roleErr.message }, 500);
    const roles = (roleRows ?? []).map((r) => r.role);
    const isStaff = roles.includes("teacher") || roles.includes("admin");
    if (!isStaff) return json({ error: "Forbidden: staff only" }, 403);

    const body = await req.json().catch(() => ({}));
    const sentenceId = String(body?.sentenceId ?? "").trim();
    const english = String(body?.english ?? "").trim();
    if (!sentenceId || !english) return json({ error: "sentenceId and english required" }, 400);

    const model = "google/gemini-3-flash-preview";

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              "You extract core English vocabulary for Korean middle/high school PRE-learning. " +
              "Pick 5-10 KEY content words from the sentence. " +
              "EXCLUDE: articles (a, an, the), pronouns (he, she, it, they...), be-verbs (is, are, was...), " +
              "auxiliaries (do, have when not lexical), basic prepositions/conjunctions. " +
              "Keep the surface form as it appears (or base form if clearly inflected). " +
              "Provide a SHORT Korean meaning (1-3 words, no sentence). " +
              "Use POS tags strictly from {명사, 동사, 형용사, 부사}.",
          },
          { role: "user", content: `Sentence: ${english}` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "submit_words",
              description: "Return the extracted vocabulary list",
              parameters: {
                type: "object",
                properties: {
                  words: {
                    type: "array",
                    minItems: 3,
                    maxItems: 12,
                    items: {
                      type: "object",
                      properties: {
                        word: { type: "string" },
                        meaning: { type: "string" },
                        pos: { type: "string", enum: ["명사", "동사", "형용사", "부사"] },
                      },
                      required: ["word", "meaning", "pos"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["words"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "submit_words" } },
      }),
    });

    if (aiResp.status === 429) return json({ error: "Rate limit, try again later" }, 429);
    if (aiResp.status === 402) return json({ error: "AI credits exhausted" }, 402);
    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error("AI gateway error", aiResp.status, t);
      return json({ error: "AI gateway error" }, 500);
    }

    const aiJson = await aiResp.json();
    const toolCall = aiJson?.choices?.[0]?.message?.tool_calls?.[0];
    const argsStr = toolCall?.function?.arguments;
    if (!argsStr) return json({ error: "No structured output" }, 500);
    let parsed: { words?: Array<{ word: string; meaning: string; pos: string }> };
    try {
      parsed = JSON.parse(argsStr);
    } catch {
      return json({ error: "Invalid JSON from model" }, 500);
    }
    const words = (parsed.words ?? [])
      .filter((w) => w?.word && w?.meaning && w?.pos)
      .map((w) => ({ word: w.word.trim(), meaning: w.meaning.trim(), pos: w.pos }));
    if (words.length === 0) return json({ error: "No words extracted" }, 422);

    const { error: upErr } = await admin
      .from("sentence_word_extractions")
      .upsert({ sentence_id: sentenceId, english, words, model }, { onConflict: "sentence_id" });
    if (upErr) return json({ error: upErr.message }, 500);

    return json({ ok: true, count: words.length, words });
  } catch (e) {
    console.error("extract-sentence-words error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

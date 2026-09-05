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

    // 서버 내부 호출(학습기 전송 자동 추출)은 서비스 롤 시크릿으로 인증한다.
    const internal = req.headers.get("x-internal-secret");
    const isInternal = !!internal && internal === SUPABASE_SERVICE;
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE);

    if (!isInternal) {
      const authHeader = req.headers.get("Authorization") ?? "";
      if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

      // Validate user via JWT
      const userClient = createClient(SUPABASE_URL, SUPABASE_ANON, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData, error: userErr } = await userClient.auth.getUser();
      if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);
      const uid = userData.user.id;

      const { data: roleRows, error: roleErr } = await admin
        .from("user_roles")
        .select("role")
        .eq("user_id", uid);
      if (roleErr) return json({ error: roleErr.message }, 500);
      const roles = (roleRows ?? []).map((r) => r.role);
      const isStaff = roles.includes("teacher") || roles.includes("admin");
      if (!isStaff) return json({ error: "Forbidden: staff only" }, 403);
    }


    const body = await req.json().catch(() => ({}));
    const sentenceId = String(body?.sentenceId ?? "").trim();
    const english = String(body?.english ?? "").trim();
    if (!sentenceId || !english) return json({ error: "sentenceId and english required" }, 400);

    // ===== 대상 학년(레벨) 판정 =====
    // 요청에 level이 없으면 문장 코드 → 교재(textbooks.level)에서 역추적한다.
    let level = String(body?.level ?? "").trim().toUpperCase();
    if (!/^L\d{2}$/.test(level)) {
      level = "";
      const { data: passageRow } = await admin
        .from("textbook_passages")
        .select("textbook_id")
        .eq("code", sentenceId)
        .maybeSingle();
      if (passageRow?.textbook_id) {
        const { data: bookRow } = await admin
          .from("textbooks")
          .select("level")
          .eq("id", passageRow.textbook_id)
          .maybeSingle();
        const lv = String(bookRow?.level ?? "").toUpperCase();
        if (/^L\d{2}$/.test(lv)) level = lv;
      }
    }
    const levelNo = level ? Number(level.slice(1)) : 0;

    // 레벨대별 난이도 기준 — 쉬운 단어를 상위 레벨에서 걸러 낸다.
    const levelGuide = (() => {
      if (levelNo >= 8) {
        return (
          "TARGET LEARNERS: 고등 상위 (수능/모의고사 수준, 레벨 " + level + "). " +
          "중학 기초 어휘(school, water, help, study, happy, important, people 등)와 초·중등 필수 800단어 수준은 절대 포함하지 마라. " +
          "학술적/추상적 어휘, 다의어, 파생어, 관용 표현 위주로 3-8개만 고른다. " +
          "고를 만한 어려운 단어가 3개 미만이면 있는 만큼만 반환하고 억지로 채우지 마라."
        );
      }
      if (levelNo >= 5) {
        return (
          "TARGET LEARNERS: 중3~고1 (레벨 " + level + "). " +
          "초등·중1 수준의 아주 쉬운 단어는 제외하고, 중상급 어휘와 문맥 의미가 달라지는 다의어 위주로 4-8개를 고른다."
        );
      }
      if (levelNo >= 3) {
        return (
          "TARGET LEARNERS: 중1~중2 (레벨 " + level + "). " +
          "교과서 필수 어휘 중심으로 5-9개를 고른다. 초등 저학년 수준 기초어(go, cat, big 등)는 제외한다."
        );
      }
      if (levelNo >= 1) {
        return (
          "TARGET LEARNERS: 초등 고학년~중1 입문 (레벨 " + level + "). " +
          "기초 어휘도 학습 대상이므로 5-10개를 폭넓게 고른다."
        );
      }
      return "TARGET LEARNERS: 중·고등 일반. 5-10개의 핵심 어휘를 고른다.";
    })();

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
              levelGuide + " " +
              "Pick KEY content words from the sentence at the target difficulty. " +
              "EXCLUDE: articles (a, an, the), pronouns (he, she, it, they...), be-verbs (is, are, was...), " +
              "auxiliaries (do, have when not lexical), basic prepositions/conjunctions. " +
              "Keep the surface form as it appears (or base form if clearly inflected). " +
              "POS REQUIRED — strictly from {명사, 동사, 형용사, 부사}. " +
              "BASE + FORM REQUIRED (품사/시제/분사 표기 명확화): " +
              "- 'base': 사전 원형(lemma). 예: taken→take, went→go, mice→mouse, better→good. 이미 원형이면 그대로. " +
              "- 'form': 문법 형태를 한글로 정확히 표기. " +
              "  명사: '단수' | '복수형'. " +
              "  동사: '기본형' | '3인칭 단수' | '과거형' | '과거분사' | '현재분사' | '동명사' | 'to부정사'. " +
              "  형용사/부사: '원급' | '비교급' | '최상급'. " +
              "MEANING RULES (very important for accuracy): " +
              "1) Provide the CONTEXT-FIT meaning FIRST (what the word actually means in THIS sentence). " +
              "2) If the word is polysemous (다의어) and another common meaning differs, append it after a comma. " +
              "3) Format: '문맥뜻, 추가뜻' — keep each meaning to 1-3 Korean words, no full sentences. " +
              "4) Always include POS naturally — example for verb '동력, 추진력 제공하다' is wrong; instead 'meaning' stays Korean meaning only and 'pos' carries the POS tag. " +
              "Examples: " +
              "- 'driving force' (명사) → meaning: '추진력, 원동력', base: 'driving force', form: '단수' " +
              "- 'solidify' (동사) → meaning: '굳히다, 공고히 하다', base: 'solidify', form: '기본형' " +
              "- 'taken' (동사) → meaning: '차지하다', base: 'take', form: '과거분사' " +
              "- 'medium' (명사 in this context) → meaning: '매체, 수단' (NOT '중간의'), base: 'medium', form: '단수'",
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
                    minItems: 0,
                    maxItems: 12,
                    items: {
                      type: "object",
                      properties: {
                        word: { type: "string" },
                        meaning: {
                          type: "string",
                          description:
                            "Context-fit Korean meaning first, optional comma-separated alternate meaning. 1-3 words each.",
                        },
                        pos: { type: "string", enum: ["명사", "동사", "형용사", "부사"] },
                        base: {
                          type: "string",
                          description: "사전 원형(lemma). 예: taken→take, mice→mouse. 이미 원형이면 그대로.",
                        },
                        form: {
                          type: "string",
                          description:
                            "문법 형태 한글 표기 — 명사: 단수/복수형, 동사: 기본형/3인칭 단수/과거형/과거분사/현재분사/동명사/to부정사, 형용사·부사: 원급/비교급/최상급.",
                        },
                      },
                      required: ["word", "meaning", "pos", "base", "form"],
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
    let parsed: { words?: Array<{ word: string; meaning: string; pos: string; base?: string; form?: string }> };
    try {
      parsed = JSON.parse(argsStr);
    } catch {
      return json({ error: "Invalid JSON from model" }, 500);
    }
    // ── 본문 대조 검증 ──────────────────────────────────────────────
    // 모델이 간혹 앞 항목의 단어를 뒤 항목 끝에 이어 붙여 내보내는 오류
    // (예: "elements Closely")가 있어, 본문에 실제로 존재하는 표현만 남긴다.
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();
    const engNorm = norm(english);
    const inEnglish = (w: string) => !!w && engNorm.includes(norm(w));
    const sanitizeWord = (raw: string): string | null => {
      const w = raw.trim();
      if (inEnglish(w)) return w;
      // 뒤에서부터 토큰을 하나씩 떼어내며 본문에 존재하는 형태를 찾는다
      const toks = w.split(/\s+/);
      for (let end = toks.length - 1; end >= 1; end--) {
        const cand = toks.slice(0, end).join(" ");
        if (inEnglish(cand)) return cand;
      }
      return null;
    };

    const words = (parsed.words ?? [])
      .filter((w) => w?.word && w?.meaning && w?.pos)
      .map((w) => {
        const word = sanitizeWord(w.word);
        if (!word) {
          console.warn("dropped out-of-text word", w.word, sentenceId);
          return null;
        }
        return {
          word,
          meaning: w.meaning.trim(),
          pos: w.pos,
          base: (w.base ?? "").trim() || undefined,
          form: (w.form ?? "").trim() || undefined,
        };
      })
      .filter((w): w is NonNullable<typeof w> => w !== null)
      // 동일 단어 중복 제거
      .filter((w, i, arr) => arr.findIndex((o) => o.word.toLowerCase() === w.word.toLowerCase()) === i);
    // 상위 레벨에서 "학습할 만큼 어려운 단어가 없음"은 정상 결과 → 빈 목록으로 저장한다.
    if (words.length === 0 && levelNo < 8) return json({ error: "No words extracted" }, 422);


    const { error: upErr } = await admin
      .from("sentence_word_extractions")
      .upsert(
        { sentence_id: sentenceId, english, words, model, reviewed_at: null, reviewed_by: null },
        { onConflict: "sentence_id" },
      );
    if (upErr) return json({ error: upErr.message }, 500);

    return json({ ok: true, count: words.length, words, level: level || null });
  } catch (e) {
    console.error("extract-sentence-words error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

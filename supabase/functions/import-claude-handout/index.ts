// Edge Function: import-claude-handout
// Receives passage + analysis/structure HTML from external Claude Passage Analyzer
// Authenticates via Bearer token (hashed in import_tokens table)
// Auto-creates Series/Textbook/Unit/Passage and stores HTML as PDFs in analysis-materials bucket
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function safeSlug(s: string): string {
  return (s || "")
    .toString()
    .trim()
    .replace(/[^\w\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

interface Payload {
  textbook?: string;
  lesson?: string | number;
  item_code?: string;
  title_ko?: string;
  expected_title?: string;
  topic_ko?: string;
  topic_en?: string;
  passage: string;
  analysis_html?: string;
  structure_html?: string;
  level?: string; // optional: e.g., "L01"
  series_no?: number;
  volume_no?: number;
  unit_no?: number;
}

function validate(p: any): { ok: true; data: Payload } | { ok: false; error: string } {
  if (!p || typeof p !== "object") return { ok: false, error: "Invalid body" };
  if (!p.passage || typeof p.passage !== "string" || p.passage.trim().length < 5)
    return { ok: false, error: "passage(영문 본문)은 필수입니다 (최소 5자)" };
  if (p.passage.length > 20000) return { ok: false, error: "passage가 너무 깁니다 (20000자 제한)" };
  for (const k of ["textbook", "item_code", "title_ko", "topic_ko", "topic_en", "expected_title", "level"]) {
    if (p[k] != null && typeof p[k] !== "string") return { ok: false, error: `${k} must be string` };
    if (typeof p[k] === "string" && p[k].length > 500) return { ok: false, error: `${k} too long` };
  }
  if (p.analysis_html != null && typeof p.analysis_html !== "string")
    return { ok: false, error: "analysis_html must be string" };
  if (p.structure_html != null && typeof p.structure_html !== "string")
    return { ok: false, error: "structure_html must be string" };
  if (p.analysis_html && p.analysis_html.length > 500_000)
    return { ok: false, error: "analysis_html too large" };
  if (p.structure_html && p.structure_html.length > 500_000)
    return { ok: false, error: "structure_html too large" };
  return { ok: true, data: p as Payload };
}

function htmlDocument(title: string, bodyHtml: string): string {
  // Wrap raw HTML fragment into a printable A4 document
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><title>${title}</title>
<style>
  @page { size: A4; margin: 18mm; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans KR", sans-serif; color: #111; line-height: 1.55; font-size: 12pt; }
  h1,h2,h3 { color: #111; }
  pre, code { white-space: pre-wrap; word-break: break-word; }
  table { border-collapse: collapse; width: 100%; }
  td, th { border: 1px solid #ddd; padding: 6px 8px; }
</style>
</head><body>${bodyHtml}</body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (!SUPABASE_URL || !SERVICE_ROLE) return json({ ok: false, error: "Server misconfigured" }, 500);

  // --- Token auth ---
  const authHeader = req.headers.get("Authorization") || req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ ok: false, error: "Bearer 토큰이 필요합니다" }, 401);

  const tokenHash = await sha256Hex(token);
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  const { data: tokenRow, error: tokenErr } = await admin
    .from("import_tokens")
    .select("id, teacher_id, revoked")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (tokenErr) return json({ ok: false, error: "Token lookup failed" }, 500);
  if (!tokenRow || tokenRow.revoked)
    return json({ ok: false, error: "유효하지 않거나 폐기된 토큰입니다" }, 401);

  const teacherId: string = tokenRow.teacher_id;

  // Verify teacher still has role
  const { data: roleRow } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", teacherId)
    .in("role", ["teacher", "admin"])
    .maybeSingle();
  if (!roleRow) return json({ ok: false, error: "토큰 소유자가 더 이상 교사가 아닙니다" }, 403);

  // --- Parse + validate body ---
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }
  const v = validate(body);
  if (!v.ok) return json({ ok: false, error: v.error }, 400);
  const p = v.data;

  // --- Resolve Series / Textbook / Unit (auto-create if missing) ---
  const level = (p.level && /^L\d{2}$/i.test(p.level) ? p.level.toUpperCase() : "L01");
  const seriesNo = Number.isFinite(Number(p.series_no)) ? Number(p.series_no) : 1;
  const volumeNo = Number.isFinite(Number(p.volume_no)) ? Number(p.volume_no) : 1;
  const lessonNum = Number(p.lesson);
  const unitNo = Number.isFinite(Number(p.unit_no))
    ? Number(p.unit_no)
    : Number.isFinite(lessonNum)
      ? lessonNum
      : 1;

  const textbookTitle = p.textbook?.trim() || "Claude Import";
  const lessonLabel =
    p.lesson != null && p.lesson !== ""
      ? `Lesson ${p.lesson}`
      : `Unit ${unitNo}`;

  // 1) Series
  let { data: series } = await admin
    .from("textbook_series")
    .select("id")
    .eq("level", level)
    .eq("series_no", seriesNo)
    .maybeSingle();
  if (!series) {
    const { data: created, error } = await admin
      .from("textbook_series")
      .insert({ level, series_no: seriesNo, title: textbookTitle, created_by: teacherId })
      .select("id")
      .single();
    if (error) return json({ ok: false, error: `Series 생성 실패: ${error.message}` }, 500);
    series = created;
  }

  // 2) Textbook (volume)
  let { data: textbook } = await admin
    .from("textbooks")
    .select("id")
    .eq("series_id", series!.id)
    .eq("volume_no", volumeNo)
    .maybeSingle();
  if (!textbook) {
    const { data: created, error } = await admin
      .from("textbooks")
      .insert({
        series_id: series!.id,
        level,
        volume_no: volumeNo,
        unit_no: unitNo,
        title: textbookTitle,
        created_by: teacherId,
      })
      .select("id")
      .single();
    if (error) return json({ ok: false, error: `Textbook 생성 실패: ${error.message}` }, 500);
    textbook = created;
  }

  // 3) Unit
  let { data: unit } = await admin
    .from("textbook_units")
    .select("id, analysis_pdf_url, structure_pdf_url")
    .eq("textbook_id", textbook!.id)
    .eq("unit_no", unitNo)
    .maybeSingle();
  if (!unit) {
    const { data: created, error } = await admin
      .from("textbook_units")
      .insert({
        textbook_id: textbook!.id,
        unit_no: unitNo,
        title: lessonLabel,
        description: p.title_ko || p.expected_title || null,
        created_by: teacherId,
      })
      .select("id, analysis_pdf_url, structure_pdf_url")
      .single();
    if (error) return json({ ok: false, error: `Unit 생성 실패: ${error.message}` }, 500);
    unit = created;
  }

  // 4) Passage
  const itemSlug = safeSlug(p.item_code || `${Date.now()}`);
  const baseCode = `${safeSlug(textbookTitle)}-${unitNo}-${itemSlug}`;
  // Determine next passage_no for this unit
  const { data: existing } = await admin
    .from("textbook_passages")
    .select("passage_no, code")
    .eq("unit_id", unit!.id)
    .order("passage_no", { ascending: false })
    .limit(1);
  const nextNo = (existing?.[0]?.passage_no ?? 0) + 1;

  // Ensure code uniqueness — append -N if collision
  let finalCode = baseCode;
  for (let i = 2; i < 50; i++) {
    const { data: clash } = await admin
      .from("textbook_passages")
      .select("id")
      .eq("code", finalCode)
      .maybeSingle();
    if (!clash) break;
    finalCode = `${baseCode}-${i}`;
  }

  const koreanParts = [p.title_ko, p.topic_ko].filter(Boolean).join(" / ") || null;

  const { data: passage, error: passErr } = await admin
    .from("textbook_passages")
    .insert({
      textbook_id: textbook!.id,
      unit_id: unit!.id,
      passage_no: nextNo,
      code: finalCode,
      english: p.passage.trim(),
      korean: koreanParts,
      analysis_status: "ready",
    })
    .select("id, code")
    .single();
  if (passErr) return json({ ok: false, error: `Passage 생성 실패: ${passErr.message}` }, 500);

  // 5) Upload HTML files to storage (kept as .html — viewable in browser; user can print to PDF)
  const uploads: { kind: "analysis" | "structure"; url: string }[] = [];
  const ts = Date.now();

  async function uploadHtml(kind: "analysis" | "structure", html: string) {
    const path = `claude-import/${teacherId}/${unit!.id}/${kind}-${ts}-${itemSlug}.html`;
    const doc = htmlDocument(`${kind === "analysis" ? "분석교안" : "구조도"} - ${finalCode}`, html);
    const { error } = await admin.storage
      .from("analysis-materials")
      .upload(path, new Blob([doc], { type: "text/html; charset=utf-8" }), {
        contentType: "text/html; charset=utf-8",
        upsert: true,
      });
    if (error) throw new Error(`${kind} 업로드 실패: ${error.message}`);
    uploads.push({ kind, url: path });
    return path;
  }

  try {
    const unitPatch: Record<string, unknown> = {};
    if (p.analysis_html && p.analysis_html.trim()) {
      const path = await uploadHtml("analysis", p.analysis_html);
      unitPatch.analysis_pdf_url = path;
      unitPatch.analysis_pdf_name = `${finalCode}-분석교안.html`;
      unitPatch.analysis_pdf_uploaded_at = new Date().toISOString();
    }
    if (p.structure_html && p.structure_html.trim()) {
      const path = await uploadHtml("structure", p.structure_html);
      unitPatch.structure_pdf_url = path;
      unitPatch.structure_pdf_name = `${finalCode}-구조도.html`;
      unitPatch.structure_pdf_uploaded_at = new Date().toISOString();
    }
    if (Object.keys(unitPatch).length > 0) {
      await admin.from("textbook_units").update(unitPatch).eq("id", unit!.id);
    }
  } catch (e) {
    // passage already created — return partial success
    return json(
      {
        ok: true,
        warning: (e as Error).message,
        passage_id: passage.id,
        code: passage.code,
        learn_url: `/learn/sentence/${passage.code}`,
      },
      200,
    );
  }

  // 6) Mark token as used
  await admin
    .from("import_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", tokenRow.id);

  return json({
    ok: true,
    passage_id: passage.id,
    code: passage.code,
    unit_id: unit!.id,
    learn_url: `/learn/sentence/${passage.code}`,
    uploads,
  });
});

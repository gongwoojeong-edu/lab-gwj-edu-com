// Edge Function: import-claude-handout
// Receives passage + analysis/structure HTML from external Claude Passage Analyzer
// Authenticates via Bearer token (hashed in import_tokens table)
// Auto-creates Series/Textbook(Volume)/Unit/Passage and stores HTML in analysis-materials bucket
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

// 🔧 v5: 결정적 문장 분리 — AI 재작성 없이 .!? / 줄바꿈 기준.
//        날짜·제목 줄(종결부호 없음)도 줄바꿈으로 보존. 못 나누면 통째로 반환.
function splitIntoSentences(text: string): string[] {
  const raw = (text || "").replace(/\r\n/g, "\n").trim();
  if (!raw) return [];

  // [Step 1] 한국어 해석 영역 분리 (줄 단위, 한글 비율 > 30%면 이후 버림)
  const lines = raw.split("\n");
  const englishLines: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      englishLines.push(line);
      continue;
    }
    const koreanCount = (trimmed.match(/[\uAC00-\uD7AF]/g) || []).length;
    if (koreanCount > trimmed.length * 0.3) break;
    englishLines.push(line);
  }
  let englishText = englishLines.join("\n").trim();
  if (!englishText) {
    englishText = raw;
  }

  // [Step 2] 어휘 주석 제거 (*word: 뜻)
  const noteIdx = englishText.search(/(?:^|\s)\*+[A-Za-z]/);
  if (noteIdx >= 0) {
    englishText = englishText.slice(0, noteIdx).trim();
  }
  if (!englishText) return [];

  // [Step 3] 원형 숫자 기호 분할 (➊~⑳ / ①~⑳)
  const circledRegex = /[\u278A-\u2793\u2460-\u2473]/;
  if (circledRegex.test(englishText)) {
    const firstCircled = englishText.search(/[\u278A-\u2793\u2460-\u2473]/);
    if (firstCircled > 0) englishText = englishText.slice(firstCircled);
    const parts = englishText
      .split(/(?=[\u278A-\u2793\u2460-\u2473])/)
      .map((s) => s.replace(/^[\u278A-\u2793\u2460-\u2473]\s*/, "").replace(/\s+/g, " ").trim())
      .filter(Boolean);
    if (parts.length > 0) return parts;
  }

  // [Step 4] 결정적 분리: .!? + 공백/줄바꿈, 또는 종결부호 없는 줄바꿈+다음 대문자
  const parts = englishText
    .split(/(?<=[.!?])(?:[ \t\f\v]+|\n+)|(?<![.!?])\n+(?=[A-Z"'(\[{0-9\u201C])/)
    .map((s) => s.replace(/[ \t\f\v]+/g, " ").replace(/\n+/g, " ").trim())
    .filter(Boolean);

  if (parts.length === 0) {
    const one = englishText.replace(/\s+/g, " ").trim();
    return one ? [one] : [];
  }
  return parts;
}

/** 공백 제거 비교 — 문장 이어붙인 결과가 원문과 다르면 거부 */
function compactAlpha(text: string): string {
  return (text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, "")
    .trim();
}

/** split과 동일한 전처리로 영어 원문 구간만 추출 */
function extractEnglishSource(text: string): string {
  const raw = (text || "").replace(/\r\n/g, "\n").trim();
  if (!raw) return "";
  const lines = raw.split("\n");
  const englishLines: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      englishLines.push(line);
      continue;
    }
    const koreanCount = (trimmed.match(/[\uAC00-\uD7AF]/g) || []).length;
    if (koreanCount > trimmed.length * 0.3) break;
    englishLines.push(line);
  }
  let englishText = englishLines.join("\n").trim() || raw;
  const noteIdx = englishText.search(/(?:^|\s)\*+[A-Za-z]/);
  if (noteIdx >= 0) englishText = englishText.slice(0, noteIdx).trim();
  return englishText;
}

/**
 * 원문 뒤쪽의 한국어 해석 영역을 문장별로 분리.
 * 영어 문장 개수(expected)와 정확히 일치할 때만 배열을 반환. 그렇지 않으면 빈 배열.
 * 규칙: 한글 비율 > 30% 라인만 수집 → 원형숫자(➊/①) 또는 개행/마침표로 분할.
 */
function extractKoreanSentences(text: string, expected: number): string[] {
  const raw = (text || "").replace(/\r\n/g, "\n").trim();
  if (!raw) return [];
  const lines = raw.split("\n");
  const koreanLines: string[] = [];
  let started = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (started) koreanLines.push("");
      continue;
    }
    const kc = (trimmed.match(/[\uAC00-\uD7AF]/g) || []).length;
    const isKorean = kc > trimmed.length * 0.3;
    if (!started) {
      if (isKorean) { started = true; koreanLines.push(trimmed); }
      continue;
    }
    // 한국어 영역 시작 후: 어휘주석(*word) 나오면 종료
    if (/^\*+[A-Za-z]/.test(trimmed)) break;
    koreanLines.push(trimmed);
  }
  let ko = koreanLines.join("\n").trim();
  if (!ko) return [];

  const circledRegex = /[\u278A-\u2793\u2460-\u2473]/;
  let parts: string[] = [];
  if (circledRegex.test(ko)) {
    const first = ko.search(circledRegex);
    if (first > 0) ko = ko.slice(first);
    parts = ko
      .split(/(?=[\u278A-\u2793\u2460-\u2473])/)
      .map((s) => s.replace(/^[\u278A-\u2793\u2460-\u2473]\s*/, "").replace(/\s+/g, " ").trim())
      .filter(Boolean);
  } else {
    parts = ko
      .split(/\n+|(?<=[.!?。！？])\s+/)
      .map((s) => s.replace(/\s+/g, " ").trim())
      .filter(Boolean);
  }
  if (parts.length !== expected) return [];
  return parts;
}

/**
 * 신텍스스튜디오 최신 내보내기는 passage 본문이 아니라
 * sentences[].ko / sentences[].translation 필드에 한줄해석을 따로 보낸다.
 * 우선 이 구조화된 값을 사용하고, 없을 때만 passage 뒤쪽 한글 영역 파싱으로 폴백한다.
 */
function extractPayloadKoreanSentences(p: Payload, expected: number): string[] {
  const normalize = (value: unknown) =>
    typeof value === "string"
      ? value.replace(/^▶?\s*직독[·ㆍ]\s*의역\s*/i, "").replace(/\s+/g, " ").trim()
      : "";

  const explicitArrays = [p.korean_sentences, p.translations, p.sentence_translations];
  for (const arr of explicitArrays) {
    if (Array.isArray(arr) && arr.length === expected) {
      const lines = arr.map(normalize);
      if (lines.every(Boolean)) return lines;
    }
  }

  if (Array.isArray(p.sentences) && p.sentences.length === expected) {
    const lines = p.sentences.map((s) =>
      normalize(s?.ko) || normalize(s?.translation) || normalize(s?.korean)
    );
    if (lines.every(Boolean)) return lines;
  }

  return extractKoreanSentences(p.passage, expected);
}

function assertSentenceFidelity(passage: string, sentences: string[]): string | null {
  if (!sentences.length) return "passage에서 문장을 찾지 못했습니다";

  const englishSrc = extractEnglishSource(passage);
  const o = compactAlpha(englishSrc);
  const j = compactAlpha(sentences.join(" "));

  // 원문에 없는 조각(AI 변형 잔재) 금지
  for (const s of sentences) {
    if (!o.includes(compactAlpha(s))) {
      return `문장 분리 무결성 실패: 원문에 없는 조각 — "${s.slice(0, 48)}${s.length > 48 ? "…" : ""}"`;
    }
  }

  if (o !== j) {
    return `문장 분리 무결성 실패: 영문 글자 불일치 (원문 ${o.length} vs 결과 ${j.length}) — 조용한 누락 금지`;
  }
  return null;
}


interface StructureNode {
  id: number;
  label: string;
  english: string;
  korean: string;
  literal: string;
  point: string;
  children: number[];
}

interface StructurePayload {
  nodes: StructureNode[];
  svg?: string;
}

interface Payload {
  // Legacy fields (still supported)
  textbook?: string;
  lesson?: string | number;
  item_code?: string;
  title_ko?: string;
  expected_title?: string;
  topic_ko?: string;
  topic_en?: string;
  passage: string;
  sentences?: Array<{
    number?: number | string;
    en?: string;
    sentence_en?: string;
    ko?: string;
    translation?: string;
    korean?: string;
  }>;
  korean_sentences?: string[];
  translations?: string[];
  sentence_translations?: string[];
  analysis_html?: string;
  analysisHtml?: string;
  structure_html?: string;
  structureHtml?: string;
  structure?: StructurePayload;
  structure_data?: StructurePayload;
  // New hierarchy fields
  level?: string;            // "L01"~"L10"
  series_title?: string;     // e.g. "모의고사"
  series_no?: number;
  volume_title?: string;     // e.g. "2026년 3월"
  volume_no?: number;
  unit_title?: string;       // e.g. "263모고32" — different per question to create separate units
  unit_no?: number;
  passage_no?: number;
}

function validateStructure(s: unknown): string | null {
  if (s == null) return null;
  if (typeof s !== "object" || Array.isArray(s)) return "structure must be object";
  const o = s as Record<string, unknown>;
  if (!Array.isArray(o.nodes)) return "structure.nodes must be array";
  for (let i = 0; i < o.nodes.length; i++) {
    const n = o.nodes[i];
    if (!n || typeof n !== "object" || Array.isArray(n)) {
      return `structure.nodes[${i}] must be object`;
    }
    const node = n as Record<string, unknown>;
    for (const k of ["id", "label", "english", "korean", "literal", "point", "children"] as const) {
      if (!(k in node)) return `structure.nodes[${i}] missing key ${k}`;
    }
    if (typeof node.label !== "string") return `structure.nodes[${i}].label must be string`;
    if (typeof node.english !== "string") return `structure.nodes[${i}].english must be string`;
    if (typeof node.korean !== "string") return `structure.nodes[${i}].korean must be string`;
    if (typeof node.literal !== "string") return `structure.nodes[${i}].literal must be string`;
    if (typeof node.point !== "string") return `structure.nodes[${i}].point must be string`;
    if (!Array.isArray(node.children)) return `structure.nodes[${i}].children must be array`;
  }
  if (o.svg != null && typeof o.svg !== "string") return "structure.svg must be string";
  if (typeof o.svg === "string" && o.svg.length > 500_000) return "structure.svg too large";
  return null;
}

function isFullHtmlDocument(html: string): boolean {
  const head = html.trimStart().replace(/^\uFEFF/, "");
  return /^<!DOCTYPE\s+html/i.test(head) || /^<html[\s>]/i.test(head);
}

function validate(p: any): { ok: true; data: Payload } | { ok: false; error: string } {
  if (!p || typeof p !== "object") return { ok: false, error: "Invalid body" };
  if (!p.passage || typeof p.passage !== "string" || p.passage.trim().length < 5)
    return { ok: false, error: "passage(영문 본문)은 필수입니다 (최소 5자)" };
  if (p.passage.length > 20000) return { ok: false, error: "passage가 너무 깁니다 (20000자 제한)" };
  for (const k of [
    "textbook", "item_code", "title_ko", "topic_ko", "topic_en",
    "expected_title", "level", "series_title", "volume_title", "unit_title",
  ]) {
    if (p[k] != null && typeof p[k] !== "string") return { ok: false, error: `${k} must be string` };
    if (typeof p[k] === "string" && p[k].length > 500) return { ok: false, error: `${k} too long` };
  }
  for (const k of ["analysis_html", "analysisHtml", "structure_html", "structureHtml"]) {
    if (p[k] != null && typeof p[k] !== "string") return { ok: false, error: `${k} must be string` };
  }
  if (p.sentences != null && !Array.isArray(p.sentences))
    return { ok: false, error: "sentences must be array" };
  for (const k of ["korean_sentences", "translations", "sentence_translations"]) {
    if (p[k] != null && !Array.isArray(p[k])) return { ok: false, error: `${k} must be array` };
    if (Array.isArray(p[k]) && p[k].some((v: unknown) => typeof v !== "string")) {
      return { ok: false, error: `${k} must contain strings` };
    }
  }
  const analysisHtml = p.analysis_html ?? p.analysisHtml;
  const structureHtml = p.structure_html ?? p.structureHtml;
  if (analysisHtml && analysisHtml.length > 500_000)
    return { ok: false, error: "analysis_html too large" };
  if (structureHtml && structureHtml.length > 500_000)
    return { ok: false, error: "structure_html too large" };
  const structureErr = validateStructure(p.structure ?? p.structure_data);
  if (structureErr) return { ok: false, error: structureErr };
  return { ok: true, data: p as Payload };
}

function htmlDocument(title: string, bodyHtml: string): string {
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

  // Verify teacher still has role — use limit(1) instead of maybeSingle()
  // because a user may have multiple roles (teacher + admin + student) and
  // maybeSingle() throws when more than one row matches.
  const { data: roleRows, error: roleErr } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", teacherId)
    .in("role", ["teacher", "admin"])
    .limit(1);
  if (roleErr) return json({ ok: false, error: "Role lookup failed" }, 500);
  if (!roleRows || roleRows.length === 0)
    return json({ ok: false, error: "토큰 소유자가 더 이상 교사가 아닙니다" }, 403);

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

  // --- Resolve hierarchy parameters ---
  const level = (p.level && /^L\d{2}$/i.test(p.level) ? p.level.toUpperCase() : "L01");

  const seriesTitle = (p.series_title?.trim()) || (p.textbook?.trim()) || "Claude Import";
  const seriesNoExplicit = Number.isFinite(Number(p.series_no)) ? Number(p.series_no) : null;

  const volumeTitle = p.volume_title?.trim() || seriesTitle;
  const volumeNoExplicit = Number.isFinite(Number(p.volume_no)) ? Number(p.volume_no) : null;

  const lessonNum = Number(p.lesson);
  const unitTitleExplicit = p.unit_title?.trim() || null;
  const unitNoExplicit = Number.isFinite(Number(p.unit_no))
    ? Number(p.unit_no)
    : Number.isFinite(lessonNum)
      ? lessonNum
      : null;

  // ===== 1) Series resolution: (level + title) → (level + series_no) → create =====
  let series: { id: string; series_no: number } | null = null;
  {
    const { data } = await admin
      .from("textbook_series")
      .select("id, series_no")
      .eq("level", level)
      .eq("title", seriesTitle)
      .limit(1);
    if (data && data.length > 0) series = data[0] as any;
  }
  if (!series && seriesNoExplicit !== null) {
    const { data } = await admin
      .from("textbook_series")
      .select("id, series_no")
      .eq("level", level)
      .eq("series_no", seriesNoExplicit)
      .limit(1);
    if (data && data.length > 0) series = data[0] as any;
  }
  if (!series) {
    // Auto-pick next series_no within this level
    const { data: maxRow } = await admin
      .from("textbook_series")
      .select("series_no")
      .eq("level", level)
      .order("series_no", { ascending: false })
      .limit(1);
    const nextSeriesNo = seriesNoExplicit ?? ((maxRow?.[0]?.series_no ?? 0) + 1);
    const { data: created, error } = await admin
      .from("textbook_series")
      .insert({ level, series_no: nextSeriesNo, title: seriesTitle, created_by: teacherId })
      .select("id, series_no")
      .single();
    if (error) return json({ ok: false, error: `Series 생성 실패: ${error.message}` }, 500);
    series = created as any;
  }

  // ===== 2) Textbook (Volume) resolution: (series + title) → (series + volume_no) → create =====
  let textbook: { id: string; volume_no: number } | null = null;
  {
    const { data } = await admin
      .from("textbooks")
      .select("id, volume_no")
      .eq("series_id", series!.id)
      .eq("title", volumeTitle)
      .limit(1);
    if (data && data.length > 0) textbook = data[0] as any;
  }
  if (!textbook && volumeNoExplicit !== null) {
    const { data } = await admin
      .from("textbooks")
      .select("id, volume_no")
      .eq("series_id", series!.id)
      .eq("volume_no", volumeNoExplicit)
      .limit(1);
    if (data && data.length > 0) textbook = data[0] as any;
  }
  if (!textbook) {
    const { data: maxRow } = await admin
      .from("textbooks")
      .select("volume_no")
      .eq("series_id", series!.id)
      .order("volume_no", { ascending: false })
      .limit(1);
    const nextVolumeNo = volumeNoExplicit ?? ((maxRow?.[0]?.volume_no ?? 0) + 1);
    const { data: created, error } = await admin
      .from("textbooks")
      .insert({
        series_id: series!.id,
        level,
        volume_no: nextVolumeNo,
        unit_no: unitNoExplicit ?? 1, // legacy column on textbooks
        title: volumeTitle,
        created_by: teacherId,
      })
      .select("id, volume_no")
      .single();
    if (error) return json({ ok: false, error: `Textbook 생성 실패: ${error.message}` }, 500);
    textbook = created as any;
  }

  // ===== 3) Unit resolution: (textbook + unit_title) → (textbook + unit_no) → create =====
  let unit: { id: string; unit_no: number; analysis_pdf_url?: string | null; structure_pdf_url?: string | null } | null = null;
  if (unitTitleExplicit) {
    const { data } = await admin
      .from("textbook_units")
      .select("id, unit_no, analysis_pdf_url, structure_pdf_url")
      .eq("textbook_id", textbook!.id)
      .eq("title", unitTitleExplicit)
      .limit(1);
    if (data && data.length > 0) unit = data[0] as any;
  }
  if (!unit && unitNoExplicit !== null) {
    const { data } = await admin
      .from("textbook_units")
      .select("id, unit_no, analysis_pdf_url, structure_pdf_url")
      .eq("textbook_id", textbook!.id)
      .eq("unit_no", unitNoExplicit)
      .limit(1);
    if (data && data.length > 0) unit = data[0] as any;
  }
  if (!unit) {
    const { data: maxRow } = await admin
      .from("textbook_units")
      .select("unit_no")
      .eq("textbook_id", textbook!.id)
      .order("unit_no", { ascending: false })
      .limit(1);
    const nextUnitNo = unitNoExplicit ?? ((maxRow?.[0]?.unit_no ?? 0) + 1);
    const unitTitle = unitTitleExplicit
      ?? (p.lesson != null && p.lesson !== "" ? `Lesson ${p.lesson}` : `Unit ${nextUnitNo}`);
    const { data: created, error } = await admin
      .from("textbook_units")
      .insert({
        textbook_id: textbook!.id,
        unit_no: nextUnitNo,
        title: unitTitle,
        description: p.title_ko || p.expected_title || null,
        created_by: teacherId,
      })
      .select("id, unit_no, analysis_pdf_url, structure_pdf_url")
      .single();
    if (error) return json({ ok: false, error: `Unit 생성 실패: ${error.message}` }, 500);
    unit = created as any;
  }

  // ===== 4) Passage =====
  // Split incoming passage into per-sentence rows so word-study / syntax-analysis
  // can iterate one sentence at a time. A passage that contains a single sentence
  // is stored as one row; multi-sentence passages produce N rows that share a
  // common base code with -1, -2, ... suffix.
  const sentences = splitIntoSentences(p.passage);
  if (sentences.length === 0)
    return json({ ok: false, error: "passage에서 문장을 찾지 못했습니다" }, 400);

  const fidelityErr = assertSentenceFidelity(p.passage, sentences);
  if (fidelityErr) return json({ ok: false, error: fidelityErr }, 400);

  // Determine starting passage_no for this unit. An explicit passage_no means
  // "replace this imported passage"; an omitted value keeps append behavior.
  const { data: existing } = await admin
    .from("textbook_passages")
    .select("passage_no")
    .eq("unit_id", unit!.id)
    .order("passage_no", { ascending: false })
    .limit(1);
  const startNo = Number.isFinite(Number(p.passage_no))
    ? Number(p.passage_no)
    : ((existing?.[0]?.passage_no ?? 0) + 1);

  // Build base code: prefer explicit item_code, else derive from unit + passage_no
  const itemSlug = safeSlug(p.item_code || `${unit!.unit_no}-${startNo}`);
  const baseCode = p.item_code?.trim()
    ? safeSlug(p.item_code)
    : `${safeSlug(seriesTitle)}-${unit!.unit_no}-${startNo}`;

  // Ensure base code is free — append -alt2/3 if collision (rare)
  let codeRoot = baseCode;
  for (let i = 2; i < 50; i++) {
    // Check if any existing code starts with codeRoot (would conflict with -1, -2, ...)
    const { data: clash } = await admin
      .from("textbook_passages")
      .select("id")
      .or(`code.eq.${codeRoot},code.like.${codeRoot}-%`)
      .limit(1);
    if (!clash || clash.length === 0) break;
    codeRoot = `${baseCode}-alt${i}`;
  }

  // ⚠️ 지문 제목/주제(title_ko, topic_ko)를 문장 단위 korean 컬럼에 넣지 않는다.
  //   과거에는 첫 문장 korean에 "title / topic"을 저장했으나,
  //   그 값이 "한글해석 정답"으로 노출되어 실제 문장 해석과 무관한 문구가 학생/선생님 화면에 표시되는 문제가 있었다.
  //   문장 단위 한글해석 정답은 반드시 선생님이 문장별로 직접 입력한다.
  //   단, 신텍스스튜디오(외부 분석기)에서 영문과 함께 한글 해석을 함께 전송한 경우
  //   문장 수가 정확히 일치하면 문장별 korean 컬럼에 자동 매핑한다.
  const koreanSentences = extractPayloadKoreanSentences(p, sentences.length);
  const isMulti = sentences.length > 1;
  const rows = sentences.map((sent, i) => ({
    textbook_id: textbook!.id,
    unit_id: unit!.id,
    passage_no: startNo + i,
    code: isMulti ? `${codeRoot}-${i + 1}` : codeRoot,
    english: sent,
    korean: koreanSentences[i] ?? null,
    analysis_status: "draft", // 🆕 v4: 분석기 전송본은 draft 상태 — 선생님이 마스터키 입력 후 학생 공개 버튼으로 ready 전환
  }));

  let insertedRows: Array<{ id: string; code: string }> = [];
  if (Number.isFinite(Number(p.passage_no))) {
    const endNo = startNo + rows.length - 1;
    const { data: replaceTargets, error: targetErr } = await admin
      .from("textbook_passages")
      .select("id, code, passage_no, created_at")
      .eq("unit_id", unit!.id)
      .gte("passage_no", startNo)
      .lte("passage_no", endNo)
      .order("created_at", { ascending: true });
    if (targetErr) return json({ ok: false, error: `기존 Passage 조회 실패: ${targetErr.message}` }, 500);

    const targetsByNo = new Map<number, Array<{ id: string; code: string }>>();
    for (const target of replaceTargets ?? []) {
      const list = targetsByNo.get(target.passage_no) ?? [];
      list.push({ id: target.id, code: target.code });
      targetsByNo.set(target.passage_no, list);
    }

    const newRows: typeof rows = [];
    for (const row of rows) {
      const targets = targetsByNo.get(row.passage_no) ?? [];
      const keeper = targets[0];
      if (!keeper) {
        newRows.push(row);
        continue;
      }
      const { data: updated, error: updateErr } = await admin
        .from("textbook_passages")
        .update({ english: row.english, korean: row.korean, analysis_status: row.analysis_status })
        .eq("id", keeper.id)
        .select("id, code")
        .single();
      if (updateErr) return json({ ok: false, error: `Passage 덮어쓰기 실패: ${updateErr.message}` }, 500);
      insertedRows.push(updated as { id: string; code: string });

      const duplicateIds = targets.slice(1).map((target) => target.id);
      if (duplicateIds.length) {
        const { error: deleteErr } = await admin.from("textbook_passages").delete().in("id", duplicateIds);
        if (deleteErr) return json({ ok: false, error: `중복 Passage 정리 실패: ${deleteErr.message}` }, 500);
      }
    }
    if (newRows.length) {
      const { data: created, error: createErr } = await admin
        .from("textbook_passages")
        .insert(newRows)
        .select("id, code");
      if (createErr) return json({ ok: false, error: `Passage 생성 실패: ${createErr.message}` }, 500);
      insertedRows = [...insertedRows, ...((created ?? []) as Array<{ id: string; code: string }>)];
    }
  } else {
    const { data: created, error: passErr } = await admin
      .from("textbook_passages")
      .insert(rows)
      .select("id, code");
    if (passErr) return json({ ok: false, error: `Passage 생성 실패: ${passErr.message}` }, 500);
    insertedRows = (created ?? []) as Array<{ id: string; code: string }>;
  }

  // First row is treated as "the passage" for legacy response/upload paths
  const passage = insertedRows[0] as { id: string; code: string };
  const finalCode = passage.code;


  // ===== 5) Upload HTML files to storage =====
  const uploads: { kind: "analysis" | "structure"; url: string }[] = [];
  const ts = Date.now();

  async function uploadHtml(kind: "analysis" | "structure", html: string) {
    const path = `claude-import/${teacherId}/${unit!.id}/${kind}-${ts}-${itemSlug}.html`;
    const doc = isFullHtmlDocument(html)
      ? html
      : htmlDocument(`${kind === "analysis" ? "분석교안" : "구조도"} - ${finalCode}`, html);
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
    const analysisHtml = p.analysis_html ?? p.analysisHtml;
    const structureHtml = p.structure_html ?? p.structureHtml;
    const structureData = p.structure ?? p.structure_data;
    if (analysisHtml?.trim()) {
      const path = await uploadHtml("analysis", analysisHtml);
      unitPatch.analysis_pdf_url = path;
      unitPatch.analysis_pdf_name = `${finalCode}-분석교안.html`;
      unitPatch.analysis_pdf_uploaded_at = new Date().toISOString();
    }
    if (structureHtml?.trim()) {
      const path = await uploadHtml("structure", structureHtml);
      unitPatch.structure_pdf_url = path;
      unitPatch.structure_pdf_name = `${finalCode}-구조도.html`;
      unitPatch.structure_pdf_uploaded_at = new Date().toISOString();
    }

    // 분석/구조도 URL은 반드시 먼저 저장 (structure_data 컬럼 유무와 무관)
    if (Object.keys(unitPatch).length > 0) {
      const { error: patchErr } = await admin
        .from("textbook_units")
        .update(unitPatch)
        .eq("id", unit!.id);
      if (patchErr) throw new Error(`분석/구조도 저장 실패: ${patchErr.message}`);
    }

    // structure_data는 선택 — 마이그레이션 전이면 무시하고 본 전송은 성공 처리
    if (structureData?.nodes?.length) {
      const { error: structErr } = await admin
        .from("textbook_units")
        .update({ structure_data: structureData })
        .eq("id", unit!.id);
      if (structErr) {
        console.warn("structure_data 저장 스킵:", structErr.message);
      }
    }
  } catch (e) {
    return json(
      {
        ok: false,
        error: (e as Error).message,
        passage_id: passage.id,
        code: passage.code,
        unit_id: unit!.id,
        learn_url: `/learn/sentence/${passage.code}`,
      },
      200,
    );
  }

  // ===== 5.5) 단어 자동 추출 (백그라운드) =====
  //   학습기 전송 즉시 문장별 AI 단어 추출을 걸어 둔다.
  //   선생님은 이후 책장 화면에서 수동 검수 → [검수완료] 표기.
  const autoExtract = async () => {
    for (const row of insertedRows) {
      const sent = rows.find((r) => r.code === (row as { code: string }).code);
      if (!sent?.english?.trim()) continue;
      try {
        const resp = await fetch(`${SUPABASE_URL}/functions/v1/extract-sentence-words`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-internal-secret": SERVICE_ROLE,
          },
          body: JSON.stringify({ sentenceId: row.code, english: sent.english }),
        });
        if (!resp.ok) console.error("auto extract failed", row.code, resp.status, await resp.text());
      } catch (e) {
        console.error("auto extract error", row.code, e);
      }
    }
  };
  // deno-lint-ignore no-explicit-any
  const rt = (globalThis as any).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(autoExtract());
  else void autoExtract();

  // ===== 6) Mark token as used =====

  await admin
    .from("import_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", tokenRow.id);

  return json({
    ok: true,
    passage_id: passage.id,
    code: passage.code,
    unit_id: unit!.id,
    series_id: series!.id,
    textbook_id: textbook!.id,
    level,
    sentences_inserted: insertedRows.length,
    sentence_codes: insertedRows.map((r) => r.code),
    learn_url: `/learn/sentence/${passage.code}`,
    uploads,
  });
});

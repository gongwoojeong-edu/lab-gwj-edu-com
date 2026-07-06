// ============================================================
// memorizationText — 암기 단계 채점 (딕테이션·어순·빈칸)
// ============================================================
import type { SentenceToken } from "@/data/sentences";
import { koreanMeaningMatch, levenshtein } from "@/lib/speech";

export type MemDirection = "ko_to_en" | "en_to_ko";

export const MEM_DIRECTION_LABEL: Record<MemDirection, string> = {
  ko_to_en: "한글 → 영문",
  en_to_ko: "영문 → 한글",
};

export const DEFAULT_MEM_DIRECTION: MemDirection = "ko_to_en";

export function normalizeEnSentence(s: string): string {
  return s
    .toLowerCase()
    .replace(/['']/g, "'")
    .replace(/[^\w\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function englishWordsFromTokens(tokens: SentenceToken[]): string[] {
  return tokens.filter((t): t is Extract<SentenceToken, { type: "analyzable" }> => t.type === "analyzable").map((t) => t.text);
}

export function englishWordsFromText(english: string): string[] {
  return english.match(/[A-Za-z0-9][A-Za-z0-9'’\-]*/g) ?? [];
}

export function shuffleArray<T>(arr: T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** 딕테이션 — 영문 (관대: ~90% 유사) */
export function dictationPassEn(typed: string, expected: string): boolean {
  const t = normalizeEnSentence(typed);
  const e = normalizeEnSentence(expected);
  if (!t || !e) return false;
  if (t === e) return true;
  const tc = t.replace(/\s/g, "");
  const ec = e.replace(/\s/g, "");
  if (tc === ec) return true;
  const maxLen = Math.max(tc.length, ec.length);
  const dist = levenshtein(tc, ec);
  return 1 - dist / maxLen >= 0.88;
}

/** 딕테이션 — 한글 (의미 매칭 + 전체 유사도) */
export function dictationPassKo(typed: string, expected: string): boolean {
  if (koreanMeaningMatch(typed, expected)) return true;
  const norm = (s: string) => s.trim().replace(/\s+/g, "").toLowerCase();
  const t = norm(typed);
  const e = norm(expected);
  if (!t || !e) return false;
  if (t === e) return true;
  const maxLen = Math.max(t.length, e.length);
  return 1 - levenshtein(t, e) / maxLen >= 0.82;
}

export function scramblePass(selected: string[], expected: string[]): boolean {
  if (selected.length !== expected.length) return false;
  return selected.every((w, i) => w.toLowerCase() === expected[i].toLowerCase());
}

export interface ClozeBlank {
  id: string;
  word: string;
  options: string[];
}

export function splitKoreanChunksForMem(korean: string): string[] {
  if (!korean.trim()) return [];
  return korean
    .split(/(?:[,，/]|(?:\s*;\s*)|(?:\.\s+(?=[가-힣])))/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function buildKoreanClozeBlanks(korean: string, chunks?: string[]): ClozeBlank[] {
  const parts = chunks?.length ? chunks : splitKoreanChunksForMem(korean);
  if (parts.length === 0) return [];
  const n = Math.max(1, Math.ceil(parts.length * 0.35));
  const targets = parts.slice(0, n);
  const pool = parts.filter((p) => p.length > 1);

  return targets.map((word, i) => {
    const distractors = shuffleArray(pool.filter((p) => p !== word)).slice(0, 3);
    while (distractors.length < 3) distractors.push(`선택${distractors.length + 1}`);
    return {
      id: `ko-${i}`,
      word,
      options: shuffleArray([word, ...distractors.slice(0, 3)]),
    };
  });
}

export function buildClozeBlanks(
  tokens: SentenceToken[],
  blankIds: string[],
): ClozeBlank[] {
  const words = englishWordsFromTokens(tokens);
  const wordById = new Map(
    tokens
      .filter((t): t is Extract<SentenceToken, { type: "analyzable" }> => t.type === "analyzable")
      .map((t) => [t.id, t.text] as const),
  );
  const pool = words.filter((w) => w.length > 2);

  return blankIds
    .map((id) => wordById.get(id))
    .filter((w): w is string => !!w)
    .map((word) => {
      const distractors = shuffleArray(
        pool.filter((w) => w.toLowerCase() !== word.toLowerCase()),
      ).slice(0, 3);
      while (distractors.length < 3) {
        distractors.push(`(${distractors.length + 1})`);
      }
      const options = shuffleArray([word, ...distractors.slice(0, 3)]);
      const found = tokens.find((t) => t.type === "analyzable" && t.text === word);
      const id = found && found.type === "analyzable" ? found.id : word;
      return { id, word, options };
    });
}

export type DictationSegment =
  | { type: "text"; value: string }
  | { type: "blank"; id: string; answer: string };

/** 부분 받아쓰기 — blankRatio만큼 단어/어구를 빈칸 (전체는 불가) */
export function buildPartialDictationSegments(
  expected: string,
  blankRatio: number,
  direction: MemDirection,
): DictationSegment[] {
  const ratio = Math.min(0.65, Math.max(0.15, blankRatio));
  const parts =
    direction === "ko_to_en"
      ? tokenizeEnglishForDictation(expected)
      : tokenizeKoreanForDictation(expected);

  if (parts.length === 0) return [{ type: "text", value: expected }];

  const maxBlanks = Math.max(1, parts.length - 1);
  const blankCount = Math.min(maxBlanks, Math.max(1, Math.ceil(parts.length * ratio)));
  const ranked = parts
    .map((p, i) => ({ i, len: p.answer.length }))
    .sort((a, b) => b.len - a.len);
  const blankIdx = new Set(ranked.slice(0, blankCount).map((r) => r.i));

  const segs: DictationSegment[] = [];
  parts.forEach((p, i) => {
    if (p.prefix) segs.push({ type: "text", value: p.prefix });
    if (blankIdx.has(i)) {
      segs.push({ type: "blank", id: `b-${i}`, answer: p.answer });
    } else {
      segs.push({ type: "text", value: p.answer });
    }
    if (p.suffix) segs.push({ type: "text", value: p.suffix });
  });
  return segs;
}

function tokenizeEnglishForDictation(english: string): Array<{ answer: string; prefix: string; suffix: string }> {
  const re = /\b([A-Za-z0-9][A-Za-z0-9'’\-]*)\b/g;
  const out: Array<{ answer: string; prefix: string; suffix: string }> = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(english)) !== null) {
    out.push({
      prefix: english.slice(last, m.index),
      answer: m[1],
      suffix: "",
    });
    last = m.index + m[0].length;
  }
  if (out.length > 0) out[out.length - 1].suffix = english.slice(last);
  return out;
}

function tokenizeKoreanForDictation(korean: string): Array<{ answer: string; prefix: string; suffix: string }> {
  const chunks = splitKoreanChunksForMem(korean);
  if (chunks.length >= 2) {
    return chunks.map((c, i) => ({
      prefix: i === 0 ? "" : " ",
      answer: c,
      suffix: "",
    }));
  }
  const words = korean.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return words.map((w, i) => ({
      prefix: i === 0 ? "" : " ",
      answer: w,
      suffix: "",
    }));
  }
  return [{ prefix: "", answer: korean.trim(), suffix: "" }];
}

export function partialDictationPass(
  segments: DictationSegment[],
  answers: Record<string, string>,
  direction: MemDirection,
): boolean {
  const blanks = segments.filter((s): s is Extract<DictationSegment, { type: "blank" }> => s.type === "blank");
  if (blanks.length === 0) return true;
  return blanks.every((b) => {
    const typed = answers[b.id] ?? "";
    return direction === "ko_to_en"
      ? dictationPassEn(typed, b.answer)
      : dictationPassKo(typed, b.answer);
  });
}

export function renderClozeSentence(english: string, blanks: ClozeBlank[], answers: Record<string, string>): string {
  let result = english;
  for (const b of blanks) {
    const chosen = answers[b.id];
    const display = chosen ? chosen : "______";
    const re = new RegExp(`\\b${b.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    result = result.replace(re, display);
  }
  return result;
}

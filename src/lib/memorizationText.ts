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
      const id = tokens.find((t) => t.type === "analyzable" && t.text === word)?.id ?? word;
      return { id, word, options };
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

// Word test utilities: question building, scoring, and Korean chosung hint.
import type { WordTestEntry } from "@/lib/wordTestBuilder";
import { isAnswerCorrect } from "@/lib/wordTestBuilder";

export type WordTestMode = "spell" | "meaning" | "mixed";

export type QuestionKind = "spell" | "meaning";

export interface Question {
  ownerId: string;
  word: string;
  expected: string;
  kind: QuestionKind;
  hint: string; // for meaning: chosung; for spell: ""
}

const CHOSUNG = [
  "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ",
  "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
];

/** "사과" → "ㅅㄱ", "쉬운 일" → "ㅅㅇ ㅇ" */
export const toChosung = (s: string): string => {
  let out = "";
  for (const ch of s) {
    const code = ch.charCodeAt(0);
    if (code >= 0xac00 && code <= 0xd7a3) {
      const idx = Math.floor((code - 0xac00) / (21 * 28));
      out += CHOSUNG[idx] ?? ch;
    } else if (/\s/.test(ch)) {
      out += " ";
    } else if (/[,/;]/.test(ch)) {
      out += ch;
    } else {
      out += ch;
    }
  }
  return out;
};

const seededRandom = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
};

const hashString = (s: string): number => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
};

export const buildQuestions = (
  entries: WordTestEntry[],
  mode: WordTestMode,
  attemptNo = 1,
): Question[] => {
  const rand = seededRandom(hashString(entries.map((e) => e.word).join("|")) + attemptNo);
  return entries.map((e) => {
    const kind: QuestionKind =
      mode === "spell" ? "spell" : mode === "meaning" ? "meaning" : rand() < 0.5 ? "spell" : "meaning";
    return {
      ownerId: e.ownerId,
      word: e.word,
      expected: e.expected,
      kind,
      hint: kind === "meaning" ? toChosung(e.expected.split(/[,/;]/)[0].trim()) : "",
    };
  });
};

const normSpell = (s: string) => s.trim().replace(/\s+/g, "").toLowerCase();

export const isQuestionCorrect = (q: Question, given: string): boolean => {
  if (!given.trim()) return false;
  if (q.kind === "spell") return normSpell(given) === normSpell(q.word);
  return isAnswerCorrect(given, q.expected);
};

export const MODE_LABEL: Record<WordTestMode, string> = {
  spell: "스펠링 쓰기",
  meaning: "뜻 쓰기 (초성힌트)",
  mixed: "혼합",
};

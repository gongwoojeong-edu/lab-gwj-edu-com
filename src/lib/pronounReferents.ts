/**
 * 대명사 지시어 규칙 (해석 단계 필수 입력).
 * 학생은 대명사 후보마다 셋 중 하나를 고른다:
 *  - in_sentence: 같은 문장의 단어를 가리킴
 *  - outside: 문장 밖 지시어를 영어로 직접 적음
 *  - non_pronoun: 가주어·비인칭주어 등 대명사가 아님
 */
export const PRONOUN_WORDS = new Set([
  "it", "its", "itself", "they", "them", "their", "theirs", "themselves",
  "this", "that", "these", "those", "he", "him", "his", "himself",
  "she", "her", "hers", "herself", "one", "ones",
]);

export const NON_PRONOUN_TYPES = [
  "가주어", "비인칭주어", "강조구문", "접속사", "관계대명사", "지시형용사", "기타",
] as const;
export type NonPronounType = (typeof NON_PRONOUN_TYPES)[number];

export type ReferentKind = "in_sentence" | "outside" | "non_pronoun";
export interface ReferentAnswer {
  wordIndex: number;
  word: string;
  kind: ReferentKind;
  targetIndex?: number | null;
  outsideText?: string | null;
  nonPronounType?: string | null;
}

/** 원문을 단어 단위로 나눈다 (앞뒤 문장부호 제거, 인덱스는 공백 기준 위치). */
export function splitWords(english: string): string[] {
  return english.trim().split(/\s+/).filter(Boolean)
    .map((w) => w.replace(/^[^A-Za-z0-9']+|[^A-Za-z0-9']+$/g, ""));
}

export function pronounCandidates(english: string): { index: number; word: string }[] {
  return splitWords(english)
    .map((word, index) => ({ index, word }))
    .filter((w) => PRONOUN_WORDS.has(w.word.toLowerCase().replace(/'s$/, "")));
}

const hasEnglish = (s: string) => /[A-Za-z]/.test(s) && !/[가-힣]/.test(s);

/** 하나의 답이 완성되었는지 */
export function isAnswerComplete(a: ReferentAnswer | undefined): boolean {
  if (!a) return false;
  if (a.kind === "in_sentence") return a.targetIndex != null && a.targetIndex !== a.wordIndex;
  if (a.kind === "outside") return !!a.outsideText && hasEnglish(a.outsideText.trim());
  return !!a.nonPronounType && (NON_PRONOUN_TYPES as readonly string[]).includes(a.nonPronounType);
}

/** 처리하지 않은 대명사 후보 (비어 있으면 제출 가능) */
export function missingReferents(english: string, answers: ReferentAnswer[]): { index: number; word: string }[] {
  const byIdx = new Map(answers.map((a) => [a.wordIndex, a]));
  return pronounCandidates(english).filter((c) => !isAnswerComplete(byIdx.get(c.index)));
}

/** 승인 전 검토: 조회 성공 후 모든 항목을 선생님이 확인해야 한다. */
export function isReferentReviewComplete(loaded: boolean, hasError: boolean, indices: number[], reviewed: Set<number>): boolean {
  return loaded && !hasError && indices.every((index) => reviewed.has(index));
}

/** 승인창 표시용 한 줄 */
export function describeAnswer(a: ReferentAnswer, words: string[]): string {
  if (a.kind === "in_sentence") return `${a.word} → ${words[a.targetIndex ?? -1] ?? "?"}`;
  if (a.kind === "outside") return `${a.word} → ${a.outsideText ?? ""} (문장 밖)`;
  return `${a.word} → ${a.nonPronounType ?? ""}`;
}

const norm = (s?: string | null) => (s ?? "").toLowerCase().replace(/^(the|a|an)\s+/, "").replace(/[^a-z0-9 ]/g, "").trim();

/** 정답(마스터)과 같은지. 정답이 없으면 null */
export function matchesMaster(a: ReferentAnswer, master?: ReferentAnswer): boolean | null {
  if (!master) return null;
  if (a.kind !== master.kind) return false;
  if (a.kind === "in_sentence") return a.targetIndex === master.targetIndex;
  if (a.kind === "outside") return norm(a.outsideText) === norm(master.outsideText);
  return a.nonPronounType === master.nonPronounType;
}

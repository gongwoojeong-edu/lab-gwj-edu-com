// ============================================================
// 정답 데이터 스키마 (원장님 입력용 템플릿)
// ============================================================
// 각 문장은 토큰 배열로 구성되며, 분석 대상 단어만 answer를 가집니다.
// 분석 대상이 아닌 단어/구두점은 type: "static"으로 표기 → 비활성 표시.
//
// Element : S(주어) | V(동사) | O(목적어) | C(보어) | M(수식어)
// POS     : Noun | Adjective | Adverb | Verb | Etc
// Form    : N | "to v" | "v-ing" | "[SV] clause" | "Preposition+N" | "v-ed"
// ============================================================

export type ElementAnswer = "S" | "V" | "O" | "C" | "M";
export type POSAnswer = "Noun" | "Adjective" | "Adverb" | "Verb" | "Etc";
export type FormAnswer =
  | "N"
  | "to v"
  | "v-ing"
  | "[SV] clause"
  | "Preposition+N"
  | "v-ed";

export interface WordAnswer {
  element: ElementAnswer;
  pos: POSAnswer;
  form: FormAnswer;
  /** 학생에게 보여줄 한국어 품사/역할 라벨 (정답 확정 후 표시) */
  koreanLabel: string;
}

export type SentenceToken =
  | {
      type: "analyzable";
      id: string;
      text: string;
      answer: WordAnswer;
    }
  | {
      type: "static";
      text: string;
      /** "[" / "]" 같은 구조 표시인 경우 */
      role?: "bracket" | "punct" | "word";
    };

export interface Sentence {
  id: string;
  no: number;
  english: string;
  korean: string;
  structureTags: string[]; // 예: "SIMPLE SENTENCE", "ACTIVE VOICE"
  tokens: SentenceToken[];
}

// ============================================================
// 데모 데이터 — 원장님 정답 데이터 받기 전 임시 샘플
// (받는 즉시 이 배열만 교체하면 됩니다)
// ============================================================

export const SENTENCES: Sentence[] = [
  {
    id: "s1",
    no: 1,
    english: "She wanted to improve her English.",
    korean: "그녀는 자신의 영어를 향상시키기를 원했다.",
    structureTags: ["SIMPLE SENTENCE", "ACTIVE VOICE", "S+V+O"],
    tokens: [
      { type: "static", text: "[", role: "bracket" },
      {
        type: "analyzable",
        id: "s1-w1",
        text: "She",
        answer: { element: "S", pos: "Noun", form: "N", koreanLabel: "대명사" },
      },
      {
        type: "analyzable",
        id: "s1-w2",
        text: "wanted",
        answer: { element: "V", pos: "Verb", form: "v-ed", koreanLabel: "과거동사" },
      },
      {
        type: "analyzable",
        id: "s1-w3",
        text: "to improve",
        answer: { element: "O", pos: "Noun", form: "to v", koreanLabel: "to부정사(명사)" },
      },
      { type: "static", text: "her", role: "word" },
      {
        type: "analyzable",
        id: "s1-w5",
        text: "English",
        answer: { element: "O", pos: "Noun", form: "N", koreanLabel: "명사" },
      },
      { type: "static", text: "]", role: "bracket" },
      { type: "static", text: ".", role: "punct" },
    ],
  },
  {
    id: "s2",
    no: 2,
    english: "The book on the desk is mine.",
    korean: "책상 위에 있는 책은 내 것이다.",
    structureTags: ["SIMPLE SENTENCE", "S+V+C"],
    tokens: [
      { type: "static", text: "[", role: "bracket" },
      { type: "static", text: "The", role: "word" },
      {
        type: "analyzable",
        id: "s2-w2",
        text: "book",
        answer: { element: "S", pos: "Noun", form: "N", koreanLabel: "명사" },
      },
      {
        type: "analyzable",
        id: "s2-w3",
        text: "on the desk",
        answer: {
          element: "M",
          pos: "Adjective",
          form: "Preposition+N",
          koreanLabel: "전치사구(형용사)",
        },
      },
      {
        type: "analyzable",
        id: "s2-w4",
        text: "is",
        answer: { element: "V", pos: "Verb", form: "v-ed", koreanLabel: "be동사" },
      },
      {
        type: "analyzable",
        id: "s2-w5",
        text: "mine",
        answer: { element: "C", pos: "Noun", form: "N", koreanLabel: "소유대명사" },
      },
      { type: "static", text: "]", role: "bracket" },
      { type: "static", text: ".", role: "punct" },
    ],
  },
];

// ============================================================
// 정답 데이터 스키마 (NEW: 품사 → 형태 → 성분 → 세부역할)
// ============================================================
// LAYER 01: pos    (명사/형용사/부사/동사/기타)
// LAYER 02: form   (명사일 때: 명사/to V/V-ing/접SV)
// LAYER 03a: element (S/O/C/M) — 접SV·형태전용칩일 땐 생략
// LAYER 03b: role  (세부 역할 또는 형태 전용 칩 텍스트)
//
// 동사(VerbAnswer)는 다중 속성. 학생이 모두 체크 후 ✱확정.
// ============================================================

export type POS = "명사" | "형용사" | "부사" | "동사" | "기타";
export type NounForm = "명사" | "to V" | "V-ing" | "접SV";
export type SentenceElement = "S" | "O" | "C" | "M";

// 하위호환용(기존 컴포넌트 import 깨짐 방지)
export type ElementAnswer = SentenceElement | "V";
export type POSAnswer = "Noun" | "Adjective" | "Adverb" | "Verb" | "Etc";
export type FormAnswer =
  | "N"
  | "to v"
  | "v-ing"
  | "[SV] clause"
  | "Preposition+N"
  | "v-ed";

export interface NounAnswer {
  pos: "명사";
  form: NounForm;
  /** 접SV 또는 형태전용칩이면 undefined */
  element?: SentenceElement;
  /** 세부역할 또는 형태전용칩 텍스트 (예: "주어", "의문사(to V)", "명사절that") */
  role: string;
  koreanLabel: string;
}

export type VerbNumber = "단수" | "복수" | "기타";
export type VerbTense = "현재" | "과거" | "미래";
export type VerbAspect = "진행" | "완료";

export interface VerbAnswer {
  pos: "동사";
  number?: VerbNumber;
  tense?: VerbTense;
  aspect?: VerbAspect[];
  voice?: "수동";
  proVerb?: boolean;
  koreanLabel: string;
}

export type WordAnswer = NounAnswer | VerbAnswer;

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
      role?: "bracket" | "punct" | "word";
    };

export interface Sentence {
  id: string;
  no: number;
  english: string;
  korean: string;
  structureTags: string[];
  tokens: SentenceToken[];
}

// ============================================================
// 데모 데이터 — 새 스키마로 마이그레이션
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
        answer: {
          pos: "명사",
          form: "명사",
          element: "S",
          role: "주어",
          koreanLabel: "주어 · 대명사",
        },
      },
      {
        type: "analyzable",
        id: "s1-w2",
        text: "wanted",
        answer: {
          pos: "동사",
          number: "단수",
          tense: "과거",
          koreanLabel: "과거동사",
        },
      },
      {
        type: "analyzable",
        id: "s1-w3",
        text: "to improve",
        answer: {
          pos: "명사",
          form: "to V",
          element: "O",
          role: "목적어(타동)",
          koreanLabel: "to부정사 · 목적어",
        },
      },
      { type: "static", text: "her", role: "word" },
      {
        type: "analyzable",
        id: "s1-w5",
        text: "English",
        answer: {
          pos: "명사",
          form: "명사",
          element: "O",
          role: "목적어(타동)",
          koreanLabel: "목적어 · 명사",
        },
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
        answer: {
          pos: "명사",
          form: "명사",
          element: "S",
          role: "주어",
          koreanLabel: "주어 · 명사",
        },
      },
      // 전치사구 — 형용사 라인이 아직 미구현이므로 static 으로 일단 보류
      { type: "static", text: "on the desk", role: "word" },
      {
        type: "analyzable",
        id: "s2-w4",
        text: "is",
        answer: {
          pos: "동사",
          number: "단수",
          tense: "현재",
          koreanLabel: "be동사",
        },
      },
      {
        type: "analyzable",
        id: "s2-w5",
        text: "mine",
        answer: {
          pos: "명사",
          form: "명사",
          element: "C",
          role: "주격보어",
          koreanLabel: "주격보어 · 소유대명사",
        },
      },
      { type: "static", text: "]", role: "bracket" },
      { type: "static", text: ".", role: "punct" },
    ],
  },
];

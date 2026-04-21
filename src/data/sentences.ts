// ============================================================
// 정답 데이터 스키마 (확장: 명사·동사·형용사·부사·기타)
// ============================================================
// LAYER 01: pos    (명사/형용사/부사/동사/기타)
// LAYER 02: form   (품사별 형태)
// LAYER 03a: element (명사: S/O/C/M · 형용사: C/M)
// LAYER 03b: role  (세부 역할 또는 형태 전용 칩 텍스트)
// ============================================================

export type POS = "명사" | "형용사" | "부사" | "동사" | "기타";
export type SentenceElement = "S" | "O" | "C" | "M";

// ---- 명사 ----
export type NounForm = "명사" | "to V" | "V-ing" | "접SV";

export interface NounAnswer {
  pos: "명사";
  form: NounForm;
  element?: SentenceElement;
  role: string;
  koreanLabel: string;
}

// ---- 형용사 ----
export type AdjForm = "형용사" | "to V" | "V-ing/PP" | "접SV" | "전N";

export interface AdjAnswer {
  pos: "형용사";
  form: AdjForm;
  element?: "C" | "M";
  role: string;
  koreanLabel: string;
}

// ---- 부사 ----
export type AdvForm = "부사" | "to V" | "ing/pp" | "접SV" | "전N";
export type AdvSubtype = "일반부사" | "접속부사";

export interface AdvAnswer {
  pos: "부사";
  form: AdvForm;
  /** 부사 form일 때만 사용 — 일반부사/접속부사 구분 */
  subtype?: AdvSubtype;
  role: string;
  koreanLabel: string;
}

// ---- 기타 ----
export type EtcKind =
  | "비교"
  | "의문문"
  | "감탄문"
  | "명령문"
  | "접속"
  | "가정법"
  | "도치/생략/동격"
  | "삽입"
  | "부연";

export interface EtcAnswer {
  pos: "기타";
  kind: EtcKind;
  role: string;
  koreanLabel: string;
}

// ---- 동사 ----
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

export type WordAnswer =
  | NounAnswer
  | VerbAnswer
  | AdjAnswer
  | AdvAnswer
  | EtcAnswer;

// 하위호환용
export type ElementAnswer = SentenceElement | "V";
export type POSAnswer = "Noun" | "Adjective" | "Adverb" | "Verb" | "Etc";
export type FormAnswer =
  | "N"
  | "to v"
  | "v-ing"
  | "[SV] clause"
  | "Preposition+N"
  | "v-ed";

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

import type { LevelCode } from "@/lib/levels";

export interface Sentence {
  id: string;
  no: number;
  /** 학습 레벨 (초3=L01 ~ 고3=L10). 코드 표기에 사용. */
  level: LevelCode;
  english: string;
  korean: string;
  structureTags: string[];
  tokens: SentenceToken[];
}

// 내부 목적어 역할 — 하단 S/V/O/C/M 배지 표시 안 함
export const INTERNAL_OBJECT_ROLES = new Set([
  "전치사의o",
  "to V의o",
  "V-ing의o",
]);

// ============================================================
// 데모 데이터 — Sportscaster passage (5문장)
// ============================================================
// 헬퍼: analyzable 토큰 생성
const A = (
  id: string,
  text: string,
  answer: WordAnswer,
): SentenceToken => ({ type: "analyzable", id, text, answer });
const W = (text: string): SentenceToken => ({
  type: "static",
  text,
  role: "word",
});
const P = (text: string): SentenceToken => ({
  type: "static",
  text,
  role: "punct",
});

export const SENTENCES: Sentence[] = [
  // ----------------------------------------------------------
  // S1: Radio provided the driving force to solidify the era
  // of patronage; however, the invention that soon followed
  // remains to this day the most significant communication
  // medium that has influenced and aided the development of
  // sports.
  // ----------------------------------------------------------
  {
    id: "s1",
    no: 1,
    level: "L08",
    english:
      "Radio provided the driving force to solidify the era of patronage; however, the invention that soon followed remains to this day the most significant communication medium that has influenced and aided the development of sports.",
    korean:
      "라디오는 후원의 시대를 공고히 할 추진력을 제공했다. 그러나 곧 뒤이은 그 발명품(TV)은 오늘날까지 스포츠 발전에 영향을 주고 도움을 준 가장 중요한 소통 매체로 남아 있다.",
    structureTags: ["COMPOUND", "RELATIVE CLAUSE", "S+V+O"],
    tokens: [
      A("s1-1", "Radio", {
        pos: "명사",
        form: "명사",
        element: "S",
        role: "주어",
        koreanLabel: "주어 · 명사",
      }),
      A("s1-2", "provided", {
        pos: "동사",
        number: "단수",
        tense: "과거",
        koreanLabel: "과거동사",
      }),
      W("the"),
      A("s1-3", "driving force", {
        pos: "명사",
        form: "명사",
        element: "O",
        role: "목적어(타동)",
        koreanLabel: "목적어 · 명사구",
      }),
      A("s1-4", "to solidify", {
        pos: "형용사",
        form: "to V",
        element: "M",
        role: "to 명사뒤수식",
        koreanLabel: "to부정사 · 형용사적 명사뒤수식",
      }),
      W("the"),
      A("s1-4b", "era", {
        pos: "명사",
        form: "명사",
        element: "O",
        role: "to V의o",
        koreanLabel: "to V의 목적어 · 명사",
      }),
      W("of"),
      A("s1-4c", "patronage", {
        pos: "명사",
        form: "명사",
        element: "O",
        role: "전치사의o",
        koreanLabel: "전치사의 목적어 · 명사",
      }),
      P(";"),
      A("s1-5", "however", {
        pos: "부사",
        form: "부사",
        subtype: "접속부사",
        role: "부사",
        koreanLabel: "접속부사",
      }),
      P(","),
      W("the"),
      A("s1-6", "invention", {
        pos: "명사",
        form: "명사",
        element: "S",
        role: "주어",
        koreanLabel: "주어 · 명사",
      }),
      A("s1-7", "that", {
        pos: "형용사",
        form: "접SV",
        element: "M",
        role: "관대(주격/목적격/소유격/전+RP/계속적/N of which/N of whom)",
        koreanLabel: "관계대명사 주격",
      }),
      A("s1-8", "soon", {
        pos: "부사",
        form: "부사",
        subtype: "일반부사",
        role: "부사",
        koreanLabel: "부사",
      }),
      A("s1-9", "followed", {
        pos: "동사",
        number: "단수",
        tense: "과거",
        koreanLabel: "과거동사",
      }),
      A("s1-10", "remains", {
        pos: "동사",
        number: "단수",
        tense: "현재",
        koreanLabel: "현재동사 · 단수",
      }),
      A("s1-11", "to this day", {
        pos: "부사",
        form: "전N",
        role: "부사 전치사구",
        koreanLabel: "부사 전치사구",
      }),
      W("the most significant communication"),
      A("s1-12", "medium", {
        pos: "명사",
        form: "명사",
        element: "C",
        role: "주격보어",
        koreanLabel: "주격보어 · 명사",
      }),
      A("s1-13", "that", {
        pos: "형용사",
        form: "접SV",
        element: "M",
        role: "관대(주격/목적격/소유격/전+RP/계속적/N of which/N of whom)",
        koreanLabel: "관계대명사 주격",
      }),
      A("s1-14", "has influenced and aided", {
        pos: "동사",
        number: "단수",
        tense: "현재",
        aspect: ["완료"],
        koreanLabel: "현재완료 · 등위연결",
      }),
      W("the"),
      A("s1-15", "development", {
        pos: "명사",
        form: "명사",
        element: "O",
        role: "목적어(타동)",
        koreanLabel: "목적어 · 명사",
      }),
      A("s1-16", "of sports", {
        pos: "형용사",
        form: "전N",
        element: "M",
        role: "형용사 전치사구",
        koreanLabel: "형용사 전치사구",
      }),
      P("."),
    ],
  },

  // ----------------------------------------------------------
  // S2: Who knew that sportscaster Bill Stern questioned and
  // introduced in 1939 would enhance the growth and
  // development of sports marketing practices for decades?
  // ----------------------------------------------------------
  {
    id: "s2",
    no: 2,
    level: "L10",
    english:
      "Who knew that sportscaster Bill Stern questioned and introduced in 1939 would enhance the growth and development of sports marketing practices for decades?",
    korean:
      "스포츠 캐스터 빌 스턴이 1939년에 질문하고 소개한 것이 수십 년 동안 스포츠 마케팅 관행의 성장과 발전을 향상시킬 줄 누가 알았겠는가?",
    structureTags: ["INTERROGATIVE", "RELATIVE CLAUSE", "S+V+O"],
    tokens: [
      A("s2-1", "Who", {
        pos: "기타",
        kind: "의문문",
        role: "의문대명사",
        koreanLabel: "의문대명사 · 주어",
      }),
      A("s2-2", "knew", {
        pos: "동사",
        number: "단수",
        tense: "과거",
        koreanLabel: "과거동사",
      }),
      A("s2-3", "that", {
        pos: "명사",
        form: "접SV",
        role: "명사절that",
        koreanLabel: "명사절 that · 목적어",
      }),
      W("sportscaster Bill Stern"),
      A("s2-4", "questioned and introduced", {
        pos: "동사",
        number: "단수",
        tense: "과거",
        koreanLabel: "과거동사 · 등위",
      }),
      A("s2-5", "in 1939", {
        pos: "부사",
        form: "전N",
        role: "부사 전치사구",
        koreanLabel: "부사 전치사구 · 시간",
      }),
      A("s2-6", "would enhance", {
        pos: "동사",
        number: "단수",
        tense: "미래",
        koreanLabel: "미래동사 · 과거시점에서",
      }),
      W("the"),
      A("s2-7", "growth and development", {
        pos: "명사",
        form: "명사",
        element: "O",
        role: "목적어(타동)",
        koreanLabel: "목적어 · 명사구",
      }),
      A("s2-8", "of sports marketing practices", {
        pos: "형용사",
        form: "전N",
        element: "M",
        role: "형용사 전치사구",
        koreanLabel: "형용사 전치사구",
      }),
      A("s2-9", "for decades", {
        pos: "부사",
        form: "전N",
        role: "부사 전치사구",
        koreanLabel: "부사 전치사구 · 기간",
      }),
      P("?"),
    ],
  },

  // ----------------------------------------------------------
  // S3: The display platform, the television, though airing
  // two average baseball teams battling for fourth place,
  // providing an incredibly formidable and profitable union
  // between sports and the American public.
  // ----------------------------------------------------------
  {
    id: "s3",
    no: 3,
    level: "L10",
    english:
      "The display platform, the television, though airing two average baseball teams battling for fourth place, providing an incredibly formidable and profitable union between sports and the American public.",
    korean:
      "그 전시 플랫폼인 텔레비전은 비록 4위 자리를 놓고 다투는 평범한 두 야구팀을 방송했음에도 스포츠와 미국 대중 사이에 엄청나게 강력하고 수익성 있는 결합을 제공했다.",
    structureTags: ["APPOSITION", "PARTICIPLE PHRASE"],
    tokens: [
      W("The display platform"),
      P(","),
      W("the"),
      A("s3-1", "television", {
        pos: "명사",
        form: "명사",
        element: "S",
        role: "주어",
        koreanLabel: "주어 · 동격 명사",
      }),
      P(","),
      A("s3-2", "though airing", {
        pos: "부사",
        form: "ing/pp",
        role: "분사구문",
        koreanLabel: "분사구문 · 양보",
      }),
      W("two average baseball"),
      A("s3-3", "teams", {
        pos: "명사",
        form: "명사",
        element: "O",
        role: "to V의o",
        koreanLabel: "분사의 목적어",
      }),
      A("s3-4", "battling", {
        pos: "형용사",
        form: "V-ing/PP",
        element: "M",
        role: "ing명사뒤수식",
        koreanLabel: "현재분사 · 명사뒤수식",
      }),
      A("s3-5", "for fourth place", {
        pos: "부사",
        form: "전N",
        role: "부사 전치사구",
        koreanLabel: "부사 전치사구",
      }),
      P(","),
      A("s3-6", "providing", {
        pos: "부사",
        form: "ing/pp",
        role: "분사구문",
        koreanLabel: "분사구문 · 결과",
      }),
      W("an"),
      A("s3-7", "incredibly", {
        pos: "부사",
        form: "부사",
        subtype: "일반부사",
        role: "부사",
        koreanLabel: "부사 · 형용사 수식",
      }),
      A("s3-8", "formidable and profitable", {
        pos: "형용사",
        form: "형용사",
        element: "M",
        role: "a명사수식",
        koreanLabel: "형용사 · 명사수식",
      }),
      A("s3-9", "union", {
        pos: "명사",
        form: "명사",
        element: "O",
        role: "V-ing의o",
        koreanLabel: "분사구문의 목적어",
      }),
      A("s3-10", "between sports and the American public", {
        pos: "형용사",
        form: "전N",
        element: "M",
        role: "형용사 전치사구",
        koreanLabel: "형용사 전치사구",
      }),
      P("."),
    ],
  },

  // ----------------------------------------------------------
  // S4: The television provided a means for sports
  // organizations to expand their market presence and a
  // unique opportunity for marketers to engage their publics.
  // ----------------------------------------------------------
  {
    id: "s4",
    no: 4,
    level: "L10",
    english:
      "The television provided a means for sports organizations to expand their market presence and a unique opportunity for marketers to engage their publics.",
    korean:
      "텔레비전은 스포츠 단체가 시장 영향력을 확장할 수단과 마케터가 대중과 소통할 독특한 기회를 제공했다.",
    structureTags: ["S+V+O", "INFINITIVE", "PARALLEL"],
    tokens: [
      W("The"),
      A("s4-1", "television", {
        pos: "명사",
        form: "명사",
        element: "S",
        role: "주어",
        koreanLabel: "주어 · 명사",
      }),
      A("s4-2", "provided", {
        pos: "동사",
        number: "단수",
        tense: "과거",
        koreanLabel: "과거동사",
      }),
      W("a"),
      A("s4-3", "means", {
        pos: "명사",
        form: "명사",
        element: "O",
        role: "목적어(타동)",
        koreanLabel: "목적어 · 명사",
      }),
      A("s4-4", "for sports organizations", {
        pos: "부사",
        form: "전N",
        role: "부사 전치사구",
        koreanLabel: "to부정사 의미상 주어",
      }),
      A("s4-5", "to expand", {
        pos: "형용사",
        form: "to V",
        element: "M",
        role: "to 명사뒤수식",
        koreanLabel: "to부정사 · 형용사적 수식",
      }),
      W("their market"),
      A("s4-6", "presence", {
        pos: "명사",
        form: "명사",
        element: "O",
        role: "to V의o",
        koreanLabel: "to부정사의 목적어",
      }),
      A("s4-7", "and", {
        pos: "기타",
        kind: "접속",
        role: "병렬",
        koreanLabel: "등위접속사",
      }),
      W("a unique"),
      A("s4-8", "opportunity", {
        pos: "명사",
        form: "명사",
        element: "O",
        role: "목적어(타동)",
        koreanLabel: "목적어 · 명사",
      }),
      A("s4-9", "for marketers", {
        pos: "부사",
        form: "전N",
        role: "부사 전치사구",
        koreanLabel: "to부정사 의미상 주어",
      }),
      A("s4-10", "to engage", {
        pos: "형용사",
        form: "to V",
        element: "M",
        role: "to 명사뒤수식",
        koreanLabel: "to부정사 · 형용사적 수식",
      }),
      W("their"),
      A("s4-11", "publics", {
        pos: "명사",
        form: "명사",
        element: "O",
        role: "to V의o",
        koreanLabel: "to부정사의 목적어",
      }),
      P("."),
    ],
  },

  // ----------------------------------------------------------
  // S5: The notion of a "picture being worth a thousand words"
  // became a reality with the invention and its intervention
  // and presentation of sports.
  // ----------------------------------------------------------
  {
    id: "s5",
    no: 5,
    level: "L10",
    english:
      'The notion of a "picture being worth a thousand words" became a reality with the invention and its intervention and presentation of sports.',
    korean:
      "\"한 장의 그림이 천 마디 말의 가치가 있다\"는 개념은 그 발명품과 그것의 스포츠 개입 및 표현으로 현실이 되었다.",
    structureTags: ["S+V+C", "PREPOSITIONAL"],
    tokens: [
      W("The"),
      A("s5-1", "notion", {
        pos: "명사",
        form: "명사",
        element: "S",
        role: "주어",
        koreanLabel: "주어 · 명사",
      }),
      A("s5-2", "of a picture being worth a thousand words", {
        pos: "형용사",
        form: "전N",
        element: "M",
        role: "형용사 전치사구",
        koreanLabel: "형용사 전치사구 · 동격적",
      }),
      A("s5-3", "became", {
        pos: "동사",
        number: "단수",
        tense: "과거",
        koreanLabel: "과거동사 · 2형식",
      }),
      W("a"),
      A("s5-4", "reality", {
        pos: "명사",
        form: "명사",
        element: "C",
        role: "주격보어",
        koreanLabel: "주격보어 · 명사",
      }),
      A("s5-5", "with the invention", {
        pos: "부사",
        form: "전N",
        role: "부사 전치사구",
        koreanLabel: "부사 전치사구 · 수단",
      }),
      A("s5-6", "and", {
        pos: "기타",
        kind: "접속",
        role: "병렬",
        koreanLabel: "등위접속사",
      }),
      W("its"),
      A("s5-7", "intervention and presentation", {
        pos: "명사",
        form: "명사",
        element: "O",
        role: "전치사의o",
        koreanLabel: "전치사의 목적어 · 병렬",
      }),
      A("s5-8", "of sports", {
        pos: "형용사",
        form: "전N",
        element: "M",
        role: "형용사 전치사구",
        koreanLabel: "형용사 전치사구",
      }),
      P("."),
    ],
  },
];

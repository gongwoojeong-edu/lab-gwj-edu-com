// ============================================================
// sentenceSource — DB(textbook_passages) → 런타임 Sentence 어댑터
// 기존 정적 SENTENCES 배열을 DB 데이터로 보강(merge)한다.
// 호출처(Index, SentenceLearn, StudentHome, nextSentence)는 여전히
// `SENTENCES`를 그대로 사용하지만, 부팅 시 DB 행이 자동 머지된다.
// ============================================================
import { SENTENCES, type Sentence, type SentenceToken, type WordAnswer } from "@/data/sentences";
import type { LevelCode } from "@/lib/levels";
import { supabase } from "@/integrations/supabase/client";

/**
 * 영문 본문을 클릭 가능한 analyzable 토큰으로 자동 분리.
 * - 단어 → analyzable (빈 answer)
 * - 구두점 → static punct
 * - 공백 → static word(공백)
 * 정적 SENTENCES의 W()/P() 헬퍼와 호환 구조.
 */
export const buildTokensFromEnglish = (english: string): SentenceToken[] => {
  if (!english) return [];
  const out: SentenceToken[] = [];
  // 단어(영문/숫자/어퍼스트로피/하이픈) | 구두점 | 공백
  const re = /([A-Za-z0-9][A-Za-z0-9'’\-]*)|([.,!?;:"“”()\[\]{}…—–])|(\s+)/g;
  let m: RegExpExecArray | null;
  let wIdx = 0;
  const emptyAnswer = (): WordAnswer => ({
    pos: "기타",
    kind: "부연",
    role: "",
    koreanLabel: "",
  });
  while ((m = re.exec(english)) !== null) {
    const [, word, punct, space] = m;
    if (word) {
      out.push({
        type: "analyzable",
        id: `w${wIdx++}`,
        text: word,
        answer: emptyAnswer(),
      });
    } else if (punct) {
      out.push({ type: "static", text: punct, role: "punct" });
    } else if (space) {
      out.push({ type: "static", text: " ", role: "word" });
    }
  }
  return out;
};

interface PassageRow {
  id: string;
  textbook_id: string;
  passage_no: number;
  code: string;
  english: string;
  korean: string | null;
  tokens: SentenceToken[] | null;
  analysis_status: string;
}

interface TextbookRow {
  id: string;
  level: string;
  unit_no: number;
}

let hydrated = false;
let hydrating: Promise<void> | null = null;

/** DB → Sentence 변환. tokens 가 비어있으면 영문에서 자동 토큰화. */
const rowToSentence = (row: PassageRow, level: LevelCode): Sentence => {
  const dbTokens = row.tokens ?? [];
  const tokens =
    dbTokens.length > 0 ? dbTokens : buildTokensFromEnglish(row.english);
  return {
    id: row.code,
    no: row.passage_no,
    level,
    english: row.english,
    korean: row.korean ?? "",
    structureTags: [],
    tokens,
  };
};

/**
 * DB의 모든 passage를 읽어 정적 SENTENCES와 머지한다.
 * - 같은 code 가 있으면 DB 데이터로 교체
 * - 없으면 추가
 * - tokens가 비어있는 DB 행은 정적 데이터를 보존
 */
export const hydrateSentencesFromDb = async (force = false): Promise<void> => {
  if (force) {
    hydrated = false;
    hydrating = null;
  }
  if (hydrated) return;
  if (hydrating) return hydrating;
  hydrating = (async () => {
    try {
      const [{ data: tbs }, { data: passages }] = await Promise.all([
        supabase.from("textbooks").select("id, level, unit_no"),
        supabase
          .from("textbook_passages")
          .select("id, textbook_id, passage_no, code, english, korean, tokens, analysis_status"),
      ]);
      if (!tbs || !passages) return;
      const tbMap = new Map<string, TextbookRow>(
        (tbs as TextbookRow[]).map((t) => [t.id, t]),
      );
      for (const row of passages as PassageRow[]) {
        const tb = tbMap.get(row.textbook_id);
        if (!tb) continue;
        const level = tb.level as LevelCode;
        const idx = SENTENCES.findIndex((s) => s.id === row.code);
        const next = rowToSentence(row, level);
        // tokens 가 비어있고 정적 데이터가 있으면 정적 보존
        if ((!next.tokens || next.tokens.length === 0) && idx >= 0) {
          continue;
        }
        if (idx >= 0) {
          SENTENCES[idx] = { ...SENTENCES[idx], ...next };
        } else {
          SENTENCES.push(next);
        }
      }
      hydrated = true;
    } catch (e) {
      console.error("[sentenceSource] hydrate failed", e);
    }
  })();
  return hydrating;
};

/** DB row 1건 → Sentence (편집창 등에서 직접 사용) */
export const loadSentenceByCode = async (
  code: string,
): Promise<Sentence | null> => {
  const { data, error } = await supabase
    .from("textbook_passages")
    .select("id, textbook_id, passage_no, code, english, korean, tokens, analysis_status, textbook:textbooks(level)")
    .eq("code", code)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as unknown as PassageRow & { textbook: { level: string } };
  return rowToSentence(row, (row.textbook?.level ?? "L01") as LevelCode);
};

/** 편집창에서 분석 결과 저장 */
export const saveSentenceTokens = async (
  code: string,
  tokens: SentenceToken[],
  markReady = false,
): Promise<void> => {
  const patch: { tokens: unknown; analysis_status?: string } = {
    tokens: tokens as unknown,
  };
  if (markReady) patch.analysis_status = "ready";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from("textbook_passages") as any)
    .update(patch)
    .eq("code", code);
  if (error) throw error;
  // 메모리 SENTENCES도 갱신
  const idx = SENTENCES.findIndex((s) => s.id === code);
  if (idx >= 0) {
    SENTENCES[idx] = { ...SENTENCES[idx], tokens };
  }
};

/** 책장 편집기: 학생 공개/비공개 토글 — tokens 의존성 없이 status만 갱신 */
export const setPassageReady = async (
  code: string,
  ready: boolean,
): Promise<void> => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from("textbook_passages") as any)
    .update({ analysis_status: ready ? "ready" : "draft" })
    .eq("code", code);
  if (error) throw error;
};

export const isHydrated = () => hydrated;

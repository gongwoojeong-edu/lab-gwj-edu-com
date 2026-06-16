// ============================================================
// sentenceSource — DB(textbook_passages) → 런타임 Sentence 어댑터
// 기존 정적 SENTENCES 배열을 DB 데이터로 보강(merge)한다.
// 호출처(Index, SentenceLearn, StudentHome, nextSentence)는 여전히
// `SENTENCES`를 그대로 사용하지만, 부팅 시 DB 행이 자동 머지된다.
// ============================================================
import { SENTENCES, type Sentence, type SentenceToken, type WordAnswer } from "@/data/sentences";
import type { LevelCode } from "@/lib/levels";
import { supabase } from "@/integrations/supabase/client";

export const stripKoreanFromEnglishSource = (value: string): string =>
  value
    .split(/\r?\n/)
    .map((line) => line.replace(/[가-힣ㄱ-ㅎㅏ-ㅣ].*$/g, "").trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

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

const textFromTokens = (tokens: SentenceToken[]): string => tokens.map((t) => t.text).join("");

const normalizeForCompare = (s: string): string =>
  s
    .replace(/[\u2018\u2019']/g, "'")
    .replace(/[\u201C\u201D"]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/** DB tokens가 현재 english 본문과 일치하는지 (옛 분석 캐시 누수 방지) */
export const tokensMatchEnglish = (tokens: SentenceToken[], english: string): boolean => {
  if (tokens.length === 0) return false;
  return (
    normalizeForCompare(textFromTokens(tokens)) ===
    normalizeForCompare(stripKoreanFromEnglishSource(english))
  );
};

const resolveTokens = (dbTokens: SentenceToken[], english: string): SentenceToken[] => {
  if (dbTokens.length > 0 && tokensMatchEnglish(dbTokens, english)) return dbTokens;
  return buildTokensFromEnglish(english);
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
  const english = stripKoreanFromEnglishSource(row.english);
  const tokens = resolveTokens(dbTokens, english);
  return {
    id: row.code,
    no: row.passage_no,
    level,
    english,
    korean: row.korean ?? "",
    structureTags: [],
    tokens,
  };
};

/**
 * DB의 passage를 읽어 정적 SENTENCES와 머지한다.
 *
 * 성능 최적화 (2026-04):
 *  - `levels` 가 주어지면 해당 레벨의 textbook_passages 만 가져온다.
 *  - `tokens` 컬럼(jsonb, 큼)은 기본적으로 select에서 제외.
 *    실제 분석 화면에서는 `loadSentenceByCode` 로 1건만 fetch.
 *  - 같은 code 가 있으면 DB 데이터로 교체, 없으면 추가.
 */
const hydratedKeys = new Set<string>();

/** sessionStorage 캐시 키 prefix. 스키마 바뀌면 v숫자 올려서 무효화. */
const SS_PREFIX = "lab.sentenceMeta.v2.";

/** sessionStorage TTL — 30분. 너무 오래 들고 있으면 신선도 ↓ */
const SS_TTL_MS = 30 * 60 * 1000;

interface SsCacheRow {
  code: string;
  level: LevelCode;
  no: number;
  english: string;
  korean: string | null;
}

const readSessionCache = (key: string): SsCacheRow[] | null => {
  try {
    const raw = sessionStorage.getItem(SS_PREFIX + key);
    if (!raw) return null;
    const obj = JSON.parse(raw) as { ts: number; rows: SsCacheRow[] };
    if (!obj?.rows || Date.now() - obj.ts > SS_TTL_MS) return null;
    return obj.rows;
  } catch {
    return null;
  }
};

const writeSessionCache = (key: string, rows: SsCacheRow[]) => {
  try {
    sessionStorage.setItem(
      SS_PREFIX + key,
      JSON.stringify({ ts: Date.now(), rows }),
    );
  } catch {
    // QuotaExceeded 등은 조용히 무시
  }
};

/** 메모리 + sessionStorage 캐시 무효화 (편집/임포트 후 호출) */
export const invalidateSentenceCache = () => {
  hydratedKeys.clear();
  hydrated = false;
  hydrating = null;
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith(SS_PREFIX)) toRemove.push(k);
    }
    toRemove.forEach((k) => sessionStorage.removeItem(k));
  } catch {
    // ignore
  }
};

const applyCachedRowsToSentences = (rows: SsCacheRow[]) => {
  for (const r of rows) {
    const english = stripKoreanFromEnglishSource(r.english);
    const idx = SENTENCES.findIndex((s) => s.id === r.code);
    if (idx >= 0) {
      const prev = SENTENCES[idx];
      const tokens =
        prev.tokens?.length && tokensMatchEnglish(prev.tokens, english)
          ? prev.tokens
          : buildTokensFromEnglish(english);
      SENTENCES[idx] = {
        ...prev,
        no: r.no,
        level: r.level,
        english,
        korean: r.korean ?? prev.korean,
        tokens,
      };
    } else {
      SENTENCES.push({
        id: r.code,
        no: r.no,
        level: r.level,
        english,
        korean: r.korean ?? "",
        structureTags: [],
        tokens: buildTokensFromEnglish(english),
      });
    }
  }
};

export const hydrateSentencesFromDb = async (
  force = false,
  options?: { levels?: LevelCode[]; includeTokens?: boolean },
): Promise<void> => {
  const levels = options?.levels;
  const includeTokens = options?.includeTokens ?? false;
  const cacheKey = `${(levels ?? ["__all__"]).slice().sort().join(",")}|${includeTokens ? "T" : "N"}`;

  if (force) invalidateSentenceCache();
  if (hydratedKeys.has(cacheKey)) return;
  if (hydrating) return hydrating;

  // sessionStorage 캐시 빠른 경로 (tokens 미포함 모드만)
  if (!includeTokens) {
    const cached = readSessionCache(cacheKey);
    if (cached) {
      applyCachedRowsToSentences(cached);
      hydratedKeys.add(cacheKey);
      hydrated = true;
      return;
    }
  }

  hydrating = (async () => {
    try {
      let tbQuery = supabase.from("textbooks").select("id, level, unit_no");
      if (levels && levels.length > 0) {
        tbQuery = tbQuery.in("level", levels);
      }
      const { data: tbs } = await tbQuery;
      if (!tbs || tbs.length === 0) {
        hydratedKeys.add(cacheKey);
        return;
      }
      const tbIds = (tbs as TextbookRow[]).map((t) => t.id);

      const cols = includeTokens
        ? "id, textbook_id, passage_no, code, english, korean, tokens, analysis_status"
        : "id, textbook_id, passage_no, code, english, korean, analysis_status";
      const { data: passages } = await supabase
        .from("textbook_passages")
        .select(cols)
        .in("textbook_id", tbIds);
      if (!passages) return;

      const tbMap = new Map<string, TextbookRow>(
        (tbs as TextbookRow[]).map((t) => [t.id, t]),
      );
      const ssRows: SsCacheRow[] = [];
      for (const raw of passages as unknown as PassageRow[]) {
        const tb = tbMap.get(raw.textbook_id);
        if (!tb) continue;
        const level = tb.level as LevelCode;
        const idx = SENTENCES.findIndex((s) => s.id === raw.code);
        const row: PassageRow = { ...raw, tokens: raw.tokens ?? null };
        const dbTokens = row.tokens ?? [];
        if (!includeTokens) {
          ssRows.push({
            code: row.code,
            level,
            no: row.passage_no,
            english: stripKoreanFromEnglishSource(row.english),
            korean: row.korean ?? null,
          });
        }
        // tokens 미포함 select — english만 갱신, tokens는 본문과 불일치 시 재생성
        if (!includeTokens && idx >= 0) {
          const prev = SENTENCES[idx];
          const english = stripKoreanFromEnglishSource(row.english);
          const tokens =
            prev.tokens?.length && tokensMatchEnglish(prev.tokens, english)
              ? prev.tokens
              : buildTokensFromEnglish(english);
          SENTENCES[idx] = {
            ...prev,
            no: row.passage_no,
            level,
            english,
            korean: row.korean ?? prev.korean,
            tokens,
          };
          continue;
        }
        if (dbTokens.length === 0 && idx >= 0) continue;
        const next = rowToSentence(row, level);
        if (idx >= 0) {
          SENTENCES[idx] = { ...SENTENCES[idx], ...next };
        } else {
          SENTENCES.push(next);
        }
      }
      if (!includeTokens && ssRows.length > 0) {
        writeSessionCache(cacheKey, ssRows);
      }
      hydratedKeys.add(cacheKey);
      hydrated = true;
    } catch (e) {
      console.error("[sentenceSource] hydrate failed", e);
    } finally {
      hydrating = null;
    }
  })();
  return hydrating;
};

/** Passage 객체 → SENTENCES 전역 캐시에 완전 반영 (tokens 포함). 편집기에서 올바른 지문 보장용. */
export const upsertSentenceFromPassage = (
  passage: {
    code: string;
    passage_no: number;
    english: string;
    korean: string | null;
    tokens: SentenceToken[] | null;
  },
  level: LevelCode,
): number => {
  const english = stripKoreanFromEnglishSource(passage.english);
  const dbTokens = passage.tokens ?? [];
  const tokens = resolveTokens(dbTokens, english);
  const next: Sentence = {
    id: passage.code,
    no: passage.passage_no,
    level,
    english,
    korean: passage.korean ?? "",
    structureTags: [],
    tokens,
  };
  const idx = SENTENCES.findIndex((s) => s.id === passage.code);
  if (idx >= 0) {
    SENTENCES[idx] = next;
    return idx;
  }
  SENTENCES.push(next);
  return SENTENCES.length - 1;
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
  const level = (row.textbook?.level ?? "L01") as LevelCode;
  const sentence = rowToSentence(row, level);
  upsertSentenceFromPassage(
    {
      code: row.code,
      passage_no: row.passage_no,
      english: row.english,
      korean: row.korean,
      tokens: row.tokens,
    },
    level,
  );
  return sentence;
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

// ============================================================
// speech.ts — Web Speech API helpers (recognition + matching)
// ============================================================

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

export const getSpeechRecognition = (): SpeechRecognitionCtor | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

export const speechSupported = (): boolean => getSpeechRecognition() !== null;

export const normalizeEn = (s: string): string =>
  s.toLowerCase().replace(/[^a-z]/g, "");

export const normalizeKo = (s: string): string =>
  s.trim().replace(/\s+/g, "").replace(/[.,~!?·…/()\-]/g, "").toLowerCase();

export const levenshtein = (a: string, b: string): number => {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
};

/** 유사도 0~1 (1 = 완전 일치) */
const similarity = (a: string, b: string): number => {
  if (!a && !b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
};

/**
 * 영어 발음 매칭 — 어린 학습자에게 관대하게.
 * 완전 일치/포함은 즉시 통과. 길이별 허용 편집 거리도 +1씩 늘림.
 * 추가로 유사도 ≥ 0.6 이면 통과 (예: "patronage" vs "patronich" 같은 근접 발음 인정).
 */
export const englishMatch = (heard: string, expected: string): boolean => {
  const h = normalizeEn(heard);
  const e = normalizeEn(expected);
  if (!h || !e) return false;
  if (h === e) return true;
  // 한쪽이 다른쪽을 포함하면 (예: 단어 + 군더더기) 통과
  if (e.length >= 4 && (h.includes(e) || e.includes(h))) return true;
  // 길이별 편집 거리 허용 — 이전보다 1단계씩 관대
  const tol = e.length >= 8 ? 3 : e.length >= 5 ? 2 : 1;
  if (levenshtein(h, e) <= tol) return true;
  // 마지막으로 유사도 비율로 판정
  return similarity(h, e) >= 0.6;
};

/**
 * 한국어 의미 매칭 — 다양한 동의어/포함관계를 관대하게 인정.
 * 후보 의미 중 어느 하나에라도 가깝게 일치하면 통과.
 * 유사도 ≥ 0.55 또는 한 글자 차이까지 허용.
 */
export const koreanMeaningMatch = (heard: string, expected: string): boolean => {
  const h = normalizeKo(heard);
  if (!h) return false;
  const candidates = expected.split(/[,/;]/).map(normalizeKo).filter(Boolean);
  return candidates.some((c) => {
    if (!c) return false;
    if (c === h) return true;
    if (c.includes(h) || h.includes(c)) return true;
    // 짧은 한국어 단어는 1글자, 긴 단어는 2글자까지 편집 허용
    const tol = c.length >= 4 ? 2 : 1;
    if (levenshtein(h, c) <= tol) return true;
    return similarity(h, c) >= 0.55;
  });
};

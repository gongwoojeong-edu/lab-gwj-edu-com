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

export const englishMatch = (heard: string, expected: string): boolean => {
  const h = normalizeEn(heard);
  const e = normalizeEn(expected);
  if (!h || !e) return false;
  if (h === e) return true;
  // tolerate ≤ 1 edit for short words; 2 for longer
  const tol = e.length >= 7 ? 2 : 1;
  return levenshtein(h, e) <= tol;
};

export const koreanMeaningMatch = (heard: string, expected: string): boolean => {
  const h = normalizeKo(heard);
  if (!h) return false;
  const candidates = expected.split(/[,/;]/).map(normalizeKo).filter(Boolean);
  return candidates.some(
    (c) => c === h || c.includes(h) || h.includes(c) || levenshtein(h, c) <= 1,
  );
};

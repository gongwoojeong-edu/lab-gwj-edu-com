/**
 * 매우 가벼운 영어 음절 분리기.
 * Web Speech API로 음절별 발음을 들려주기 위한 용도이므로
 * 언어학적 정확성보다 학습자가 발음 단위를 직관적으로 인지할 수 있는 청크 분할을 목표로 한다.
 */

const VOWELS = new Set("aeiouyAEIOUY".split(""));
const isVowel = (ch: string) => VOWELS.has(ch);

export const splitIntoSyllables = (rawWord: string): string[] => {
  const word = rawWord.trim();
  if (!word) return [];
  if (/[-/]/.test(word)) {
    return word
      .split(/[-/]/)
      .filter(Boolean)
      .flatMap((part) => splitIntoSyllables(part));
  }
  if (!/^[A-Za-z']+$/.test(word)) return [word];
  if (word.length <= 3) return [word];

  const vowelGroups: { start: number; end: number }[] = [];
  let i = 0;
  while (i < word.length) {
    if (isVowel(word[i])) {
      let j = i;
      while (j < word.length && isVowel(word[j])) j++;
      vowelGroups.push({ start: i, end: j - 1 });
      i = j;
    } else {
      i++;
    }
  }
  if (vowelGroups.length <= 1) return [word];

  const splits: number[] = [];
  for (let k = 0; k < vowelGroups.length - 1; k++) {
    const vEnd = vowelGroups[k].end;
    const vNextStart = vowelGroups[k + 1].start;
    const consonants = vNextStart - vEnd - 1;
    let cut: number;
    if (consonants === 0) {
      cut = vEnd + 1;
    } else if (consonants === 1) {
      cut = vEnd + 1;
    } else {
      cut = vEnd + 2;
    }
    if (cut > 0 && cut < word.length) splits.push(cut);
  }

  const merged: number[] = [];
  for (const s of splits) {
    const tailLen = word.length - s;
    if (tailLen <= 1 && word[word.length - 1].toLowerCase() === "e") continue;
    merged.push(s);
  }

  if (word.length > 4 && word.slice(-2).toLowerCase() === "le" && !isVowel(word[word.length - 3])) {
    const cut = word.length - 3;
    if (cut > 0 && !merged.includes(cut)) merged.push(cut);
    merged.sort((a, b) => a - b);
  }

  if (merged.length === 0) return [word];

  const chunks: string[] = [];
  let prev = 0;
  for (const s of merged) {
    chunks.push(word.slice(prev, s));
    prev = s;
  }
  chunks.push(word.slice(prev));
  return chunks.filter(Boolean);
};

/** Web Speech API로 한 청크 발음. onEnd 콜백을 통해 재생 종료 시점을 알 수 있다. */
export const speakChunk = (
  text: string,
  opts?: { rate?: number; lang?: string },
  onEnd?: () => void,
) => {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    onEnd?.();
    return;
  }
  const synth = window.speechSynthesis;
  try {
    synth.cancel();
  } catch {
    /* noop */
  }
  const u = new SpeechSynthesisUtterance(text);
  u.lang = opts?.lang ?? "en-US";
  u.rate = opts?.rate ?? 0.85;
  const voices = synth.getVoices();
  const en = voices.find((v) => v.lang?.toLowerCase().startsWith("en"));
  if (en) u.voice = en;
  if (onEnd) {
    u.onend = () => onEnd();
    u.onerror = () => onEnd();
  }
  synth.speak(u);
};

/** 단어 전체를 한 번에 자연스럽게 발음 */
export const speakWord = (word: string, onEnd?: () => void) =>
  speakChunk(word, { rate: 0.95 }, onEnd);

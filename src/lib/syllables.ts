/**
 * 매우 가벼운 영어 음절 분리기.
 * Web Speech API로 음절별 발음을 들려주기 위한 용도이므로
 * 언어학적 정확성보다 학습자가 발음 단위를 직관적으로 인지할 수 있는 청크 분할을 목표로 한다.
 *
 * 규칙(휴리스틱):
 *   - 모든 모음(a,e,i,o,u,y) 그룹을 음절의 핵으로 본다.
 *   - VC|CV 또는 VCC|CV 패턴에서 자음을 다음 음절로 넘긴다(maximal onset 비슷하게).
 *   - 'le' 결미(table → ta·ble), 묵음 e 처리, 단어가 너무 짧으면 분리하지 않는다.
 */

const VOWELS = new Set("aeiouyAEIOUY".split(""));
const isVowel = (ch: string) => VOWELS.has(ch);

export const splitIntoSyllables = (rawWord: string): string[] => {
  const word = rawWord.trim();
  if (!word) return [];
  // 하이픈/슬래시 포함 단어는 먼저 그 단위로 1차 분할 (예: well-known → well · known)
  if (/[-/]/.test(word)) {
    return word
      .split(/[-/]/)
      .filter(Boolean)
      .flatMap((part) => splitIntoSyllables(part));
  }
  // 비알파벳(숫자/구두점 등) 포함 시 그대로 1개 청크로
  if (!/^[A-Za-z']+$/.test(word)) return [word];
  if (word.length <= 3) return [word];

  // 1) vowel group 위치 수집
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

  // 2) 인접 vowel group 사이 자음 덩어리를 잘라 분할 지점 결정
  const splits: number[] = [];
  for (let k = 0; k < vowelGroups.length - 1; k++) {
    const vEnd = vowelGroups[k].end;
    const vNextStart = vowelGroups[k + 1].start;
    const consonants = vNextStart - vEnd - 1;
    let cut: number;
    if (consonants === 0) {
      // VV — 모음 사이에서 분할 (예: re·al)
      cut = vEnd + 1;
    } else if (consonants === 1) {
      // V·CV
      cut = vEnd + 1;
    } else {
      // VC·CV (자음 첫 글자는 앞 음절, 나머지는 뒤로)
      cut = vEnd + 2;
    }
    if (cut > 0 && cut < word.length) splits.push(cut);
  }

  // 3) 마지막 음절이 묵음 e 한 글자만 남지 않도록 합치기 (live → live, not li·ve)
  const merged: number[] = [];
  for (const s of splits) {
    const tailLen = word.length - s;
    if (tailLen <= 1 && word[word.length - 1].toLowerCase() === "e") continue;
    merged.push(s);
  }

  // 4) 'le' 결미 보정 — table, simple, little
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

/** Web Speech API로 한 청크 발음. 제공되면 영어 보이스 우선 선택. */
export const speakChunk = (text: string, opts?: { rate?: number; lang?: string }) => {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
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
  synth.speak(u);
};

/** 단어 전체를 한 번에 자연스럽게 발음 */
export const speakWord = (word: string) => speakChunk(word, { rate: 0.95 });

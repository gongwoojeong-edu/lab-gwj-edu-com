export interface VocabularyWord {
  word: string;
  meaning: string;
  pos: string;
  base?: string;
  form?: string;
}

export const UNIT_WORD_REPEAT_LIMIT = 3;
const labels = ["", "초저학년", "초고학년", "예비중", "중1", "중2", "중3", "예비고", "고1", "고2", "고3"];
export const vocabularyKey = (word: VocabularyWord): string =>
  (word.base?.trim() || word.word).toLowerCase().replace(/^to\s+/, "").replace(/[^a-z0-9' ]/g, " ").replace(/\s+/g, " ").trim();

// Conservative exclusion list: do not remove meaningful multiword expressions
// merely because one of their components is elementary vocabulary.
const elementary = new Set((
  "a an the i you he she it we they me him her us them my your his its our their " +
  "someone anyone everyone something anything everything this that these those " +
  "be am is are was were do does did have has had can will should would may must " +
  "go come get give take make eat drink sleep sit stand walk run jump play " +
  "see look hear say tell ask know think want like love live " +
  "school student teacher book pen pencil desk chair bed room house home town " +
  "boy girl man woman mother father family friend baby name hair hand eye " +
  "water food soup milk apple dog cat bear bird day week year time " +
  "happy sad tired fun funny good bad big small little long short old new " +
  "more most many much lot very so now then soon again today " +
  "one two three four five six seven eight nine ten people picture photo"
).split(/\s+/));

export const filterGradeVocabulary = (words: VocabularyWord[], level: string): VocabularyWord[] => {
  const levelNo = /^L\d{2}$/.test(level) ? Number(level.slice(1)) : 0;
  return words.filter((word) => levelNo < 5 || !elementary.has(vocabularyKey(word)));
};

export const gradeVocabularyGuide = (level: string): string => {
  const n = /^L\d{2}$/.test(level) ? Number(level.slice(1)) : 0;
  const label = labels[n] || "학년 미확인";
  const target = `TARGET LEARNERS: ${label} (${level || "레벨 미확인"}). `;
  const quantity = "개수 채우기 금지: 학습할 어휘가 없으면 words: []로 반환하고, 적으면 있는 만큼만 반환한다. ";
  if (n >= 8) return target + "초등·중학 기초 어휘를 제외한다. 해당 고등 학년 수준의 학술·추상 어휘, 파생어, 다의어의 낯선 문맥 뜻, 관용 표현을 최대 8개 선정한다. " + quantity;
  if (n >= 5) return target +
    "이미 익혔다고 보는 초등·중1 기본 어휘는 제외한다. eat, chair, get, picture, soon, more, happy 등은 시제·복수·비교급이 바뀌어도 제외한다. " +
    "고유명사(인명·장소명), 숫자도 제외한다. 해당 학년에서 새로 배울 가치가 있는 핵심 교과 어휘·파생어·숙어를 최대 8개 선정한다. " +
    "쉬운 단어를 묶기만 한 표현은 제외하되 실제 관용구와 다의어의 낯선 문맥 뜻은 허용한다. " + quantity;
  if (n >= 3) return target + "해당 학년의 교과 필수 어휘를 최대 9개 선정하되 초등 저학년 기본어(go, cat, big 등)는 제외한다. " + quantity;
  return target + "해당 학년에서 배울 기초·핵심 어휘를 최대 10개 선정한다. " + quantity;
};

/** Input is in passage order; inflections share the dictionary lemma's quota. */
export const limitUnitVocabulary = <T extends { sentence_id: string; words: VocabularyWord[] }>(rows: T[]): T[] => {
  const counts = new Map<string, number>();
  return rows.map((row) => {
    const seen = new Set<string>();
    const words = row.words.filter((word) => {
      const key = vocabularyKey(word);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      const count = counts.get(key) || 0;
      if (count >= UNIT_WORD_REPEAT_LIMIT) return false;
      counts.set(key, count + 1);
      return true;
    });
    return { ...row, words };
  });
};
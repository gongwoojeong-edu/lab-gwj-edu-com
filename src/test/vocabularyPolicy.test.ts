import { describe, expect, it } from "vitest";
import { filterGradeVocabulary, limitUnitVocabulary, vocabularyKey } from "../../supabase/functions/extract-sentence-words/vocabularyPolicy";

const word = (word: string, base = word) => ({ word, base, meaning: "뜻", pos: "명사" });
describe("학령별 추출", () => {
  it("중3에서는 초등 기초어의 변형도 제외하고 학습 어휘와 숙어는 유지한다", () => {
    expect(filterGradeVocabulary([word("ate", "eat"), word("chairs", "chair"), word("more"), word("shocking"), word("fell asleep", "fall asleep")], "L06").map(w => w.word))
      .toEqual(["shocking", "fell asleep"]);
  });
  it("중3 문장에 기초어밖에 없으면 추출 0개를 허용한다", () => {
    expect(filterGradeVocabulary([word("girl"), word("smallest", "small")], "L06")).toEqual([]);
  });
  it("초등 교재에는 기초어를 유지한다", () => {
    expect(filterGradeVocabulary([word("chair")], "L02")).toHaveLength(1);
  });
});
describe("유닛별 최대 3회 반복", () => {
  it("같은 원형의 단어는 앞의 3문장만 남는다", () => {
    const rows = ["post", "posts", "posted", "posting", "post"].map((w, i) => ({ sentence_id: String(i), words: [word(w, "post")] }));
    expect(limitUnitVocabulary(rows).map(r => r.words.length)).toEqual([1, 1, 1, 0, 0]);
  });
  it("한 문장의 중복은 한 번만 세고 다른 유닛에서는 다시 3번 허용한다", () => {
    const rows = [0, 1, 2, 3].map(i => ({ sentence_id: String(i), words: [word("post"), word("posts", "post")] }));
    expect(limitUnitVocabulary(rows).map(r => r.words.length)).toEqual([1, 1, 1, 0]);
    expect(limitUnitVocabulary([{ sentence_id: "other", words: [word("post")] }])[0].words).toHaveLength(1);
  });
  it("재추출할 때 같은 문장을 두 번 세지 않는다", () => {
    const rows = [0, 1, 2].map(i => ({ sentence_id: String(i), words: [word("post")] }));
    expect(limitUnitVocabulary(limitUnitVocabulary(rows))).toEqual(rows);
    expect(vocabularyKey(word("to post", "POST"))).toBe("post");
  });
});
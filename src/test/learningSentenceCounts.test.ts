import { describe, expect, it } from "vitest";
import { countLearningSentences } from "@/lib/learningSentenceCounts";

describe("학생별 학습 문장 수", () => {
  it("첫 제출은 승인 여부와 무관하게 새 학습으로 센다", () => {
    expect(countLearningSentences([{ user_id: "a", sentence_id: "s1", attempt_no: 1 }])).toEqual({ a: { fresh: 1, relearn: 0 } });
  });
  it("재제출과 복습을 학생별 재학습 문장 수로 센다", () => {
    expect(countLearningSentences([
      { user_id: "a", sentence_id: "s1", attempt_no: 2 },
      { user_id: "a", sentence_id: "s2", attempt_no: 1, attempt_source: "review" },
      { user_id: "b", sentence_id: "s1", attempt_no: 1 },
    ])).toEqual({ a: { fresh: 0, relearn: 2 }, b: { fresh: 1, relearn: 0 } });
  });
  it("같은 문장의 반복 기록은 각 구분에서 한 문장으로 센다", () => {
    expect(countLearningSentences([
      { user_id: "a", sentence_id: "s1", attempt_no: 1 },
      { user_id: "a", sentence_id: "s1", attempt_no: 1 },
      { user_id: "a", sentence_id: "s1", attempt_no: 2 },
      { user_id: "a", sentence_id: "s1", attempt_no: 3 },
    ])).toEqual({ a: { fresh: 1, relearn: 1 } });
  });
  it("단어 오답복습용 가상 문장은 학습 문장 수에 넣지 않는다", () => {
    expect(countLearningSentences([{ user_id: "a", sentence_id: "s1__remediation_2", attempt_no: 1 }])).toEqual({});
  });
});
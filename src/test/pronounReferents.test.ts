import { describe, it, expect } from "vitest";
import { pronounCandidates, missingReferents, isAnswerComplete, matchesMaster, isReferentReviewComplete } from "@/lib/pronounReferents";

const S = "They finally solved it, and that was important.";

describe("pronounReferents", () => {
  it("requires review of every pronoun before approval", () => {
    expect(isReferentReviewComplete(true, false, [0, 3, 5], new Set([0, 3]))).toBe(false);
    expect(isReferentReviewComplete(true, false, [0, 3, 5], new Set([0, 3, 5]))).toBe(true);
  });
  it("blocks approval while loading or when fetching fails", () => {
    expect(isReferentReviewComplete(false, false, [], new Set())).toBe(false);
    expect(isReferentReviewComplete(true, true, [0], new Set([0]))).toBe(false);
  });
  it("does not require a checkbox when a loaded sentence has no pronouns", () => {
    expect(isReferentReviewComplete(true, false, [], new Set())).toBe(true);
  });
  it("review of another sentence cannot satisfy the current sentence", () => {
    expect(isReferentReviewComplete(true, false, [3, 5], new Set([0]))).toBe(false);
  });
  it("finds pronoun candidates with punctuation stripped", () => {
    expect(pronounCandidates(S).map((c) => c.word)).toEqual(["They", "it", "that"]);
  });
  it("blocks submit while any pronoun is unhandled", () => {
    expect(missingReferents(S, [{ wordIndex: 0, word: "They", kind: "outside", outsideText: "the scientists" }]).map((m) => m.word)).toEqual(["it", "that"]);
  });
  it("allows submit when every pronoun is handled", () => {
    expect(missingReferents(S, [
      { wordIndex: 0, word: "They", kind: "outside", outsideText: "the scientists" },
      { wordIndex: 3, word: "it", kind: "outside", outsideText: "the problem" },
      { wordIndex: 5, word: "that", kind: "non_pronoun", nonPronounType: "접속사" },
    ])).toEqual([]);
  });
  it("outside referent must be written in English", () => {
    expect(isAnswerComplete({ wordIndex: 0, word: "They", kind: "outside", outsideText: "과학자들" })).toBe(false);
    expect(isAnswerComplete({ wordIndex: 0, word: "They", kind: "outside", outsideText: "  " })).toBe(false);
  });
  it("in-sentence link cannot point to itself", () => {
    expect(isAnswerComplete({ wordIndex: 3, word: "it", kind: "in_sentence", targetIndex: 3 })).toBe(false);
  });
  it("compares outside text ignoring articles and case", () => {
    expect(matchesMaster({ wordIndex: 0, word: "They", kind: "outside", outsideText: "Scientists" },
      { wordIndex: 0, word: "They", kind: "outside", outsideText: "the scientists" })).toBe(true);
    expect(matchesMaster({ wordIndex: 0, word: "They", kind: "non_pronoun", nonPronounType: "가주어" }, undefined)).toBeNull();
  });
});

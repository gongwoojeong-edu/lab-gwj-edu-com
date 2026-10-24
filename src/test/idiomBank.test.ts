import { describe, it, expect } from "vitest";
import { pickIdiomTestItems, gradeIdiomAnswer } from "@/lib/idiomBank";

describe("pickIdiomTestItems", () => {
  const items = Array.from({ length: 50 }, (_, i) => ({ id: `id-${i}` }));

  it("요청한 개수만큼 고른다", () => {
    expect(pickIdiomTestItems(items, 20)).toHaveLength(20);
    expect(pickIdiomTestItems(items, 30)).toHaveLength(30);
    expect(pickIdiomTestItems(items, 40)).toHaveLength(40);
  });

  it("누적 개수보다 많이 요청하면 전부만 고른다", () => {
    expect(pickIdiomTestItems(items, 100)).toHaveLength(50);
  });

  it("중복 없이 고른다", () => {
    const picked = pickIdiomTestItems(items, 30);
    expect(new Set(picked.map((p) => p.id)).size).toBe(30);
  });

  it("빈 목록이면 빈 결과", () => {
    expect(pickIdiomTestItems([], 20)).toHaveLength(0);
  });
});

describe("gradeIdiomAnswer", () => {
  it("정확히 일치하면 정답", () => {
    expect(gradeIdiomAnswer("참가하다", "참가하다")).toBe(true);
  });

  it("공백·마침표 차이는 무시한다", () => {
    expect(gradeIdiomAnswer("참여하다", " 참여하다. ")).toBe(true);
  });

  it("정답이 여러 표현이면 하나만 맞혀도 정답", () => {
    expect(gradeIdiomAnswer("참가하다/참여하다", "참여하다")).toBe(true);
    expect(gradeIdiomAnswer("~에 참가하다, ~에 참여하다", "~에 참여하다")).toBe(true);
  });

  it("빈 답은 오답", () => {
    expect(gradeIdiomAnswer("참가하다", "")).toBe(false);
    expect(gradeIdiomAnswer("참가하다", "   ")).toBe(false);
  });

  it("다른 뜻은 오답", () => {
    expect(gradeIdiomAnswer("참가하다", "떠나다")).toBe(false);
  });

  it("대소문자는 무시한다", () => {
    expect(gradeIdiomAnswer("A급", "a급")).toBe(true);
  });
});

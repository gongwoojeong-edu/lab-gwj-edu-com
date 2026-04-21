import { describe, it, expect } from "vitest";
import { splitIntoSyllables } from "@/lib/syllables";

describe("splitIntoSyllables — silent-e 및 짧은 청크 병합", () => {
  it("enhance → en + hance (마지막 'ce'가 직전과 병합)", () => {
    expect(splitIntoSyllables("enhance")).toEqual(["en", "hance"]);
  });

  it("decide → de + cide", () => {
    const r = splitIntoSyllables("decide");
    expect(r[r.length - 1]).toBe("cide");
  });

  it("provide → pro + vide", () => {
    const r = splitIntoSyllables("provide");
    expect(r[r.length - 1]).toMatch(/vide$/);
  });

  it("simple → sim + ple ('le'는 분리 유지)", () => {
    expect(splitIntoSyllables("simple")).toEqual(["sim", "ple"]);
  });

  it("little → lit + tle ('le' 분리 유지)", () => {
    const r = splitIntoSyllables("little");
    expect(r[r.length - 1]).toBe("tle");
  });

  it("nation → 두 청크 이상", () => {
    const r = splitIntoSyllables("nation");
    expect(r.length).toBeGreaterThanOrEqual(2);
    // 마지막 청크는 'tion' 혹은 모음 포함 정상 청크여야 함
    expect(/[aeiouy]/i.test(r[r.length - 1])).toBe(true);
  });

  it("짧은 단어는 분리하지 않음", () => {
    expect(splitIntoSyllables("cat")).toEqual(["cat"]);
    expect(splitIntoSyllables("go")).toEqual(["go"]);
  });

  it("마지막 청크는 항상 모음을 포함하거나 'le'", () => {
    const words = ["enhance", "decide", "provide", "simple", "little", "nation", "table", "fragile"];
    for (const w of words) {
      const r = splitIntoSyllables(w);
      const last = r[r.length - 1].toLowerCase();
      expect(/[aeiouy]/.test(last) || last === "le").toBe(true);
    }
  });
});

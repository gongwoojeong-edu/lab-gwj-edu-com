import { describe, expect, it } from "vitest";
import { dedupeWords, normalizeWord, tokenizeWords } from "@/lib/unknownWords";
import { buildDictionaryActivitySection } from "@/lib/printTemplates";

describe("normalizeWord", () => {
  it("trim + 소문자", () => {
    expect(normalizeWord("  Apple ")).toBe("apple");
  });
});

describe("dedupeWords", () => {
  it("대소문자 무시 중복 제거, 첫 표기와 순서 보존", () => {
    expect(dedupeWords(["Apple", "banana", "apple", "APPLE", "Cherry"])).toEqual([
      "Apple",
      "banana",
      "Cherry",
    ]);
  });
  it("빈 문자열 제거", () => {
    expect(dedupeWords(["a", " ", "", "b"])).toEqual(["a", "b"]);
  });
});

describe("tokenizeWords", () => {
  it("공백 분리 + 가장자리 구두점 제거", () => {
    expect(tokenizeWords('Hello, "world"! (test)')).toEqual(["Hello", "world", "test"]);
  });
  it("내부 구두점은 보존", () => {
    expect(tokenizeWords("don't stop well-known")).toEqual(["don't", "stop", "well-known"]);
  });
  it("빈 토큰 제거", () => {
    expect(tokenizeWords("  a   b  ")).toEqual(["a", "b"]);
  });
});

describe("buildDictionaryActivitySection", () => {
  it("단어가 없으면 빈 문자열", () => {
    expect(buildDictionaryActivitySection({ studentName: "홍길동", words: [] })).toBe("");
  });
  it("단어와 빈 칸(뜻·품사·암기)이 들어간다", () => {
    const html = buildDictionaryActivitySection({ studentName: "홍길동", words: ["apple", "run"] });
    expect(html).toContain("사전활동");
    expect(html).toContain("apple");
    expect(html).toContain("run");
    // 각 행에 빈 td 3개 (뜻·품사·암기)
    expect(html.match(/<td><\/td><td><\/td><td><\/td>/g)).toHaveLength(2);
    expect(html).toContain("홍길동");
  });
  it("HTML 이스케이프", () => {
    const html = buildDictionaryActivitySection({ studentName: "<b>x</b>", words: ["<script>"] });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
  });
});

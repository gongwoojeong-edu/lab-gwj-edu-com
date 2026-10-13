import { it, expect } from "vitest";
import { buildBookCombinedWorkbookHtml } from "@/lib/printTemplates";

it("뒷면 단어 페이지가 테스트지 형식(빈칸+정답지)으로 출력된다", () => {
  const html = buildBookCombinedWorkbookHtml({
    bookTitle: "테스트북",
    studentName: "홍길동",
    studentNo: "001",
    units: [],
    words: [
      { word: "apple", meaning: "사과" },
      { word: "monitor", meaning: "감시하다" },
    ],
  });
  expect(html).toContain("단어 테스트");
  expect(html).toContain("bk-wblank");
  expect(html).toContain("bk-wkey");
  expect(html).toContain("apple");
  expect(html).toContain("사과");
});

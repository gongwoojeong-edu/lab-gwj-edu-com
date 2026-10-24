// 관용어구 부록 빌더 테스트 — 워크북 뒤쪽 부록 섹션
import { describe, expect, it } from "vitest";
import { buildIdiomAppendixSection } from "@/lib/printTemplates";

describe("buildIdiomAppendixSection", () => {
  it("모든 표현과 뜻을 번호와 함께 포함한다", () => {
    const html = buildIdiomAppendixSection({
      studentName: "김서연",
      studentNo: "S-102",
      items: [
        { expression: "break down", meaning: "고장 나다" },
        { expression: "look forward to", meaning: "기대하다" },
        { expression: "come up with", meaning: "생각해내다" },
      ],
    });

    expect(html).toContain("break down");
    expect(html).toContain("고장 나다");
    expect(html).toContain("look forward to");
    expect(html).toContain("기대하다");
    expect(html).toContain("come up with");
    expect(html).toContain("생각해내다");
    // 3개 표현 개수 표기
    expect(html).toContain("3개 표현");
    // 새 페이지에서 시작 (워크본 뒤쪽 부록)
    expect(html).toContain("page-break-before");
    // 학생 이름 표기
    expect(html).toContain("김서연");
    expect(html).toContain("S-102");
  });

  it("HTML 특수문자를 이스케이프한다", () => {
    const html = buildIdiomAppendixSection({
      studentName: "홍<길동>",
      items: [{ expression: "<b>&</b>", meaning: '따옴표 "test"' }],
    });

    expect(html).not.toContain("<b>&</b>");
    expect(html).toContain("&lt;b&gt;&amp;&lt;/b&gt;");
    expect(html).toContain("&quot;test&quot;");
  });

  it("절반 지점에서 두 열로 나눈다", () => {
    const items = Array.from({ length: 6 }, (_, i) => ({
      expression: `expr${i + 1}`,
      meaning: `뜻${i + 1}`,
    }));
    const html = buildIdiomAppendixSection({ studentName: "테스트", items });
    // 첫 열: 1~3, 둘째 열: 4~6
    const firstCol = html.split('<div class="iapx-grid">')[1] ?? "";
    expect(firstCol).toContain("expr1");
    expect(firstCol).toContain("expr3");
    expect(firstCol).toContain("expr4");
    expect(firstCol).toContain("expr6");
  });
});

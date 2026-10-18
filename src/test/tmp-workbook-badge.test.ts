// 임시 검증: 실제 백엔드 데이터로 워크북 HTML을 만들어 배지 규칙을 확인한다.
// (확인 후 삭제 예정 — 영구 규칙 테스트는 gradeMeta.test.ts)
import { describe, expect, it } from "vitest";
import { buildUnitWorkbookHtmlFor } from "@/lib/unitWorkbook";

const PARK = "54bab5ae-0ff2-4f1a-80d5-83eb68c37f41"; // 박서우
const UNIT = {
  unitId: "c15667a2-2313-441e-93e0-65503e320070",
  unitTitle: "One, Two, Three, Jump!",
  unitCode: "7-1",
};

const readout = (html: string) => ({
  hasRound2: html.includes("재학습 2회"),
  hasRound1: html.includes("재학습 1회"),
  goodBadge: /&gt;잘함&lt;|>잘함</.test(html),
  redoBadge: /&gt;재학습&lt;|>재학습</.test(html),
  roundCount: (html.match(/재학습 \d+회/g) ?? []).length,
});

describe("워크북 배지 실데이터 검증", () => {
  it(
    "구문 유닛 워크북: 재학습 회차 표시 + 잘함 미표시",
    async () => {
      const { html } = await buildUnitWorkbookHtmlFor({ ...UNIT, studentId: PARK, mode: "syntax_unit" });
      const r = readout(html);
      console.log("syntax_unit", JSON.stringify(r));
      expect(r.hasRound2).toBe(true);
      expect(r.hasRound1).toBe(true);
      expect(r.goodBadge).toBe(false);
      expect(r.redoBadge).toBe(true);
    },
    180000,
  );

  it(
    "선택유닛 통합 워크북: 재학습 회차 표시 + 잘함 미표시",
    async () => {
      const { html } = await buildUnitWorkbookHtmlFor({ ...UNIT, studentId: PARK, mode: "syntax_book" });
      const r = readout(html);
      console.log("syntax_book", JSON.stringify(r));
      expect(r.hasRound2).toBe(true);
      expect(r.goodBadge).toBe(false);
    },
    180000,
  );

  it(
    "문장별 구문 HO: 재학습 회차 표시 + 잘함 미표시",
    async () => {
      const { html } = await buildUnitWorkbookHtmlFor({ ...UNIT, studentId: PARK, mode: "syntax_passage" });
      const r = readout(html);
      console.log("syntax_passage", JSON.stringify(r));
      expect(r.hasRound2).toBe(true);
      expect(r.goodBadge).toBe(false);
    },
    180000,
  );
});

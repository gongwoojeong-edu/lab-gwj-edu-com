import { describe, expect, it } from "vitest";
import { summarizePassageCodeGaps } from "@/lib/passageCoverage";

describe("summarizePassageCodeGaps", () => {
  it("reports missing code tails like 2 and 6", () => {
    const gap = summarizePassageCodeGaps({
      assignedCodes: [
        "1-1-alt8-1",
        "1-1-alt8-3",
        "1-1-alt8-4",
        "1-1-alt8-5",
        "1-1-alt8-7",
      ],
      unitCodes: Array.from({ length: 11 }, (_, i) => `1-1-alt8-${i + 1}`),
    });
    expect(gap.missingNos).toEqual([2, 6, 8, 9, 10, 11]);
    expect(gap.label).toContain("누락");
    expect(gap.label).toContain("2");
  });
});

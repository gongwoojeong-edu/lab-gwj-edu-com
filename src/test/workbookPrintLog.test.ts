import { describe, expect, it } from "vitest";
import { formatPrintDate, summarizePrintsByUnit, type WorkbookPrintLog } from "@/lib/workbookPrintLogMeta";

const log = (unit_ids: string[], printed_at: string, mode = "syntax_book"): WorkbookPrintLog => ({
  student_id: "s1", unit_ids, mode, answer_key: false, hide_translation: false,
  passage_count: 3, printed_by: "t1", printed_at,
});

describe("workbook print status", () => {
  it("a unit printed inside a multi-unit workbook counts as printed", () => {
    const m = summarizePrintsByUnit([log(["u1", "u2"], "2026-11-14T05:00:00Z")], ["u2"]);
    expect(m.get("u2")?.count).toBe(1);
  });
  it("a unit never printed has no record", () => {
    const m = summarizePrintsByUnit([log(["u1"], "2026-11-14T05:00:00Z")], ["u1", "u3"]);
    expect(m.has("u3")).toBe(false);
  });
  it("counts every print and keeps the newest as latest", () => {
    const m = summarizePrintsByUnit(
      [log(["u1"], "2026-11-10T05:00:00Z", "word_unit"), log(["u1"], "2026-11-14T05:00:00Z", "syntax_unit")],
      ["u1"],
    );
    expect(m.get("u1")?.count).toBe(2);
    expect(m.get("u1")?.latest.mode).toBe("syntax_unit");
  });
  it("shows Seoul time", () => {
    expect(formatPrintDate("2026-11-14T05:24:00Z")).toBe("11/14 14:24");
  });
});

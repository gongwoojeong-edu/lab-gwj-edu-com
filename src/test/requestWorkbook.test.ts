import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  single: vi.fn(), multi: vi.fn(), launch: vi.fn(), log: vi.fn(), mark: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/textbooks", () => ({ fetchUnitsByTextbook: vi.fn() }));
vi.mock("@/lib/unitWorkbook", () => ({
  summarizeUnitProgress: vi.fn(), buildUnitWorkbookHtmlFor: mocks.single, buildMultiUnitWorkbookHtml: mocks.multi,
}));
vi.mock("@/lib/printLauncher", () => ({ launchPrintHtml: mocks.launch }));
vi.mock("@/lib/workbookPrintLog", () => ({ recordWorkbookPrint: mocks.log }));
vi.mock("@/lib/unitWorkflow", () => ({ markUnitPrinted: mocks.mark }));
import { printRequestWorkbook, type RequestWorkbook } from "@/lib/requestWorkbook";

const workbook: RequestWorkbook = {
  unit: { unitId: "u1", unitTitle: "1번", unitCode: "M3 · 교재 · 8과 · U1" },
  siblings: [{ unitId: "u2", unitTitle: "2번", unitCode: "M3 · 교재 · 8과 · U2", unit_no: 2, title: "2번" }],
  summary: { totalPassages: 2, completedCodes: ["s1"], pendingCodes: ["s2"] },
};
const opts = { answerKey: false, extraUnitIds: [] as string[], hideStudentTranslation: true };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.single.mockResolvedValue({ html: "bookshelf-html", completedCount: 2 });
  mocks.multi.mockResolvedValue({ html: "combined-html", passageCount: 4 });
});

describe("student request uses bookshelf printing", () => {
  it("passes the chosen bookshelf mode and options unchanged and logs the student/unit", async () => {
    await printRequestWorkbook(workbook, "student1", "syntax_book", opts);
    expect(mocks.single).toHaveBeenCalledWith({ ...workbook.unit, studentId: "student1", mode: "syntax_book", answerKey: false, hideStudentTranslation: true });
    expect(mocks.launch).toHaveBeenCalledWith("bookshelf-html", expect.any(Object));
    expect(mocks.log).toHaveBeenCalledWith({ studentId: "student1", unitIds: ["u1"], mode: "syntax_book", answerKey: false, hideTranslation: true, passageCount: 2 });
    expect(mocks.mark).toHaveBeenCalledWith("student1", "u1");
  });
  it("uses the same multi-unit builder and records every selected unit", async () => {
    await printRequestWorkbook(workbook, "student1", "word_unit", { ...opts, extraUnitIds: ["u2"] });
    expect(mocks.single).not.toHaveBeenCalled();
    expect(mocks.multi).toHaveBeenCalledWith(expect.objectContaining({ mode: "word_unit", units: [workbook.unit, workbook.siblings[0]] }));
    expect(mocks.log).toHaveBeenCalledWith(expect.objectContaining({ unitIds: ["u1", "u2"], passageCount: 4 }));
  });
  it("does not log or accept the request when opening the print window fails", async () => {
    mocks.launch.mockRejectedValue(new Error("print failed"));
    await expect(printRequestWorkbook(workbook, "student1", "syntax_unit", opts)).rejects.toThrow("print failed");
    expect(mocks.log).not.toHaveBeenCalled();
    expect(mocks.mark).not.toHaveBeenCalled();
  });
});
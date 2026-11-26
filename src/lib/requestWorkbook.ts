import { supabase } from "@/integrations/supabase/client";
import { LEVEL_LABEL, type LevelCode } from "@/lib/levels";
import { fetchUnitsByTextbook } from "@/lib/textbooks";
import {
  summarizeUnitProgress,
  buildUnitWorkbookHtmlFor,
  buildMultiUnitWorkbookHtml,
  type WorkbookMode,
} from "@/lib/unitWorkbook";
import { launchPrintHtml } from "@/lib/printLauncher";
import { recordWorkbookPrint } from "@/lib/workbookPrintLog";
import { markUnitPrinted } from "@/lib/unitWorkflow";

export async function loadRequestWorkbook(unitId: string, studentId: string) {
  const { data: unit, error } = await supabase.from("textbook_units")
    .select("id,textbook_id,unit_no,title").eq("id", unitId).single();
  if (error) throw error;
  const { data: book, error: bookError } = await supabase.from("textbooks")
    .select("title,level,series_id").eq("id", unit.textbook_id).single();
  if (bookError) throw bookError;
  const [{ data: series, error: seriesError }, siblings, summary] = await Promise.all([
    supabase.from("textbook_series").select("title").eq("id", book.series_id).single(),
    fetchUnitsByTextbook(unit.textbook_id),
    summarizeUnitProgress(unitId, studentId),
  ]);
  if (seriesError) throw seriesError;
  if (!summary.totalPassages) throw new Error("이 유닛에 지문이 없어요");
  const codeOf = (n: number) => `${LEVEL_LABEL[book.level as LevelCode]} · ${series.title} · ${book.title} · U${n}`;
  return {
    unit: { unitId, unitTitle: unit.title, unitCode: codeOf(unit.unit_no) },
    siblings: siblings.filter((u) => u.id !== unitId).map((u) => ({
      unitId: u.id, unit_no: u.unit_no, title: u.title,
      unitTitle: u.title, unitCode: codeOf(u.unit_no),
    })),
    summary,
  };
}

export type RequestWorkbook = Awaited<ReturnType<typeof loadRequestWorkbook>>;

/** Use the bookshelf builders and record completion only after the print window opens. */
export async function printRequestWorkbook(
  workbook: RequestWorkbook,
  studentId: string,
  mode: WorkbookMode,
  opts: { answerKey: boolean; extraUnitIds: string[]; hideStudentTranslation: boolean },
) {
  const extras = workbook.siblings.filter((u) => opts.extraUnitIds.includes(u.unitId))
    .sort((a, b) => a.unit_no - b.unit_no);
  const units = [workbook.unit, ...extras];
  const input = { studentId, mode, answerKey: opts.answerKey, hideStudentTranslation: opts.hideStudentTranslation };
  const result = extras.length
    ? await buildMultiUnitWorkbookHtml({ ...input, units })
    : await buildUnitWorkbookHtmlFor({ ...input, ...workbook.unit });
  await launchPrintHtml(result.html, {
    jobKey: `request-workbook:${studentId}:${workbook.unit.unitId}:${mode}`,
    loadTimeoutMs: 12000,
    cleanupAfterMs: 2500,
  });
  await recordWorkbookPrint({
    studentId, unitIds: units.map((u) => u.unitId), mode,
    answerKey: opts.answerKey, hideTranslation: opts.hideStudentTranslation,
    passageCount: "passageCount" in result ? result.passageCount : result.completedCount,
  });
  await markUnitPrinted(studentId, workbook.unit.unitId);
}
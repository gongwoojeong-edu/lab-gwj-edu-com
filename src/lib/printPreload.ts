// ============================================================
// printPreload — 인쇄용 데이터 사전 적재 + 템플릿 빌드
//
// 사용 패턴:
//   const payload = await preloadHandoutPayload({ sentenceId, studentId });
//   const html = buildHandoutPrintHtml(payload);
//   launchPrintHtml(html, { jobKey });
//
// 단계별 에러 분류:
//   PrintPreloadError("passage", ...)
//   PrintPreloadError("words", ...)
//   PrintPreloadError("analysis", ...)
// ============================================================
import { supabase } from "@/integrations/supabase/client";
import { fetchPassageByCode } from "./textbooks";
import { buildClozeSegments, buildStructureHint } from "./handoutCloze";
import {
  buildHandoutPrintHtml,
  buildWordPrintHtml,
  buildAnalysisPrintHtml,
  type HandoutPayload,
  type WordPayload,
  type AnalysisPayload,
  type WordMode,
} from "./printTemplates";
import {
  computeCompareDiff,
  buildWordUnitsFromTokens,
  ownerIdToSurface,
  type FlatWordUnit,
} from "./analysisCompare";
import { fetchStudentAnswersByUserId } from "./analysisGrading";

export type PrintStage =
  | "passage"
  | "student"
  | "translation"
  | "words"
  | "analysis"
  | "render";

export class PrintPreloadError extends Error {
  stage: PrintStage;
  constructor(stage: PrintStage, message: string) {
    super(message);
    this.stage = stage;
    this.name = "PrintPreloadError";
  }
}

const STAGE_LABEL: Record<PrintStage, string> = {
  passage: "지문 데이터를 아직 못 불러왔어요. 잠시 후 다시 시도해 주세요.",
  student: "학생 정보가 없어 인쇄를 준비하지 못했어요.",
  translation: "한글해석을 불러오지 못했어요.",
  words: "출제할 단어가 없습니다. (오답 / 단어 추출 모두 비어 있음)",
  analysis: "분석 비교 데이터를 불러오지 못했어요.",
  render: "인쇄 문서 생성에 실패했어요.",
};

export const printStageMessage = (stage: PrintStage): string => STAGE_LABEL[stage];

// ----- 학생 정보 + 한글해석 fetch (캐시 X — 호출자 측에서 묶어 사용) -----
const fetchStudent = async (studentId: string) => {
  const { data } = await supabase
    .from("student_profiles")
    .select("display_name, student_no")
    .eq("user_id", studentId)
    .maybeSingle();
  return data as { display_name: string | null; student_no: string } | null;
};

const fetchTranslation = async (sentenceId: string, studentId: string) => {
  const { data } = await supabase
    .from("sentence_translations")
    .select("text")
    .eq("user_id", studentId)
    .eq("sentence_id", sentenceId)
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.text as string | undefined) ?? "";
};

// ============================================================
// HANDOUT (구문 HO)
// ============================================================
export interface PreloadHandoutInput {
  sentenceId: string;
  studentId?: string | null;
}

export const preloadHandoutPayload = async (
  input: PreloadHandoutInput,
): Promise<HandoutPayload> => {
  const passage = await fetchPassageByCode(input.sentenceId).catch(() => null);
  if (!passage) throw new PrintPreloadError("passage", `지문 없음: ${input.sentenceId}`);

  let studentName: string | null = null;
  let studentNo: string | null = null;
  let studentTranslation = "";
  if (input.studentId) {
    const [s, t] = await Promise.all([
      fetchStudent(input.studentId).catch(() => null),
      fetchTranslation(input.sentenceId, input.studentId).catch(() => ""),
    ]);
    if (s) {
      studentName = s.display_name;
      studentNo = s.student_no;
    }
    studentTranslation = t;
  }

  return {
    passageCode: passage.code,
    english: passage.english,
    segments: buildClozeSegments(passage.tokens),
    structureHint: buildStructureHint(passage.tokens),
    studentName,
    studentNo,
    studentTranslation,
  };
};

export const buildHandoutPrintHtmlFor = async (
  input: PreloadHandoutInput,
): Promise<string> => {
  const payload = await preloadHandoutPayload(input);
  try {
    return buildHandoutPrintHtml(payload);
  } catch (e) {
    throw new PrintPreloadError("render", String((e as Error).message ?? e));
  }
};

// ============================================================
// WORD HO
// ============================================================
export interface PreloadWordInput {
  sentenceId: string;
  studentId?: string | null;
  scope: "wrong" | "all";
  mode: WordMode;
}

export const preloadWordPayload = async (
  input: PreloadWordInput,
): Promise<WordPayload> => {
  const passage = await fetchPassageByCode(input.sentenceId).catch(() => null);
  if (!passage) throw new PrintPreloadError("passage", `지문 없음: ${input.sentenceId}`);

  let studentName: string | null = null;
  let studentNo: string | null = null;
  if (input.studentId) {
    const s = await fetchStudent(input.studentId).catch(() => null);
    if (s) {
      studentName = s.display_name;
      studentNo = s.student_no;
    }
  }

  let items: Array<{ word: string; expected: string }> = [];
  if (input.scope === "wrong" && input.studentId) {
    const { data: wt } = await supabase
      .from("word_test_results")
      .select("wrong_words, taken_at")
      .eq("user_id", input.studentId)
      .eq("sentence_id", input.sentenceId)
      .order("taken_at", { ascending: false })
      .limit(1);
    const wrong = (wt?.[0]?.wrong_words ?? []) as Array<{
      word: string;
      expected: string;
    }>;
    items = wrong
      .filter((w) => w?.word)
      .map((w) => ({ word: w.word, expected: w.expected ?? "" }));
  }
  if (items.length === 0) {
    const { data: ext } = await supabase
      .from("sentence_word_extractions")
      .select("words")
      .eq("sentence_id", input.sentenceId)
      .maybeSingle();
    const arr = (ext?.words ?? []) as Array<{
      word: string;
      meaning?: string;
      expected?: string;
    }>;
    items = arr
      .filter((w) => w?.word)
      .map((w) => ({ word: w.word, expected: (w.expected ?? w.meaning ?? "").trim() }));
  }
  // items 가 비어 있어도 "출제할 단어가 없습니다" 표시로 인쇄는 가능 → 예외 던지지 않음

  return {
    passageCode: passage.code,
    studentName,
    studentNo,
    scope: input.scope,
    mode: input.mode,
    items,
  };
};

export const buildWordPrintHtmlFor = async (
  input: PreloadWordInput,
): Promise<string> => {
  const payload = await preloadWordPayload(input);
  try {
    return buildWordPrintHtml(payload);
  } catch (e) {
    throw new PrintPreloadError("render", String((e as Error).message ?? e));
  }
};

// ============================================================
// ANALYSIS (채점본 / blank)
// ============================================================
export interface PreloadAnalysisInput {
  sentenceId: string;
  studentId: string;
  mode: "marked" | "blank";
}

export const preloadAnalysisPayload = async (
  input: PreloadAnalysisInput,
): Promise<AnalysisPayload> => {
  const [passage, student, translation, diff] = await Promise.all([
    fetchPassageByCode(input.sentenceId).catch(() => null),
    fetchStudent(input.studentId).catch(() => null),
    fetchTranslation(input.sentenceId, input.studentId).catch(() => ""),
    computeCompareDiff(input.sentenceId, input.studentId).catch(() => null),
  ]);
  if (!passage) throw new PrintPreloadError("passage", `지문 없음: ${input.sentenceId}`);
  if (!diff) throw new PrintPreloadError("analysis", "분석 비교 실패");

  // surface 채워주기
  const units: FlatWordUnit[] = passage.tokens
    ? buildWordUnitsFromTokens(passage.tokens)
    : [];
  const detailsWithSurface = diff.details.map((d) => ({
    ...d,
    surface: units.length > 0 ? ownerIdToSurface(d.ownerId, units) : d.ownerId,
  }));

  return {
    sentenceId: passage.code,
    studentName: student?.display_name ?? null,
    studentNo: student?.student_no ?? null,
    english: passage.english,
    studentTranslation: translation,
    rate: diff.rate,
    hasMaster: diff.hasMaster,
    details: detailsWithSurface,
    mode: input.mode,
  };
};

export const buildAnalysisPrintHtmlFor = async (
  input: PreloadAnalysisInput,
): Promise<string> => {
  const payload = await preloadAnalysisPayload(input);
  try {
    return buildAnalysisPrintHtml(payload);
  } catch (e) {
    throw new PrintPreloadError("render", String((e as Error).message ?? e));
  }
};

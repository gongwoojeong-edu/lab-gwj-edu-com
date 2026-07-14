import { SENTENCES, type Sentence } from "@/data/sentences";
import { type LevelCode } from "@/lib/levels";
import { supabase } from "@/integrations/supabase/client";
import { fetchMyProfile, updateMyProgress, type StudentProfile } from "@/lib/studentProfile";
import { hydrateSentencesFromDb, loadSentenceByCode } from "@/lib/sentenceSource";
import { getCurrentUserId } from "@/lib/authState";
import { taskModeIncludesMemorize, type TaskMode } from "@/lib/taskMode";
import {
  assignmentSequenceKey,
  comparePassageOrder,
  fetchPassageOrderMeta,
} from "@/lib/assignmentSequence";

export interface NextSentenceResult {
  sentence: Sentence | null;
  profile: StudentProfile | null;
  done: boolean;
  /** 지정 범위에 등록된 지문 자체가 0개인 경우(학습 자료 미준비) */
  noContent?: boolean;
}

/**
 * 학생 프로필의 시작 범위 지정(start_series_id/volume_id/unit_id)에 해당하는
 * passage code 목록을 DB에서 조회한다. 범위 미지정이면 null 반환(=레벨 전체).
 */
const fetchScopedPassageCodes = async (
  profile: StudentProfile,
): Promise<Set<string> | null> => {
  // 가장 좁은 지정부터 검사
  if (profile.start_unit_id) {
    const { data } = await supabase
      .from("textbook_passages")
      .select("code")
      .eq("unit_id", profile.start_unit_id);
    return new Set(((data ?? []) as { code: string }[]).map((r) => r.code));
  }
  if (profile.start_volume_id) {
    // 권 → 유닛들 → 지문들
    const { data: units } = await supabase
      .from("textbook_units")
      .select("id")
      .eq("textbook_id", profile.start_volume_id);
    const unitIds = ((units ?? []) as { id: string }[]).map((u) => u.id);
    if (unitIds.length === 0) return new Set();
    const { data } = await supabase
      .from("textbook_passages")
      .select("code")
      .in("unit_id", unitIds);
    return new Set(((data ?? []) as { code: string }[]).map((r) => r.code));
  }
  if (profile.start_series_id) {
    // 시리즈 → 권들 → 유닛들 → 지문들
    const { data: vols } = await supabase
      .from("textbooks")
      .select("id")
      .eq("series_id", profile.start_series_id);
    const volIds = ((vols ?? []) as { id: string }[]).map((v) => v.id);
    if (volIds.length === 0) return new Set();
    const { data: units } = await supabase
      .from("textbook_units")
      .select("id")
      .in("textbook_id", volIds);
    const unitIds = ((units ?? []) as { id: string }[]).map((u) => u.id);
    if (unitIds.length === 0) return new Set();
    const { data } = await supabase
      .from("textbook_passages")
      .select("code")
      .in("unit_id", unitIds);
    return new Set(((data ?? []) as { code: string }[]).map((r) => r.code));
  }
  return null; // 범위 미지정 → 레벨 전체
};

export const resolveNextSentence = async (): Promise<NextSentenceResult> => {
  // DB 지문이 SENTENCES에 머지될 때까지 대기 (실패해도 정적 폴백)
  await hydrateSentencesFromDb();
  const profile = await fetchMyProfile();
  if (!profile) return { sentence: null, profile: null, done: false };

  // 선생님이 학생목록에서 지정한 학년(start_level)을 항상 기준으로 삼는다.
  const targetLevel = profile.start_level;

  // pull all passed sentence ids for this user
  const userId = await getCurrentUserId();
  if (!userId) return { sentence: null, profile, done: false };
  const { data: passedRows } = await supabase
    .from("sentence_progress")
    .select("sentence_id, status")
    .eq("user_id", userId)
    .in("status", ["pass", "fail"]);
  const passed = new Set(((passedRows ?? []) as { sentence_id: string }[]).map((r) => r.sentence_id));

  // 시작 범위(시리즈/권/유닛) 지정이 있으면 그 code 집합으로 한 번 더 좁힌다.
  const scopedCodes = await fetchScopedPassageCodes(profile);

  // scopedCodes 중 메모리 SENTENCES에 아직 없는 것이 있으면 DB에서 직접 로드해 머지.
  // (sessionStorage 캐시가 stale 한 경우 신규 배정 책의 지문이 누락되는 사고 방지)
  if (scopedCodes && scopedCodes.size > 0) {
    const known = new Set(SENTENCES.map((s) => s.id));
    const missing = [...scopedCodes].filter((c) => !known.has(c));
    if (missing.length > 0) {
      const loaded = await Promise.all(missing.map((c) => loadSentenceByCode(c)));
      for (const s of loaded) {
        if (s) {
          const idx = SENTENCES.findIndex((x) => x.id === s.id);
          if (idx >= 0) SENTENCES[idx] = s;
          else SENTENCES.push(s);
        }
      }
    }
  }

  let inLevel = SENTENCES.filter((s) => s.level === targetLevel).sort((a, b) => a.no - b.no);
  if (scopedCodes) {
    inLevel = inLevel.filter((s) => scopedCodes.has(s.id));
  }

  // 지정 범위에 등록된 지문이 0개 → 학습 자료 미준비 상태(완료가 아님)
  if (inLevel.length === 0) {
    return { sentence: null, profile, done: false, noContent: true };
  }

  const found = inLevel.find((s) => !passed.has(s.id));
  if (found) {
    if (profile.current_level !== targetLevel || profile.current_no !== found.no) {
      await updateMyProgress(targetLevel, found.no);
    }
    return { sentence: found, profile: { ...profile, current_level: targetLevel, current_no: found.no }, done: false };
  }
  if (profile.current_level !== targetLevel) {
    await updateMyProgress(targetLevel, 1);
  }
  return { sentence: null, profile: { ...profile, current_level: targetLevel }, done: true };
};

export const advanceAfterPass = async (justPassed: Sentence): Promise<void> => {
  // 진도(current_level/current_no)는 항상 선생님이 지정한 start_level 기준으로만 갱신.
  // 학생이 링크로 다른 레벨 문장을 풀어도 지정 레벨이 흔들리지 않도록 한다.
  const profile = await fetchMyProfile();
  if (!profile) return;
  if (justPassed.level !== profile.start_level) {
    // 지정 외 레벨 학습은 진도에 반영하지 않음
    return;
  }
  await updateMyProgress(profile.start_level, justPassed.no + 1);
};

type AssignNavRow = {
  sentence_id: string | null;
  title: string;
  due_at: string | null;
  created_at: string;
  include_pre: boolean;
  include_analysis: boolean;
  include_translation: boolean;
  include_wordtest: boolean;
  task_mode: string | null;
};

type StepFlags = {
  pre: boolean;
  wt: boolean;
  an: boolean;
  tr: boolean;
  mem: boolean;
  status?: string;
};

const pickCurrentAssignmentRow = (
  rows: AssignNavRow[],
  sentenceId: string,
): AssignNavRow | undefined => {
  const matches = rows.filter((a) => a.sentence_id === sentenceId);
  if (matches.length === 0) return undefined;
  return matches.sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
};

const assignmentSentenceDone = (row: AssignNavRow, flags: StepFlags | undefined): boolean => {
  if (!row.sentence_id || !flags) return false;
  if (flags.status === "pass") return true;
  const mode = row.task_mode ?? "analysis_only";
  const needsMem = taskModeIncludesMemorize((mode || "analysis_only") as TaskMode);
  const needsAnalysis = mode !== "memorize_only";
  if (needsAnalysis) {
    if (row.include_pre && !flags.pre) return false;
    if (row.include_wordtest && !flags.wt) return false;
    if (row.include_analysis && !flags.an) return false;
    if (row.include_translation && !flags.tr) return false;
    // 한글해석 포함 → 선생님 승인(pass) 전엔 다음 문장으로 넘기지 않음
    if (row.include_translation && flags.status !== "pass") return false;
  }
  if (needsMem && !flags.mem) return false;
  return true;
};

const loadSentenceById = async (code: string): Promise<Sentence | null> => {
  const known = SENTENCES.find((s) => s.id === code);
  if (known) return known;
  return loadSentenceByCode(code);
};

/**
 * 특별과제 시퀀스에서 현재보다 앞의 미완료 문장 (순서 이탈 진입 방지).
 * 없으면 null.
 */
export const resolveEarlierIncompleteInAssignment = async (
  currentSentenceId: string,
): Promise<Sentence | null> => {
  const userId = await getCurrentUserId();
  if (!userId) return null;

  const { data: assignData } = await supabase
    .from("assignments")
    .select(
      "sentence_id, title, due_at, created_at, include_pre, include_analysis, include_translation, include_wordtest, task_mode",
    )
    .or(`student_id.eq.${userId},student_id.is.null`)
    .not("sentence_id", "is", null);

  const allAssignments = (assignData ?? []) as AssignNavRow[];
  if (!allAssignments.some((a) => a.sentence_id === currentSentenceId)) return null;

  const assignCodes = allAssignments
    .map((a) => a.sentence_id)
    .filter((c): c is string => !!c);
  const orderMeta = await fetchPassageOrderMeta(assignCodes);
  const currentRow = pickCurrentAssignmentRow(allAssignments, currentSentenceId);
  if (!currentRow) return null;

  const groupKey = assignmentSequenceKey({
    title: currentRow.title,
    due_at: currentRow.due_at,
    textbookId: orderMeta.get(currentSentenceId)?.textbook_id ?? null,
  });
  const groupRows = allAssignments
    .filter((a) => {
      if (!a.sentence_id) return false;
      return (
        assignmentSequenceKey({
          title: a.title,
          due_at: a.due_at,
          textbookId: orderMeta.get(a.sentence_id)?.textbook_id ?? null,
        }) === groupKey
      );
    })
    .sort((a, b) => comparePassageOrder(a.sentence_id, b.sentence_id, orderMeta));

  const { data: progRows } = await supabase
    .from("sentence_progress")
    .select(
      "sentence_id, status, pre_done, word_test_done, analysis_done, translation_done, mem_passed_at",
    )
    .eq("user_id", userId)
    .in("sentence_id", assignCodes);

  const progressFlags = new Map<string, StepFlags>();
  (
    (progRows ?? []) as Array<{
      sentence_id: string;
      status: string | null;
      pre_done: boolean | null;
      word_test_done: boolean | null;
      analysis_done: boolean | null;
      translation_done: boolean | null;
      mem_passed_at: string | null;
    }>
  ).forEach((r) => {
    progressFlags.set(r.sentence_id, {
      pre: !!r.pre_done,
      wt: !!r.word_test_done,
      an: !!r.analysis_done,
      tr: !!r.translation_done,
      mem: !!r.mem_passed_at,
      status: r.status ?? undefined,
    });
  });

  const currentIdx = groupRows.findIndex((a) => a.sentence_id === currentSentenceId);
  if (currentIdx <= 0) return null;
  const earlier = groupRows.slice(0, currentIdx).find(
    (a) => a.sentence_id && !assignmentSentenceDone(a, progressFlags.get(a.sentence_id)),
  );
  if (!earlier?.sentence_id) return null;
  return loadSentenceById(earlier.sentence_id);
};

/**
 * 승인·통과 직후 이동 대상.
 * 특별과제(같은 교재 시퀀스) → 같은 유닛 다음 지문 → 일반 진도(resolveNextSentence).
 */
export const resolveNextAfterPass = async (
  currentSentenceId: string,
): Promise<NextSentenceResult> => {
  await hydrateSentencesFromDb();
  const profile = await fetchMyProfile();
  const userId = await getCurrentUserId();
  if (!userId) return { sentence: null, profile, done: false };

  const { data: assignData } = await supabase
    .from("assignments")
    .select(
      "sentence_id, title, due_at, created_at, include_pre, include_analysis, include_translation, include_wordtest, task_mode",
    )
    .or(`student_id.eq.${userId},student_id.is.null`)
    .not("sentence_id", "is", null);

  const allAssignments = (assignData ?? []) as AssignNavRow[];
  const assignCodes = allAssignments
    .map((a) => a.sentence_id)
    .filter((c): c is string => !!c);

  if (assignCodes.includes(currentSentenceId)) {
    const { data: progRows } = await supabase
      .from("sentence_progress")
      .select(
        "sentence_id, status, pre_done, word_test_done, analysis_done, translation_done, mem_passed_at",
      )
      .eq("user_id", userId)
      .in("sentence_id", assignCodes);

    const progressFlags = new Map<string, StepFlags>();
    (
      (progRows ?? []) as Array<{
        sentence_id: string;
        status: string | null;
        pre_done: boolean | null;
        word_test_done: boolean | null;
        analysis_done: boolean | null;
        translation_done: boolean | null;
        mem_passed_at: string | null;
      }>
    ).forEach((r) => {
      progressFlags.set(r.sentence_id, {
        pre: !!r.pre_done,
        wt: !!r.word_test_done,
        an: !!r.analysis_done,
        tr: !!r.translation_done,
        mem: !!r.mem_passed_at,
        status: r.status ?? undefined,
      });
    });

    const orderMeta = await fetchPassageOrderMeta(assignCodes);

    const currentRow = pickCurrentAssignmentRow(allAssignments, currentSentenceId);
    if (!currentRow) {
      return { sentence: null, profile, done: false };
    }

    const currentTb = orderMeta.get(currentSentenceId)?.textbook_id ?? null;
    const groupKey = assignmentSequenceKey({
      title: currentRow.title,
      due_at: currentRow.due_at,
      textbookId: currentTb,
    });

    const groupRows = allAssignments
      .filter((a) => {
        if (!a.sentence_id) return false;
        const tb = orderMeta.get(a.sentence_id)?.textbook_id ?? null;
        return (
          assignmentSequenceKey({
            title: a.title,
            due_at: a.due_at,
            textbookId: tb,
          }) === groupKey
        );
      })
      .sort((a, b) => comparePassageOrder(a.sentence_id, b.sentence_id, orderMeta));

    const currentIdx = groupRows.findIndex((a) => a.sentence_id === currentSentenceId);
    // 현재 문장보다 앞의 미완료가 있으면 그곳으로 (순서 이탈 복구)
    const earlierIncomplete =
      currentIdx > 0
        ? groupRows.slice(0, currentIdx).find(
            (a) =>
              a.sentence_id &&
              !assignmentSentenceDone(a, progressFlags.get(a.sentence_id)),
          )
        : undefined;
    if (earlierIncomplete?.sentence_id) {
      const sentence = await loadSentenceById(earlierIncomplete.sentence_id);
      if (sentence) return { sentence, profile, done: false };
    }

    const nextRow =
      currentIdx >= 0
        ? groupRows.slice(currentIdx + 1).find(
            (a) =>
              a.sentence_id &&
              !assignmentSentenceDone(a, progressFlags.get(a.sentence_id)),
          )
        : groupRows.find(
            (a) =>
              a.sentence_id &&
              a.sentence_id !== currentSentenceId &&
              !assignmentSentenceDone(a, progressFlags.get(a.sentence_id)),
          );
    if (nextRow?.sentence_id && nextRow.sentence_id !== currentSentenceId) {
      const sentence = await loadSentenceById(nextRow.sentence_id);
      if (sentence) return { sentence, profile, done: false };
    }

    // 같은 시퀀스 내 남은 문장 없음 → 홈 (다른 교재로 점프하지 않음)
    return { sentence: null, profile, done: false };
  }

  const { data: curPassage } = await supabase
    .from("textbook_passages")
    .select("unit_id, passage_no")
    .eq("code", currentSentenceId)
    .maybeSingle();

  if (curPassage?.unit_id) {
    const { data: unitPassages } = await supabase
      .from("textbook_passages")
      .select("code, passage_no")
      .eq("unit_id", curPassage.unit_id)
      .order("passage_no", { ascending: true });

    const codes = ((unitPassages ?? []) as { code: string }[]).map((p) => p.code);
    const { data: passedRows } = await supabase
      .from("sentence_progress")
      .select("sentence_id")
      .eq("user_id", userId)
      .in("status", ["pass", "fail"])
      .in("sentence_id", codes);
    const passed = new Set(
      ((passedRows ?? []) as { sentence_id: string }[]).map((r) => r.sentence_id),
    );

    const idx = codes.indexOf(currentSentenceId);
    for (let i = idx + 1; i < codes.length; i++) {
      if (!passed.has(codes[i])) {
        const sentence = await loadSentenceById(codes[i]);
        if (sentence) return { sentence, profile, done: false };
      }
    }

    if (profile?.start_unit_id === curPassage.unit_id) {
      return { sentence: null, profile, done: true };
    }
  }

  const current = await loadSentenceById(currentSentenceId);
  if (current) await advanceAfterPass(current);
  return resolveNextSentence();
};

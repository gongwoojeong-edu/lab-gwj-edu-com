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

export type DeckTrack = "A" | "B";

export interface TrackScope {
  series_id: string | null;
  volume_id: string | null;
  unit_id: string | null;
}

/** 트랙별 진도 범위 (A=메인덱, B=서브덱) */
export const trackScopeOf = (profile: StudentProfile, track: DeckTrack): TrackScope =>
  track === "B"
    ? {
        series_id: profile.track_b_series_id ?? null,
        volume_id: profile.track_b_volume_id ?? null,
        unit_id: profile.track_b_unit_id ?? null,
      }
    : {
        series_id: profile.start_series_id ?? null,
        volume_id: profile.start_volume_id ?? null,
        unit_id: profile.start_unit_id ?? null,
      };

/** 트랙 표시 이름 */
export const trackLabelOf = (profile: StudentProfile | null, track: DeckTrack): string =>
  track === "B"
    ? (profile?.track_b_label?.trim() || "서브덱")
    : (profile?.track_a_label?.trim() || "메인덱");

export interface NextSentenceResult {
  sentence: Sentence | null;
  profile: StudentProfile | null;
  done: boolean;
  /** 지정 범위에 등록된 지문 자체가 0개인 경우(학습 자료 미준비) */
  noContent?: boolean;
  /** 특별과제 회독 id (있으면 학습 URL에 유지) */
  assignmentId?: string | null;
  /** 이 결과가 속한 진도 트랙 */
  track?: DeckTrack;
}

/**
 * 학습 범위(트랙 scope) → passage code 집합.
 * - 시리즈만: 시리즈 전체
 * - 권(과) 지정: 지정한 권부터만 진행
 * - 시작 유닛: 그 권에서 그 유닛부터 권 끝까지
 * 범위 미지정 → null (= 레벨 전체)
 */
const fetchScopedPassageCodes = async (
  scope: TrackScope,
): Promise<Set<string> | null> => {
  let startUnitNo: number | null = null;
  let startUnitTextbookId: string | null = null;

  if (scope.unit_id) {
    const { data: unit } = await supabase
      .from("textbook_units")
      .select("id, textbook_id, unit_no")
      .eq("id", scope.unit_id)
      .maybeSingle();
    if (unit) {
      startUnitNo = (unit as { unit_no: number }).unit_no;
      startUnitTextbookId = (unit as { textbook_id: string }).textbook_id;
    }
  }

  let textbookIds: string[] | null = null;
  const startVolumeId = scope.volume_id ?? startUnitTextbookId;


  if (startVolumeId) {
    if (startUnitTextbookId) {
      // 유닛 직접 지정은 명시적인 시작점이므로 해당 권의 지정 유닛부터만 진행한다.
      textbookIds = [startVolumeId];
    } else {
      const { data: configuredBook } = await supabase
        .from("textbooks")
        .select("series_id, volume_no")
        .eq("id", startVolumeId)
        .maybeSingle();
      if (!configuredBook) return new Set();

      // 권을 직접 지정한 것은 명시적인 시작점이다. 이전 권의 미완료 기록은
      // 보존하되 메인덱 진입 범위에는 섞지 않는다.
      textbookIds = [startVolumeId];
    }
  } else if (scope.series_id) {
    const { data: vols } = await supabase
      .from("textbooks")
      .select("id")
      .eq("series_id", scope.series_id);
    textbookIds = ((vols ?? []) as { id: string }[]).map((v) => v.id);
  } else {
    return null;
  }

  if (!textbookIds.length) return new Set();


  const { data: units } = await supabase
    .from("textbook_units")
    .select("id, textbook_id, unit_no")
    .in("textbook_id", textbookIds);

  let unitRows = (units ?? []) as {
    id: string;
    textbook_id: string;
    unit_no: number;
  }[];

  // 시작 유닛이 있으면 그 권에서만 이전 유닛을 제외 (이후 권들은 전체 포함)
  if (startUnitNo != null && startUnitTextbookId) {
    unitRows = unitRows.filter(
      (u) => u.textbook_id !== startUnitTextbookId || u.unit_no >= startUnitNo!,
    );
  }


  const unitIds = unitRows.map((u) => u.id);
  if (unitIds.length === 0) return new Set();

  const { data } = await supabase
    .from("textbook_passages")
    .select("code")
    .in("unit_id", unitIds);
  return new Set(((data ?? []) as { code: string }[]).map((r) => r.code));
};

export const resolveNextSentence = async (
  track: DeckTrack = "A",
): Promise<NextSentenceResult> => {
  // DB 지문이 SENTENCES에 머지될 때까지 대기 (실패해도 정적 폴백)
  await hydrateSentencesFromDb();
  const profile = await fetchMyProfile();
  if (!profile) return { sentence: null, profile: null, done: false, track };

  // 선생님이 학생목록에서 지정한 학년(start_level)을 항상 기준으로 삼는다.
  const targetLevel = profile.start_level;

  // pull all passed sentence ids for this user
  const userId = await getCurrentUserId();
  if (!userId) return { sentence: null, profile, done: false, track };
  const { data: passedRows } = await supabase
    .from("sentence_progress")
    .select("sentence_id, status")
    .eq("user_id", userId)
    .is("assignment_id", null) // 현재 회독만
    .in("status", ["pass", "fail"]);
  const passed = new Set(((passedRows ?? []) as { sentence_id: string }[]).map((r) => r.sentence_id));

  // 시작 범위(시리즈/권/유닛) 지정이 있으면 그 code 집합으로 한 번 더 좁힌다.
  const scopedCodes = await fetchScopedPassageCodes(trackScopeOf(profile, track));

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

  // 진도 범위가 지정된 경우 범위가 우선 — 같은 책 안의 다른 레벨 코드 지문도 건너뛰지 않는다.
  let inLevel = scopedCodes
    ? SENTENCES.filter((s) => scopedCodes.has(s.id))
    : SENTENCES.filter((s) => s.level === targetLevel);

  // 지정 범위에 등록된 지문이 0개 → 학습 자료 미준비 상태(완료가 아님)
  if (inLevel.length === 0) {
    return { sentence: null, profile, done: false, noContent: true, track };
  }

  // passage_no는 유닛 안 번호라서, 유닛 순서(unit_no)까지 반영해 정렬
  const orderMeta = await fetchPassageOrderMeta(inLevel.map((s) => s.id));
  inLevel = inLevel
    .slice()
    .sort((a, b) => comparePassageOrder(a.id, b.id, orderMeta));

  const found = inLevel.find((s) => !passed.has(s.id));
  if (found) {
    // current_level/current_no 는 메인덱(A) 진도 지표이므로 서브덱에서는 갱신하지 않는다.
    if (track === "A" && (profile.current_level !== targetLevel || profile.current_no !== found.no)) {
      await updateMyProgress(targetLevel, found.no);
    }
    return {
      sentence: found,
      profile: track === "A" ? { ...profile, current_level: targetLevel, current_no: found.no } : profile,
      done: false,
      track,
    };
  }
  // 지정 범위(시리즈/권)를 모두 끝낸 상태 — 처음(1번)으로 되돌리지 않고 완료로 안내한다.
  return { sentence: null, profile: { ...profile, current_level: targetLevel }, done: true, track };

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
  id: string;
  sentence_id: string | null;
  title: string;
  due_at: string | null;
  created_at: string;
  include_pre: boolean;
  include_analysis: boolean;
  include_translation: boolean;
  include_wordtest: boolean;
  task_mode: string | null;
  round_no?: number | null;
};

type StepFlags = {
  pre: boolean;
  wt: boolean;
  an: boolean;
  tr: boolean;
  mem: boolean;
  status?: string;
};

type ProgRow = {
  sentence_id: string;
  assignment_id: string | null;
  status: string | null;
  pre_done: boolean | null;
  word_test_done: boolean | null;
  analysis_done: boolean | null;
  translation_done: boolean | null;
  mem_passed_at: string | null;
};

const toStepFlags = (r: ProgRow): StepFlags => ({
  pre: !!r.pre_done,
  wt: !!r.word_test_done,
  an: !!r.analysis_done,
  tr: !!r.translation_done,
  mem: !!r.mem_passed_at,
  status: r.status ?? undefined,
});

/** assignment.id 우선, 레거시(null) 진도는 1회독/구과제에만 fallback */
const buildAssignmentProgressLookup = (progRows: ProgRow[]) => {
  const byAssignId = new Map<string, StepFlags>();
  const byNullSentence = new Map<string, StepFlags>();
  progRows.forEach((r) => {
    const pf = toStepFlags(r);
    if (r.assignment_id) byAssignId.set(r.assignment_id, pf);
    else byNullSentence.set(r.sentence_id, pf);
  });
  const getFlags = (a: AssignNavRow): StepFlags | undefined => {
    const hit = byAssignId.get(a.id);
    if (hit) return hit;
    if (a.round_no == null || a.round_no <= 1) {
      return a.sentence_id ? byNullSentence.get(a.sentence_id) : undefined;
    }
    return undefined;
  };
  return getFlags;
};

const ASSIGN_NAV_SELECT =
  "id, sentence_id, title, due_at, created_at, include_pre, include_analysis, include_translation, include_wordtest, task_mode, round_no";

const pickCurrentAssignmentRow = (
  rows: AssignNavRow[],
  sentenceId: string,
  assignmentId?: string | null,
): AssignNavRow | undefined => {
  if (assignmentId) {
    const byId = rows.find((a) => a.id === assignmentId);
    if (byId) return byId;
  }
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

const resolveFirstIncompleteInSameUnit = async (
  currentSentenceId: string,
  allAssignments: AssignNavRow[],
  getFlags: (a: AssignNavRow) => StepFlags | undefined,
): Promise<{ sentence: Sentence; assignmentId: string } | null> => {
  const { data: currentPassage } = await supabase
    .from("textbook_passages")
    .select("unit_id")
    .eq("code", currentSentenceId)
    .maybeSingle();
  const unitId = (currentPassage as { unit_id: string | null } | null)?.unit_id ?? null;
  if (!unitId) return null;

  const { data: unitPassages } = await supabase
    .from("textbook_passages")
    .select("code, passage_no")
    .eq("unit_id", unitId)
    .order("passage_no", { ascending: true });

  const orderedCodes = ((unitPassages ?? []) as { code: string; passage_no: number | null }[])
    .map((p) => p.code);
  const assignmentByCode = new Map<string, AssignNavRow>();
  allAssignments.forEach((a) => {
    if (!a.sentence_id || !orderedCodes.includes(a.sentence_id)) return;
    const prev = assignmentByCode.get(a.sentence_id);
    if (!prev || a.created_at.localeCompare(prev.created_at) > 0) {
      assignmentByCode.set(a.sentence_id, a);
    }
  });

  for (const code of orderedCodes) {
    const row = assignmentByCode.get(code);
    if (!row) continue;
    if (!assignmentSentenceDone(row, getFlags(row))) {
      if (code === currentSentenceId) return null;
      const sentence = await loadSentenceById(code);
      return sentence ? { sentence, assignmentId: row.id } : null;
    }
  }
  return null;
};

/**
 * 특별과제 시퀀스에서 현재보다 앞의 미완료 문장 (순서 이탈 진입 방지).
 * 없으면 null.
 */
export const resolveEarlierIncompleteInAssignment = async (
  currentSentenceId: string,
  currentAssignmentId?: string | null,
): Promise<{ sentence: Sentence; assignmentId: string | null } | null> => {
  const userId = await getCurrentUserId();
  if (!userId) return null;

  const { data: assignData } = await supabase
    .from("assignments")
    .select(ASSIGN_NAV_SELECT)
    .or(`student_id.eq.${userId},student_id.is.null`)
    .not("sentence_id", "is", null);

  const allAssignments = (assignData ?? []) as AssignNavRow[];
  if (!allAssignments.some((a) => a.sentence_id === currentSentenceId)) return null;

  const assignCodes = allAssignments
    .map((a) => a.sentence_id)
    .filter((c): c is string => !!c);
  const orderMeta = await fetchPassageOrderMeta(assignCodes);
  const currentRow = pickCurrentAssignmentRow(
    allAssignments,
    currentSentenceId,
    currentAssignmentId,
  );
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
      "sentence_id, assignment_id, status, pre_done, word_test_done, analysis_done, translation_done, mem_passed_at",
    )
    .eq("user_id", userId)
    .in("sentence_id", assignCodes);

  const getFlags = buildAssignmentProgressLookup((progRows ?? []) as ProgRow[]);

  // 같은 유닛 안에서는 URL/버튼으로 어느 문장에 들어가도 항상 가장 앞의 미완료로 복구한다.
  const unitResume = await resolveFirstIncompleteInSameUnit(
    currentSentenceId,
    allAssignments,
    getFlags,
  );
  if (unitResume) {
    return { sentence: unitResume.sentence, assignmentId: unitResume.assignmentId };
  }

  const currentIdx = groupRows.findIndex((a) =>
    currentAssignmentId
      ? a.id === currentAssignmentId
      : a.sentence_id === currentSentenceId,
  );
  if (currentIdx <= 0) return null;
  const earlier = groupRows.slice(0, currentIdx).find(
    (a) => a.sentence_id && !assignmentSentenceDone(a, getFlags(a)),
  );
  if (!earlier?.sentence_id) return null;
  const sentence = await loadSentenceById(earlier.sentence_id);
  if (!sentence) return null;
  return { sentence, assignmentId: earlier.id };
};

/**
 * 승인·통과 직후 이동 대상.
 * 특별과제(같은 교재 시퀀스) → 같은 유닛 다음 지문 → 일반 진도(resolveNextSentence).
 */
export const resolveNextAfterPass = async (
  currentSentenceId: string,
  currentAssignmentId?: string | null,
): Promise<NextSentenceResult> => {
  await hydrateSentencesFromDb();
  const profile = await fetchMyProfile();
  const userId = await getCurrentUserId();
  if (!userId) return { sentence: null, profile, done: false };

  const { data: assignData } = await supabase
    .from("assignments")
    .select(ASSIGN_NAV_SELECT)
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
        "sentence_id, assignment_id, status, pre_done, word_test_done, analysis_done, translation_done, mem_passed_at",
      )
      .eq("user_id", userId)
      .in("sentence_id", assignCodes);

    const getFlags = buildAssignmentProgressLookup((progRows ?? []) as ProgRow[]);

    const orderMeta = await fetchPassageOrderMeta(assignCodes);

    const currentRow = pickCurrentAssignmentRow(
      allAssignments,
      currentSentenceId,
      currentAssignmentId,
    );
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

    const currentIdx = groupRows.findIndex((a) =>
      currentAssignmentId
        ? a.id === currentAssignmentId
        : a.sentence_id === currentSentenceId,
    );
    // 현재 문장보다 앞의 미완료가 있으면 그곳으로 (순서 이탈 복구)
    const earlierIncomplete =
      currentIdx > 0
        ? groupRows.slice(0, currentIdx).find(
            (a) => a.sentence_id && !assignmentSentenceDone(a, getFlags(a)),
          )
        : undefined;
    if (earlierIncomplete?.sentence_id) {
      const sentence = await loadSentenceById(earlierIncomplete.sentence_id);
      if (sentence) {
        return {
          sentence,
          profile,
          done: false,
          assignmentId: earlierIncomplete.id,
        };
      }
    }

    const nextRow =
      currentIdx >= 0
        ? groupRows.slice(currentIdx + 1).find(
            (a) => a.sentence_id && !assignmentSentenceDone(a, getFlags(a)),
          )
        : groupRows.find(
            (a) =>
              a.sentence_id &&
              a.sentence_id !== currentSentenceId &&
              !assignmentSentenceDone(a, getFlags(a)),
          );
    if (nextRow?.sentence_id && nextRow.sentence_id !== currentSentenceId) {
      const sentence = await loadSentenceById(nextRow.sentence_id);
      if (sentence) {
        return {
          sentence,
          profile,
          done: false,
          assignmentId: nextRow.id,
        };
      }
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
    // 1) 같은 유닛 안 다음 지문
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
      .is("assignment_id", null) // 현재 회독만
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

    // 2) 같은 권(교재)에서 다음 유닛 지문 (시작 유닛 → 권 끝까지 연결)
    const { data: curUnit } = await supabase
      .from("textbook_units")
      .select("id, textbook_id, unit_no")
      .eq("id", curPassage.unit_id)
      .maybeSingle();

    if (curUnit) {
      const tbId = (curUnit as { textbook_id: string }).textbook_id;
      const curNo = (curUnit as { unit_no: number }).unit_no;
      // 두 트랙(메인덱/서브덱) 범위를 합쳐서 판단 — 어느 트랙의 지문이든 이어서 진행
      let scoped: Set<string> | null = null;
      if (profile) {
        const a = await fetchScopedPassageCodes(trackScopeOf(profile, "A"));
        const b = profile.track_b_enabled
          ? await fetchScopedPassageCodes(trackScopeOf(profile, "B"))
          : null;
        if (a && b) scoped = new Set([...a, ...b]);
        else if (a && !profile.track_b_enabled) scoped = a;
        else scoped = null;
      }
      const { data: laterUnits } = await supabase
        .from("textbook_units")
        .select("id, unit_no")
        .eq("textbook_id", tbId)
        .gt("unit_no", curNo)
        .order("unit_no", { ascending: true });

      for (const u of (laterUnits ?? []) as { id: string }[]) {
        const { data: laterPassages } = await supabase
          .from("textbook_passages")
          .select("code")
          .eq("unit_id", u.id)
          .order("passage_no", { ascending: true });
        const laterCodes = ((laterPassages ?? []) as { code: string }[]).map(
          (p) => p.code,
        );
        if (laterCodes.length === 0) continue;

        const { data: laterPassed } = await supabase
          .from("sentence_progress")
          .select("sentence_id")
          .eq("user_id", userId)
          .is("assignment_id", null) // 현재 회독만
          .in("status", ["pass", "fail"])
          .in("sentence_id", laterCodes);
        const laterPassedSet = new Set(
          ((laterPassed ?? []) as { sentence_id: string }[]).map((r) => r.sentence_id),
        );
        for (const code of laterCodes) {
          if (laterPassedSet.has(code)) continue;
          if (scoped && !scoped.has(code)) continue;
          const sentence = await loadSentenceById(code);
          if (sentence) return { sentence, profile, done: false };
        }
      }
    }
  }

  const current = await loadSentenceById(currentSentenceId);
  if (current) await advanceAfterPass(current);
  return resolveNextSentence();
};

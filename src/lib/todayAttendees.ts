// ============================================================
// todayAttendees — 대시보드 「오늘 등원자」 진도 요약
// ============================================================
import { supabase } from "@/integrations/supabase/client";
import {
  assignmentSequenceKey,
  fetchPassageOrderMeta,
} from "@/lib/assignmentSequence";
import {
  classifyAssignmentTrack,
  type AssignmentTrack,
} from "@/lib/assignmentTrack";
import type { StudentProfile } from "@/lib/studentProfile";
import type { UnitWorkflowStatus } from "@/lib/unitWorkflow";
import { LEVEL_LABEL } from "@/lib/levels";

export type WorkflowChip =
  | "learning"
  | "print_pending"
  | "printed"
  | "workbook_submitted"
  | "completed"
  | "none";

export interface AttendeeTrackRow {
  track: AssignmentTrack | "main";
  label: string;
  detail: string;
  /** 0~100, 알 수 없으면 null */
  progressPct: number | null;
  done: number;
  total: number;
}

export interface AttendeeSummary {
  userId: string;
  profile: StudentProfile;
  main: AttendeeTrackRow;
  tracks: AttendeeTrackRow[];
  workflow: WorkflowChip;
  workflowLabel: string;
}

type AssignRow = {
  id: string;
  title: string;
  due_at: string | null;
  sentence_id: string | null;
  student_id: string | null;
  include_pre: boolean;
  include_analysis: boolean;
  include_translation: boolean;
  include_wordtest: boolean;
};

type ProgRow = {
  sentence_id: string;
  assignment_id: string | null;
  status: string | null;
  pre_done: boolean | null;
  word_test_done: boolean | null;
  analysis_done: boolean | null;
  translation_done: boolean | null;
};

const WF_LABEL: Record<WorkflowChip, string> = {
  none: "—",
  learning: "학습중",
  print_pending: "인쇄대기",
  printed: "워크북대기",
  workbook_submitted: "채점대기",
  completed: "완료",
};

function assignmentDone(
  a: AssignRow,
  p: ProgRow | undefined,
): boolean {
  if (!p) return false;
  if (p.status === "pass") return true;
  if (a.include_pre && !p.pre_done) return false;
  if (a.include_wordtest && !p.word_test_done) return false;
  if (a.include_analysis && !p.analysis_done) return false;
  if (a.include_translation && !p.translation_done) return false;
  if (a.include_translation && p.status !== "pass") return false;
  return true;
}

/**
 * 오늘 등원자 목록에 대한 메인덱·과제(내신/특별)·유닛 워크플로 요약.
 */
export async function fetchAttendeeSummaries(
  students: StudentProfile[],
): Promise<AttendeeSummary[]> {
  if (students.length === 0) return [];
  const userIds = students.map((s) => s.user_id);

  const [{ data: personalAssign }, { data: classAssign }, { data: wfData }] =
    await Promise.all([
      supabase
        .from("assignments")
        .select(
          "id, title, due_at, sentence_id, student_id, include_pre, include_analysis, include_translation, include_wordtest",
        )
        .in("student_id", userIds)
        .not("sentence_id", "is", null),
      supabase
        .from("assignments")
        .select(
          "id, title, due_at, sentence_id, student_id, include_pre, include_analysis, include_translation, include_wordtest",
        )
        .is("student_id", null)
        .not("sentence_id", "is", null)
        .limit(300),
      supabase
        .from("unit_workflows")
        .select("user_id, unit_id, status, updated_at")
        .in("user_id", userIds)
        .order("updated_at", { ascending: false }),
    ]);

  const assignments = [
    ...((personalAssign ?? []) as AssignRow[]),
    ...((classAssign ?? []) as AssignRow[]),
  ];
  const relevant = assignments;

  const sentenceIds = [
    ...new Set(
      relevant.map((a) => a.sentence_id).filter((c): c is string => !!c),
    ),
  ];

  const { data: progData } =
    sentenceIds.length > 0
      ? await supabase
          .from("sentence_progress")
          .select(
            "user_id, sentence_id, assignment_id, status, pre_done, word_test_done, analysis_done, translation_done",
          )
          .in("user_id", userIds)
          .in("sentence_id", sentenceIds)
      : { data: [] };

  type ProgWithUser = ProgRow & { user_id: string };
  const progRows = (progData ?? []) as ProgWithUser[];

  const progByUserAssign = new Map<string, ProgRow>();
  const progByUserNull = new Map<string, ProgRow>();
  progRows.forEach((r) => {
    if (r.assignment_id) {
      progByUserAssign.set(`${r.user_id}::${r.assignment_id}`, r);
    } else {
      progByUserNull.set(`${r.user_id}::${r.sentence_id}`, r);
    }
  });

  const orderMeta =
    sentenceIds.length > 0
      ? await fetchPassageOrderMeta(sentenceIds)
      : new Map();

  // 최신 워크플로만 (user 당 1)
  const latestWf = new Map<string, UnitWorkflowStatus>();
  (
    (wfData ?? []) as {
      user_id: string;
      status: UnitWorkflowStatus;
    }[]
  ).forEach((r) => {
    if (!latestWf.has(r.user_id)) latestWf.set(r.user_id, r.status);
  });

  return students.map((profile) => {
    const uid = profile.user_id;
    const levelLabel =
      LEVEL_LABEL[profile.current_level as keyof typeof LEVEL_LABEL] ??
      profile.current_level;
    const main: AttendeeTrackRow = {
      track: "main",
      label: "메인덱",
      detail: `${levelLabel} · #${profile.current_no}`,
      progressPct: null,
      done: 0,
      total: 0,
    };

    const mine = relevant.filter(
      (a) => !a.student_id || a.student_id === uid,
    );

    // 시퀀스 그룹
    const groupMap = new Map<string, AssignRow[]>();
    mine.forEach((a) => {
      if (!a.sentence_id) return;
      const tb = orderMeta.get(a.sentence_id)?.textbook_id ?? null;
      const key = assignmentSequenceKey({
        title: a.title,
        textbookId: tb,
      });
      const list = groupMap.get(key) ?? [];
      list.push(a);
      groupMap.set(key, list);
    });

    const tracks: AttendeeTrackRow[] = [];
    for (const [, rows] of groupMap) {
      const head = rows[0];
      const track = classifyAssignmentTrack({
        title: head.title,
        groupSize: rows.length,
      });
      let done = 0;
      rows.forEach((a) => {
        const p =
          progByUserAssign.get(`${uid}::${a.id}`) ??
          (a.sentence_id
            ? progByUserNull.get(`${uid}::${a.sentence_id}`)
            : undefined);
        if (assignmentDone(a, p)) done += 1;
      });
      const total = rows.length;
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      // 전부 완료된 시퀀스는 대시보드에서 숨김
      if (done >= total && total > 0) continue;
      tracks.push({
        track,
        label: track === "naeshin" ? "내신" : "특별과제",
        detail: head.title,
        progressPct: pct,
        done,
        total,
      });
    }

    // 내신 먼저, 특별 나중
    tracks.sort((a, b) => {
      if (a.track === b.track) return 0;
      return a.track === "naeshin" ? -1 : 1;
    });

    const wfStatus = latestWf.get(uid);
    const workflow: WorkflowChip = (wfStatus as WorkflowChip) ?? "none";

    return {
      userId: uid,
      profile,
      main,
      tracks,
      workflow,
      workflowLabel: WF_LABEL[workflow] ?? "—",
    };
  });
}

export function workflowHref(chip: WorkflowChip): string {
  if (chip === "print_pending") return "/teacher/inbox";
  if (
    chip === "workbook_submitted" ||
    chip === "completed" ||
    chip === "printed"
  ) {
    return "/teacher/results";
  }
  return "/teacher/results";
}

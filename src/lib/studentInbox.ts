// ============================================================
// studentInbox.ts — 학생 알림함의 재학습 알림 상태
//   · 재학습 알림은 '확인'이 아니라 실제 재제출로 끝난다.
//   · 알림 이후 같은 문장에 새 제출(sentence_approvals.requested_at)이 있으면 '완료'.
//   · 아직 재학습 잠금(sentence_progress.redo_requested_at)이 걸려 있으면 '대기' — 읽음이어도 현재 알림에 남는다.
// ============================================================
import { supabase } from "@/integrations/supabase/client";
import { getCurrentUserId } from "@/lib/authState";
import { fetchAllPages, fetchInChunks } from "@/lib/paginatedQuery";
import { isRedoNotification } from "@/lib/redoNotifications";
import {
  fetchMyNotifications,
  fetchMyUnreadNotifications,
  type StudentNotification,
} from "@/lib/studentNotifications";

export type RedoStatus = "pending" | "done";

export interface RedoEvidence {
  /** 학생의 제출 기록 (문장별 제출 시각) */
  submissions: { sentence_id: string; requested_at: string }[];
  /** 아직 재학습 잠금이 걸린 문장 */
  flaggedSentenceIds: Set<string>;
}

/** 순수 규칙: 재학습 알림별 상태. 상태가 없는 알림은 일반 알림처럼 읽음 여부로 분류한다. */
export const classifyRedoNotifications = (
  rows: StudentNotification[],
  evidence: RedoEvidence,
): Map<string, RedoStatus> => {
  const latestSubmit = new Map<string, number>();
  for (const s of evidence.submissions) {
    const t = Date.parse(s.requested_at);
    if (Number.isNaN(t)) continue;
    if (t > (latestSubmit.get(s.sentence_id) ?? -Infinity)) latestSubmit.set(s.sentence_id, t);
  }
  const status = new Map<string, RedoStatus>();
  const newestPending = new Map<string, StudentNotification>();
  for (const n of rows) {
    if (!n.sentence_id || !isRedoNotification(n)) continue;
    const created = Date.parse(n.created_at);
    const submitted = latestSubmit.get(n.sentence_id);
    if (submitted !== undefined && submitted > created) {
      status.set(n.id, "done");
    } else if (evidence.flaggedSentenceIds.has(n.sentence_id)) {
      const prev = newestPending.get(n.sentence_id);
      if (!prev || Date.parse(prev.created_at) < created) newestPending.set(n.sentence_id, n);
    }
  }
  // 같은 문장에 재학습 알림이 여러 개면 가장 최근 것 하나만 '대기'로 남긴다.
  for (const n of newestPending.values()) status.set(n.id, "pending");
  return status;
};

const fetchRedoEvidence = async (userId: string, sentenceIds: string[]): Promise<RedoEvidence> => {
  const [submissions, flagged] = await Promise.all([
    fetchInChunks(sentenceIds, (ids) =>
      fetchAllPages<{ sentence_id: string; requested_at: string }>((from, to) =>
        supabase
          .from("sentence_approvals")
          .select("sentence_id, requested_at")
          .eq("user_id", userId)
          .in("sentence_id", ids)
          .order("id")
          .range(from, to),
      ),
    ),
    fetchInChunks(sentenceIds, (ids) =>
      fetchAllPages<{ sentence_id: string }>((from, to) =>
        supabase
          .from("sentence_progress")
          .select("sentence_id")
          .eq("user_id", userId)
          .in("sentence_id", ids)
          .not("redo_requested_at", "is", null)
          .order("id")
          .range(from, to),
      ),
    ),
  ]);
  return { submissions, flaggedSentenceIds: new Set(flagged.map((r) => r.sentence_id)) };
};

/** 이미 확인(읽음)했지만 아직 끝나지 않았을 수 있는 재학습 알림 후보 */
const fetchMyReadRedoCandidates = async (userId: string): Promise<StudentNotification[]> => {
  const { data, error } = await supabase
    .from("student_notifications")
    .select("*")
    .eq("user_id", userId)
    .neq("kind", "teaching")
    .not("sentence_id", "is", null)
    .not("read_at", "is", null)
    .or("grade.in.(redo,coach),kind.eq.retest,title.ilike.*재학습*,title.ilike.*추가학습*")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return ((data ?? []) as StudentNotification[]).filter(isRedoNotification);
};

const mergeRows = (...lists: StudentNotification[][]): StudentNotification[] => {
  const byId = new Map<string, StudentNotification>();
  for (const list of lists) for (const n of list) byId.set(n.id, n);
  return [...byId.values()].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
};

/** 재제출이 끝난 재학습 알림은 읽음으로 정리 (실패해도 화면 분류는 상태 기준이라 그대로 맞다). */
const markDoneRedosRead = async (rows: StudentNotification[], status: Map<string, RedoStatus>) => {
  const ids = rows.filter((n) => !n.read_at && status.get(n.id) === "done").map((n) => n.id);
  if (ids.length === 0) return;
  const { error } = await supabase
    .from("student_notifications")
    .update({ read_at: new Date().toISOString() })
    .in("id", ids);
  if (error) console.warn("[studentInbox] done redo mark-read failed", error);
};

const withRedoStatus = async (userId: string, rows: StudentNotification[]) => {
  const sentenceIds = rows
    .filter((n) => n.sentence_id && isRedoNotification(n))
    .map((n) => n.sentence_id!);
  const status = sentenceIds.length
    ? classifyRedoNotifications(rows, await fetchRedoEvidence(userId, sentenceIds))
    : new Map<string, RedoStatus>();
  void markDoneRedosRead(rows, status);
  return status;
};

/** 알림함 '현재 알림' 여부 — 재학습 대기는 읽음이어도 남고, 재학습 완료는 바로 지난 알림으로 간다. */
export const isCurrentNotification = (n: StudentNotification, status: Map<string, RedoStatus>) => {
  const s = status.get(n.id);
  if (s === "pending") return true;
  if (s === "done") return false;
  return !n.read_at;
};

export interface ActiveInbox {
  /** 현재 알림 (배지 숫자) */
  active: StudentNotification[];
  /** 처음 도착해 아직 읽지 않은 알림 (도착 팝업용) */
  unread: StudentNotification[];
  /** 아직 다시 제출하지 않은 재학습 */
  pendingRedos: StudentNotification[];
}

export const fetchMyActiveInbox = async (): Promise<ActiveInbox> => {
  const uid = await getCurrentUserId();
  if (!uid) return { active: [], unread: [], pendingRedos: [] };
  const [unreadRows, candidates] = await Promise.all([
    fetchMyUnreadNotifications(),
    fetchMyReadRedoCandidates(uid),
  ]);
  const rows = mergeRows(unreadRows, candidates);
  const status = await withRedoStatus(uid, rows);
  const active = rows.filter((n) => isCurrentNotification(n, status));
  return {
    active,
    unread: active.filter((n) => !n.read_at),
    pendingRedos: active.filter((n) => status.get(n.id) === "pending"),
  };
};

export const fetchMyInboxWithStatus = async (
  limit = 200,
): Promise<{ rows: StudentNotification[]; status: Map<string, RedoStatus> }> => {
  const uid = await getCurrentUserId();
  if (!uid) return { rows: [], status: new Map() };
  const [recent, candidates] = await Promise.all([
    fetchMyNotifications(limit),
    fetchMyReadRedoCandidates(uid),
  ]);
  const rows = mergeRows(recent, candidates);
  return { rows, status: await withRedoStatus(uid, rows) };
};

/** 학생이 문장을 제출한 직후 알림함/배너를 즉시 다시 계산하게 한다. */
export const NOTIFICATIONS_REFRESH_EVENT = "gwj:notifications-refresh";
export const requestNotificationsRefresh = () => {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(NOTIFICATIONS_REFRESH_EVENT));
};

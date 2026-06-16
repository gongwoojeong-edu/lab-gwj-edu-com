// ============================================================
// sentenceApprovals.ts — 한글해석 제출 후 선생님 승인 게이트 CRUD + 구독
// ============================================================
import { supabase } from "@/integrations/supabase/client";
import { getCurrentUserId } from "@/lib/authState";

export type ApprovalGrade = "excellent" | "good" | "fair" | "poor" | "redo";
export type ApprovalStatus = "pending" | "approved";

export const GRADE_LABEL: Record<ApprovalGrade, string> = {
  excellent: "매우잘함",
  good: "잘함",
  fair: "보통",
  poor: "미흡",
  redo: "재학습",
};

export const GRADE_BADGE_CLASS: Record<ApprovalGrade, string> = {
  excellent: "bg-emerald-500 text-white border-emerald-600",
  good: "bg-sky-500 text-white border-sky-600",
  fair: "bg-amber-500 text-white border-amber-600",
  poor: "bg-orange-500 text-white border-orange-600",
  redo: "bg-rose-500 text-white border-rose-600",
};

export const GRADE_ORDER: ApprovalGrade[] = ["excellent", "good", "fair", "poor", "redo"];

export interface SentenceApproval {
  id: string;
  user_id: string;
  sentence_id: string;
  attempt_no: number;
  status: ApprovalStatus;
  grade: ApprovalGrade | null;
  memo: string | null;
  approved_by: string | null;
  requested_at: string;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

/** 본 학생의 해당 문장 최신 행 (status 무관) */
export const fetchLatestApproval = async (
  sentenceId: string,
  userId?: string,
): Promise<SentenceApproval | null> => {
  const uid = userId ?? (await getCurrentUserId());
  if (!uid) return null;
  const { data } = await supabase
    .from("sentence_approvals")
    .select("*")
    .eq("user_id", uid)
    .eq("sentence_id", sentenceId)
    .order("attempt_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as SentenceApproval) ?? null;
};

/** 학생: 새 승인 요청 생성. 이미 pending 행이 있으면 그대로 반환. */
export const createApprovalRequest = async (
  sentenceId: string,
): Promise<SentenceApproval> => {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("로그인이 필요합니다");

  const latest = await fetchLatestApproval(sentenceId, userId);
  if (latest && latest.status === "pending") return latest;

  const nextAttempt = (latest?.attempt_no ?? 0) + 1;
  const { data, error } = await supabase
    .from("sentence_approvals")
    .insert({
      user_id: userId,
      sentence_id: sentenceId,
      attempt_no: nextAttempt,
      status: "pending",
    })
    .select()
    .single();
  if (error) throw error;
  return data as SentenceApproval;
};

/** 선생님(또는 PIN 통과 후 현재 세션): 승인 + 등급/메모 기록.
 *  학원 공용 PC 트래픽 패턴 — 학생 세션에서 RLS 정책으로 자기 행을 approved 로 전환 가능.
 *  동시에 sentence_progress 의 status=pass, last_grade/last_memo 갱신. */
export const approveSentenceRequest = async (input: {
  approvalId: string;
  sentenceId: string;
  grade: ApprovalGrade;
  memo?: string;
  /** 대상 학생 user_id. 선생님이 승인하는 경우 반드시 전달.
   *  미전달 시 현재 세션 사용자(학생 본인 PIN 흐름)로 폴백. */
  studentUserId?: string;
}): Promise<void> => {
  const approverId = await getCurrentUserId();
  const nowIso = new Date().toISOString();

  // 1) 승인 행 갱신
  const { error: apErr } = await supabase
    .from("sentence_approvals")
    .update({
      status: "approved",
      grade: input.grade,
      memo: input.memo?.trim() || null,
      approved_by: approverId,
      approved_at: nowIso,
    })
    .eq("id", input.approvalId);
  if (apErr) throw apErr;

  // 2) sentence_progress 마지막 등급/메모 반영
  //    redo 등급은 PASS 처리하지 않고 fail 로 돌려보냄 (학생 재시도).
  const isPass = input.grade !== "redo";
  const targetUserId = input.studentUserId ?? approverId;
  if (!targetUserId) return;

  const baseUpdate = {
    last_grade: input.grade as string,
    last_memo: (input.memo?.trim() || null) as string | null,
  };
  const update = isPass
    ? {
        ...baseUpdate,
        status: "pass",
        passed_at: nowIso,
        translation_done: true,
        analysis_done: true,
        word_test_done: true,
      }
    : { ...baseUpdate, status: "fail" };

  await supabase
    .from("sentence_progress")
    .update(update)
    .eq("user_id", targetUserId)
    .eq("sentence_id", input.sentenceId);
};

/** 선생님 대시보드: pending 상태 전체 목록 */
export const fetchPendingApprovals = async (): Promise<SentenceApproval[]> => {
  const { data, error } = await supabase
    .from("sentence_approvals")
    .select("*")
    .eq("status", "pending")
    .order("requested_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as SentenceApproval[];
};

/** 선생님 대시보드 실시간 구독: 모든 변동 시 콜백 */
export const subscribeAllApprovals = (onChange: () => void) => {
  const channel = supabase
    .channel(`sa_all_${Math.random().toString(36).slice(2)}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "sentence_approvals" },
      () => onChange(),
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
};

/** 학생 화면용: 본인 해당 문장 변동 실시간 구독 */
export const subscribeMyApproval = (
  sentenceId: string,
  userId: string,
  onChange: (row: SentenceApproval) => void,
) => {
  const channel = supabase
    .channel(`sa_my_${sentenceId}_${Math.random().toString(36).slice(2)}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "sentence_approvals",
        filter: `sentence_id=eq.${sentenceId}`,
      },
      (payload) => {
        const row = (payload.new ?? payload.old) as SentenceApproval;
        if (row && row.user_id === userId) onChange(row);
      },
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
};

/** 캘린더용: 특정 사용자/기간 승인 행 일괄 조회 */
export const fetchApprovalsForUserInRange = async (
  userId: string,
  startIso: string,
  endIso: string,
): Promise<SentenceApproval[]> => {
  const { data } = await supabase
    .from("sentence_approvals")
    .select("*")
    .eq("user_id", userId)
    .gte("requested_at", startIso)
    .lt("requested_at", endIso);
  return (data ?? []) as SentenceApproval[];
};

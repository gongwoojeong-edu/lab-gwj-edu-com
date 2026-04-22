// ============================================================
// analysisReview.ts — 자기 첨삭(정답 대조) 요청 CRUD + 트랙 판정 + 실시간 구독
// ============================================================
import { supabase } from "@/integrations/supabase/client";

export type ReviewStatus = "pending" | "approved" | "rejected" | "cancelled";
export type ReviewTrack = "normal" | "fail_assist";

export interface AnalysisReviewRequest {
  id: string;
  user_id: string;
  sentence_id: string;
  attempt_no: number;
  analysis_rate: number;
  required_filled: boolean;
  track: ReviewTrack;
  status: ReviewStatus;
  requested_at: string;
  responded_at: string | null;
  responded_by: string | null;
  response_note: string | null;
  created_at: string;
  updated_at: string;
}

/** 트랙 판정: 정상 트랙 / 미통 보조 / 불가
 *  - hold(마스터 미등록 상태)는 학생이 50% 이상 분석했으면 normal 트랙으로 요청 가능. */
export const decideTrack = (input: {
  rate: number;
  requiredFilled: boolean;
  sentenceStatus: "pending" | "pass" | "fail" | "hold";
}): ReviewTrack | null => {
  if (input.rate >= 0.8 && input.requiredFilled) return "normal";
  if (input.rate >= 0.5 && input.sentenceStatus === "fail") return "fail_assist";
  if (input.rate >= 0.5 && input.sentenceStatus === "hold") return "normal";
  return null;
};

/** 현재 학생의 미해결(대기/승인) 요청 — 한 번에 하나만 존재 */
export const fetchOpenRequest = async (
  sentenceId: string,
  attemptNo: number,
): Promise<AnalysisReviewRequest | null> => {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return null;
  const { data } = await supabase
    .from("analysis_review_requests")
    .select("*")
    .eq("user_id", u.user.id)
    .eq("sentence_id", sentenceId)
    .eq("attempt_no", attemptNo)
    .in("status", ["pending", "approved"])
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as AnalysisReviewRequest) ?? null;
};

/** 학생: 정답 대조 요청 생성 */
export const createReviewRequest = async (input: {
  sentence_id: string;
  attempt_no: number;
  analysis_rate: number;
  required_filled: boolean;
  track: ReviewTrack;
}): Promise<AnalysisReviewRequest | null> => {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return null;
  const { data, error } = await supabase
    .from("analysis_review_requests")
    .insert({
      user_id: u.user.id,
      sentence_id: input.sentence_id,
      attempt_no: input.attempt_no,
      analysis_rate: input.analysis_rate,
      required_filled: input.required_filled,
      track: input.track,
      status: "pending",
    })
    .select()
    .single();
  if (error) throw error;
  return data as AnalysisReviewRequest;
};

/** 학생: 본인 요청 취소 */
export const cancelReviewRequest = async (id: string): Promise<void> => {
  await supabase
    .from("analysis_review_requests")
    .update({ status: "cancelled", responded_at: new Date().toISOString() })
    .eq("id", id);
};

/** 선생님: 요청 승인 */
export const approveReviewRequest = async (id: string, note?: string): Promise<void> => {
  const { data: u } = await supabase.auth.getUser();
  await supabase
    .from("analysis_review_requests")
    .update({
      status: "approved",
      responded_at: new Date().toISOString(),
      responded_by: u.user?.id ?? null,
      response_note: note ?? null,
    })
    .eq("id", id);
};

/** 선생님: 요청 거절 */
export const rejectReviewRequest = async (id: string, note?: string): Promise<void> => {
  const { data: u } = await supabase.auth.getUser();
  await supabase
    .from("analysis_review_requests")
    .update({
      status: "rejected",
      responded_at: new Date().toISOString(),
      responded_by: u.user?.id ?? null,
      response_note: note ?? null,
    })
    .eq("id", id);
};

/** 선생님: 모든 pending 요청 목록 (오래된 순, 미통 보조 우선) */
export const fetchPendingRequests = async (): Promise<AnalysisReviewRequest[]> => {
  const { data } = await supabase
    .from("analysis_review_requests")
    .select("*")
    .eq("status", "pending")
    .order("requested_at", { ascending: true });
  const rows = (data ?? []) as AnalysisReviewRequest[];
  // fail_assist 우선
  return rows.sort((a, b) => {
    if (a.track !== b.track) return a.track === "fail_assist" ? -1 : 1;
    return a.requested_at.localeCompare(b.requested_at);
  });
};

/** 선생님: 모든 pending 일괄 승인 */
export const approveAllPending = async (): Promise<number> => {
  const list = await fetchPendingRequests();
  const { data: u } = await supabase.auth.getUser();
  if (list.length === 0) return 0;
  const ids = list.map((r) => r.id);
  await supabase
    .from("analysis_review_requests")
    .update({
      status: "approved",
      responded_at: new Date().toISOString(),
      responded_by: u.user?.id ?? null,
    })
    .in("id", ids);
  return ids.length;
};

/** 선생님 대시보드용 실시간 구독 */
export const subscribeToReviewRequests = (
  onChange: (event: "INSERT" | "UPDATE" | "DELETE", row: AnalysisReviewRequest) => void,
) => {
  const channel = supabase
    .channel(`analysis_review_requests_dashboard_${Math.random().toString(36).slice(2)}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "analysis_review_requests" },
      (payload) => {
        const row = (payload.new ?? payload.old) as AnalysisReviewRequest;
        onChange(payload.eventType as "INSERT" | "UPDATE" | "DELETE", row);
      },
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
};

/** 학생용: 본인 요청 상태 변화 구독 (sentence별) */
export const subscribeMyRequest = (
  sentenceId: string,
  attemptNo: number,
  onChange: (row: AnalysisReviewRequest) => void,
) => {
  const channel = supabase
    .channel(`arr_my_${sentenceId}_${attemptNo}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "analysis_review_requests",
        filter: `sentence_id=eq.${sentenceId}`,
      },
      (payload) => {
        const row = (payload.new ?? payload.old) as AnalysisReviewRequest;
        if (row && row.attempt_no === attemptNo) onChange(row);
      },
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
};

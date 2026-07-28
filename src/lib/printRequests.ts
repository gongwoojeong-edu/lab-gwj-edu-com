// ============================================================
// printRequests.ts — 학생 → 선생님 시험지(핸드아웃) 인쇄 요청
// kind='handout' (시험지) 또는 'analysis' (분석자료 PDF)로 구분.
// ============================================================
import { supabase } from "@/integrations/supabase/client";
import { getCurrentUserId } from "@/lib/authState";

export type PrintRequestStatus = "pending" | "printed" | "canceled";
export type PrintRequestKind = "handout" | "analysis";

export interface PrintRequest {
  id: string;
  user_id: string;
  teacher_id: string | null;
  sentence_id: string;
  status: PrintRequestStatus;
  kind: PrintRequestKind;
  file_url: string | null;
  note: string | null;
  requested_at: string;
  handled_at: string | null;
  handled_by: string | null;
  created_at: string;
  updated_at: string;
}

/** 학생: 본인 + 특정 지문의 pending 요청 1건 (kind 옵션, 기본 handout) */
export const fetchMyPendingPrintRequest = async (
  sentenceId: string,
  kind: PrintRequestKind = "handout",
): Promise<PrintRequest | null> => {
  const userId = await getCurrentUserId();
  if (!userId) return null;
  const { data } = await supabase
    .from("print_requests")
    .select("*")
    .eq("user_id", userId)
    .eq("sentence_id", sentenceId)
    .eq("status", "pending")
    .eq("kind", kind)
    .maybeSingle();
  return (data as PrintRequest) ?? null;
};

/** 학생: 본인의 모든 pending 요청 — 카드 일괄 표시용 */
export const fetchMyPendingPrintRequests = async (): Promise<PrintRequest[]> => {
  const userId = await getCurrentUserId();
  if (!userId) return [];
  const { data } = await supabase
    .from("print_requests")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "pending");
  return (data ?? []) as PrintRequest[];
};

/** 학생: 시험지 요청 생성 (kind 기본 handout) */
export const createPrintRequest = async (input: {
  sentence_id: string;
  note?: string;
  kind?: PrintRequestKind;
  file_url?: string | null;
}): Promise<PrintRequest> => {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("not authenticated");
  // teacher_id 채우기 (있으면)
  const { data: prof } = await supabase
    .from("student_profiles")
    .select("teacher_id")
    .eq("user_id", userId)
    .maybeSingle();
  const { data, error } = await supabase
    .from("print_requests")
    .insert({
      user_id: userId,
      sentence_id: input.sentence_id,
      teacher_id: prof?.teacher_id ?? null,
      note: input.note ?? null,
      status: "pending",
      kind: input.kind ?? "handout",
      file_url: input.file_url ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as PrintRequest;
};

/** 학생: 분석자료 PDF 인쇄 요청 헬퍼 */
export const createAnalysisPrintRequest = async (
  sentenceId: string,
  fileUrl: string,
): Promise<PrintRequest> =>
  createPrintRequest({
    sentence_id: sentenceId,
    kind: "analysis",
    file_url: fileUrl,
  });

/** 학생: 본인 요청 취소 — RLS는 staff만 update 허용이므로, 본인은 delete로 처리 */
export const cancelMyPrintRequest = async (id: string): Promise<void> => {
  await supabase.from("print_requests").delete().eq("id", id);
};

/** 선생님: pending 목록 (오래된 순) */
export const fetchPendingPrintRequests = async (): Promise<PrintRequest[]> => {
  const { data } = await supabase
    .from("print_requests")
    .select("*")
    .eq("status", "pending")
    .order("requested_at", { ascending: true });
  return (data ?? []) as PrintRequest[];
};

/** 선생님: 처리완료(printed) 목록 (최신순, 최근 N건) */
export const fetchHandledPrintRequests = async (limit = 100): Promise<PrintRequest[]> => {
  const { data } = await supabase
    .from("print_requests")
    .select("*")
    .eq("status", "printed")
    .order("handled_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as PrintRequest[];
};

/** 선생님: 요청 삭제 (테스트/실수 데이터 정리용) */
export const deletePrintRequest = async (id: string): Promise<void> => {
  const { error } = await supabase.from("print_requests").delete().eq("id", id);
  if (error) throw error;
};

/** 선생님: 처리 완료(인쇄됨) */
export const markPrintRequestHandled = async (id: string): Promise<void> => {
  const userId = await getCurrentUserId();
  await supabase
    .from("print_requests")
    .update({
      status: "printed",
      handled_at: new Date().toISOString(),
      handled_by: userId,
    })
    .eq("id", id);
};

/** 선생님: 처리완료 취소 → pending 으로 되돌리기 */
export const unmarkPrintRequestHandled = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from("print_requests")
    .update({
      status: "pending",
      handled_at: null,
      handled_by: null,
    })
    .eq("id", id);
  if (error) throw error;
};

/** 실시간 구독 (선생님 대시보드/사이드바 뱃지용) */
export const subscribeToPrintRequests = (
  onChange: (event: "INSERT" | "UPDATE" | "DELETE", row: PrintRequest) => void,
) => {
  const channel = supabase
    .channel(`print_requests_${Math.random().toString(36).slice(2)}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "print_requests" },
      (payload) => {
        const row = (payload.new ?? payload.old) as PrintRequest;
        onChange(payload.eventType as "INSERT" | "UPDATE" | "DELETE", row);
      },
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
};

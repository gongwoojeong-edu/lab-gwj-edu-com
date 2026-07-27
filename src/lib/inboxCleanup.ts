import { supabase } from "@/integrations/supabase/client";

/** 한국 기준 2026-07-01 00:00 (KST) = 2026-06-30T15:00:00.000Z */
export const INBOX_KEEP_FROM_ISO = "2026-06-30T15:00:00.000Z";

export type InboxCleanupResult = {
  printRequests: number;
  reviewRequests: number;
  materialViews: number;
  unitPrintPending: number;
};

type DelClient = {
  from: (table: string) => {
    delete: () => {
      lt: (col: string, val: string) => {
        select: (cols: string) => Promise<{
          data: unknown[] | null;
          error: { message: string } | null;
        }>;
        eq: (col: string, val: string) => {
          lt: (col: string, val: string) => {
            select: (cols: string) => Promise<{
              data: unknown[] | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
      eq: (col: string, val: string) => {
        lt: (col: string, val: string) => {
          select: (cols: string) => Promise<{
            data: unknown[] | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
};

/**
 * 요청확인함에서 기준일 이전 내역 영구 삭제.
 * - 시험지/분석자료 인쇄 요청 (대기·완료 모두)
 * - 정답보기 요청 (대기·승인·반려)
 * - 자료열람 요청
 * - 유닛 인쇄 대기(print_pending)만 — 이미 인쇄된 워크플로는 학습 상태 보존
 */
export async function cleanupInboxBefore(
  beforeIso: string = INBOX_KEEP_FROM_ISO,
): Promise<InboxCleanupResult> {
  const db = supabase as unknown as DelClient;
  const result: InboxCleanupResult = {
    printRequests: 0,
    reviewRequests: 0,
    materialViews: 0,
    unitPrintPending: 0,
  };

  {
    const { data, error } = await supabase
      .from("print_requests")
      .delete()
      .lt("requested_at", beforeIso)
      .select("id");
    if (error) throw error;
    result.printRequests = data?.length ?? 0;
  }

  {
    const { data, error } = await supabase
      .from("analysis_review_requests")
      .delete()
      .lt("requested_at", beforeIso)
      .select("id");
    if (error) throw error;
    result.reviewRequests = data?.length ?? 0;
  }

  {
    const { data, error } = await db
      .from("material_view_requests")
      .delete()
      .lt("requested_at", beforeIso)
      .select("id");
    if (error) throw error;
    result.materialViews = data?.length ?? 0;
  }

  {
    const { data, error } = await db
      .from("unit_workflows")
      .delete()
      .eq("status", "print_pending")
      .lt("print_requested_at", beforeIso)
      .select("user_id");
    if (error) throw error;
    result.unitPrintPending = data?.length ?? 0;
  }

  return result;
}

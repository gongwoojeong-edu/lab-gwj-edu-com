import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ maybeSingle: vi.fn(), upsert: vi.fn() }));
vi.mock("@/lib/authState", () => ({ getCurrentUserId: async () => "student-1" }));
vi.mock("@/integrations/supabase/storage", () => ({ upsertSentenceProgress: mocks.upsert }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => {
  const q = { select: () => q, eq: () => q, is: () => q, maybeSingle: mocks.maybeSingle };
  return q;
} } }));
import { applyApprovalToMyProgress, type SentenceApproval } from "@/lib/sentenceApprovals";
const approval: SentenceApproval = {
  id: "a1", user_id: "student-1", sentence_id: "s1", attempt_no: 1, status: "approved", grade: "coach",
  memo: null, approved_by: "teacher", requested_at: "2026-11-07", approved_at: "2026-11-07", created_at: "2026-11-07", updated_at: "2026-11-07",
};
it("수업 코칭 재학습 요청은 학생이 승인 기록을 읽어도 통과로 덮이지 않는다", async () => {
  mocks.upsert.mockClear();
  mocks.maybeSingle.mockResolvedValueOnce({ data: { redo_requested_at: "2026-11-07" }, error: null });
  await applyApprovalToMyProgress(approval);
  expect(mocks.upsert).not.toHaveBeenCalled();
});
it("일반 코칭 승인은 기존처럼 통과 처리한다", async () => {
  mocks.upsert.mockClear();
  mocks.maybeSingle.mockResolvedValueOnce({ data: { redo_requested_at: null }, error: null });
  await applyApprovalToMyProgress(approval);
  expect(mocks.upsert).toHaveBeenCalledWith("s1", expect.objectContaining({ status: "pass", redo_requested_at: null }));
});
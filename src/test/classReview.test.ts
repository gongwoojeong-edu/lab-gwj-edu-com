import { describe, expect, it, vi } from "vitest";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
import { completeClassReviewAttendance, groupBySentence, scopeClassReview, setClassReviewStatus } from "@/lib/classReview";

const rows = [
  { teacher_id: "t1", created_by: "t1" },
  { teacher_id: "t2", created_by: "t1" },
  { teacher_id: "t2", created_by: "t2" },
];

describe("수업 완료 코칭 재학습", () => {
  it("같은 수업을 들은 추가 학생 모두를 중복 없이 전달한다", async () => {
    rpc.mockResolvedValueOnce({ data: 2, error: null });
    await completeClassReviewAttendance(["sentence-item", "sentence-item"], ["original-student", "additional-student", "additional-student"]);
    expect(rpc).toHaveBeenLastCalledWith("complete_class_review_attendance", { p_ids: ["sentence-item"], p_student_ids: ["original-student", "additional-student"] });
  });
  it("참여 학생 없이 수업 완료하지 않는다", async () => {
    await expect(completeClassReviewAttendance(["item"], [])).rejects.toThrow("참여 학생");
  });
  it("선택한 모든 학생 항목을 중복 없이 원자적 코칭 재학습 처리에 전달한다", async () => {
    rpc.mockResolvedValueOnce({ data: 2, error: null });
    await setClassReviewStatus(["student-item-1", "student-item-2", "student-item-1"], "done");
    expect(rpc).toHaveBeenLastCalledWith("complete_class_review_coaching", { p_ids: ["student-item-1", "student-item-2"] });
  });
  it("코칭 재학습 실패를 완료 성공으로 처리하지 않는다", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: new Error("새 제출이 있습니다") });
    await expect(setClassReviewStatus(["student-item-1"], "done")).rejects.toThrow("새 제출이 있습니다");
  });
});

describe("수업 자료함 열람 범위", () => {
  it("선생님은 본인 담당만 본다", () => {
    expect(scopeClassReview(rows, "t1", false)).toHaveLength(1);
  });
  it("관리자는 전체를 본다", () => {
    expect(scopeClassReview(rows, "a", true)).toHaveLength(3);
  });
});

describe("같은 문장 묶기", () => {
  it("같은 문장을 여러 학생이 담으면 하나로 묶고 학생 수를 센다", () => {
    const base = { approval_id: null, teacher_id: "t1", note: null, status: "open" as const, done_at: null, created_at: "2026-11-07" };
    const g = groupBySentence([
      { ...base, id: "1", sentence_id: "s1", user_id: "u1" },
      { ...base, id: "2", sentence_id: "s1", user_id: "u2" },
      { ...base, id: "3", sentence_id: "s2", user_id: "u1" },
    ]);
    expect(g).toHaveLength(2);
    expect(g.find(x => x.sentenceId === "s1")?.studentIds).toHaveLength(2);
  });
});

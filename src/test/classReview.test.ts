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

describe("수업 지정 제출은 승인 대기에서 빠진다", () => {
  const a = (id: string, requested_at = "2026-11-09T01:00:00Z") => ({ id, sentence_id: "s1", user_id: "u1", requested_at });
  it("수업으로 담은 제출은 승인 대기에서 사라진다", async () => {
    const { excludeClassQueued } = await import("@/lib/classReview");
    const marks = [{ approval_id: "ap1", sentence_id: "s1", user_id: "u1", created_at: "2026-11-09T02:00:00Z" }];
    expect(excludeClassQueued([a("ap1"), a("ap2")], marks).map(r => r.id)).toEqual(["ap2"]);
  });
  it("수업 지정 이후 새로 제출한 것은 다시 보인다", async () => {
    const { excludeClassQueued } = await import("@/lib/classReview");
    const marks = [{ approval_id: null, sentence_id: "s1", user_id: "u1", created_at: "2026-11-09T02:00:00Z" }];
    expect(excludeClassQueued([a("old"), a("new", "2026-11-09T03:00:00Z")], marks).map(r => r.id)).toEqual(["new"]);
  });
});

import { classReviewCoachMemo, filterGroupsByStudent } from "@/lib/classReview";
describe("수업 담기 코칭 멘트", () => {
  it("써 둔 코칭 멘트는 저장 형식과 알림용 평문으로 함께 담는다", () => {
    const raw = JSON.stringify({ no_skipping: "", no_guessing: "주어 찾기", grammar_watch: "", other: "" });
    const r = classReviewCoachMemo(raw);
    expect(r.coach_memo).toBe(raw);
    expect(r.coach_memo_text).toContain("주어 찾기");
  });
  it("멘트가 비어 있으면 아무것도 전달하지 않는다", () => {
    expect(classReviewCoachMemo(null)).toEqual({ coach_memo: null, coach_memo_text: null });
    expect(classReviewCoachMemo("   ")).toEqual({ coach_memo: null, coach_memo_text: null });
  });
});

describe("수업 자료함 학생 이름 검색", () => {
  const groups = [
    { sentenceId: "s1", students: [{ userId: "u1", name: "배서연", studentNo: "gwj0001" }] },
    { sentenceId: "s2", students: [{ userId: "u2", name: "이지호", studentNo: "gwj0002" }] },
    { sentenceId: "s3", students: [] },
  ];
  const hits = (q: string) => filterGroupsByStudent(groups, q).map(g => g.sentenceId);
  it("이름 일부로 그 학생이 담긴 문장만 남긴다", () => {
    expect(hits("서연")).toEqual(["s1"]);
  });
  it("학번으로도 찾고 대소문자를 가리지 않는다", () => {
    expect(hits("GWJ0002")).toEqual(["s2"]);
  });
  it("여러 학생 중 한 명만 맞아도 그 문장을 남긴다", () => {
    const many = [{ sentenceId: "s1", students: [{ userId: "u1", name: "이지호", studentNo: "gwj0002" }, { userId: "u2", name: "배서연", studentNo: "gwj0001" }] }];
    expect(filterGroupsByStudent(many, "서연")).toHaveLength(1);
  });
  it("검색어가 비어 있으면 전체를 그대로 둔다", () => {
    expect(filterGroupsByStudent(groups, "   ")).toBe(groups);
  });
  it("한 명도 없으면 아무 문장도 남기지 않는다", () => {
    expect(hits("없는이름")).toEqual([]);
  });
});

import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { groupBySentence, scopeClassReview } from "@/lib/classReview";

const rows = [
  { teacher_id: "t1", created_by: "t1" },
  { teacher_id: "t2", created_by: "t1" },
  { teacher_id: "t2", created_by: "t2" },
];

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

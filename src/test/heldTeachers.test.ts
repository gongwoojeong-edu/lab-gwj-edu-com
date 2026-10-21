import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { filterHeldByTeacher } from "@/lib/heldTeachers";
describe("선생님별 보류함", () => {
  const rows = [{ id: "a", held_teacher_id: "t1" }, { id: "b", held_teacher_id: "t2" }, { id: "c", held_teacher_id: null }];
  it("지정된 담당 선생님의 문장만 표시한다", () => {
    expect(filterHeldByTeacher(rows, "t1").map(r => r.id)).toEqual(["a"]);
    expect(filterHeldByTeacher(rows, "t2").map(r => r.id)).toEqual(["b"]);
  });
  it("기존 미지정 보류도 별도로 찾을 수 있다", () => {
    expect(filterHeldByTeacher(rows, "unassigned").map(r => r.id)).toEqual(["c"]);
    expect(filterHeldByTeacher(rows, "all")).toHaveLength(3);
  });
});
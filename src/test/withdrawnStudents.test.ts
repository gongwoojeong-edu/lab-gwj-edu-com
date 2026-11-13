import { describe, expect, it } from "vitest";
import { excludeWithdrawn, withdrawnStudentIds } from "@/lib/withdrawnStudents";

const profiles = [
  { user_id: "kim-seoyun", orbit_enrollment_active: false },
  { user_id: "active", orbit_enrollment_active: true },
  { user_id: "director", orbit_enrollment_active: false },
  { user_id: "unknown", orbit_enrollment_active: null },
];
const rows = [{ id: "a", user_id: "kim-seoyun" }, { id: "b", user_id: "active" }, { id: "c", user_id: "director" }, { id: "d", user_id: "unknown" }];

describe("퇴원생 제출 숨기기", () => {
  it("퇴원생 제출은 승인 대기에서 빠진다", () => {
    const w = withdrawnStudentIds(profiles, ["director"]);
    expect(excludeWithdrawn(rows, w).map(r => r.id)).toEqual(["b", "c", "d"]);
  });
  it("선생님·관리자 계정은 등록이 꺼져 있어도 남는다", () => {
    expect(withdrawnStudentIds(profiles, ["director"]).has("director")).toBe(false);
  });
  it("등록 상태를 모르는 학생은 숨기지 않는다", () => {
    expect(withdrawnStudentIds(profiles, []).has("unknown")).toBe(false);
  });
});

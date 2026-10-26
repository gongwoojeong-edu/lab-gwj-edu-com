import { describe, expect, it } from "vitest";
import { isEnglishSyncEligible, isMockTeachingStaff, isStaffSyncEligible } from "../../supabase/functions/sync-orbit-english/eligibilityPolicy";

describe("Orbit teacher-test learner enrollment", () => {
  it.each(["gwjt011", "gwjt012"])("imports active staff %s without English subjects and enables mock learning", (employee_no) => {
    expect(isStaffSyncEligible({ employee_no, subjects: [] })).toBe(true);
    expect(isMockTeachingStaff(employee_no)).toBe(true);
  });
  it("does not exempt unrelated non-English staff", () => {
    expect(isStaffSyncEligible({ employee_no: "gwjt013", subjects: [] })).toBe(false);
    expect(isMockTeachingStaff("gwjt013")).toBe(false);
  });
  it.each(["gwjt011", "gwjt012"])("syncs %s without English subjects or classes", (hakbun) => {
    expect(isEnglishSyncEligible({ id: "test", hakbun, subjects: [] }, new Set())).toBe(true);
  });
  it("keeps ordinary students outside English excluded", () => {
    expect(isEnglishSyncEligible({ id: "student", hakbun: "gwj0011", subjects: [] }, new Set())).toBe(false);
  });
  it("keeps English class membership eligible for ordinary students", () => {
    expect(isEnglishSyncEligible({ id: "student", hakbun: "gwj0011", subjects: [] }, new Set(["student"]))).toBe(true);
  });
});
import { describe, expect, it } from "vitest";
import { isEnglishSyncEligible } from "../../supabase/functions/sync-orbit-english/eligibilityPolicy";

describe("Orbit teacher-test learner enrollment", () => {
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
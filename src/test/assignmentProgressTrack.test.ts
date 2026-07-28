import { describe, expect, it } from "vitest";
import { allowsNullAssignmentFallback } from "@/lib/assignmentProgress";
import {
  ASSIGNMENT_TRACK_LABEL,
  classifyAssignmentTrack,
} from "@/lib/assignmentTrack";
import { isAssignmentDone } from "@/lib/assignmentCompletion";
import type { AssignmentProgressMap, UserStepProgress } from "@/lib/assignmentProgress";

describe("allowsNullAssignmentFallback", () => {
  it("allows null/≤1 rounds only", () => {
    expect(allowsNullAssignmentFallback(null)).toBe(true);
    expect(allowsNullAssignmentFallback(undefined)).toBe(true);
    expect(allowsNullAssignmentFallback(1)).toBe(true);
    expect(allowsNullAssignmentFallback(2)).toBe(false);
    expect(allowsNullAssignmentFallback(3)).toBe(false);
  });
});

describe("classifyAssignmentTrack labels", () => {
  it("marks multi-passage and unit titles as 내신", () => {
    expect(classifyAssignmentTrack({ title: "[L08] 책 · 6과", groupSize: 11 })).toBe("naeshin");
    expect(classifyAssignmentTrack({ title: "3과 문법", groupSize: 1 })).toBe("naeshin");
    expect(ASSIGNMENT_TRACK_LABEL.naeshin).toBe("내신");
  });

  it("marks retest / single ad-hoc as 특별", () => {
    expect(classifyAssignmentTrack({ title: "[재시험] 문장", groupSize: 1 })).toBe("special");
    expect(classifyAssignmentTrack({ title: "보충 테스트", groupSize: 1 })).toBe("special");
    expect(ASSIGNMENT_TRACK_LABEL.special).toBe("특별");
  });
});

describe("isAssignmentDone respects teacher pass", () => {
  it("short-circuits when progressStatus is pass", () => {
    const progress: AssignmentProgressMap = new Map([
      [
        "u1",
        {
          pre: { status: "missing", score: null },
          analysis: { status: "missing", score: null },
          translation: { status: "missing", score: null },
          wordtest: { status: "missing", score: null },
          mem: { status: "missing", score: null },
          progressStatus: "pass",
        } satisfies UserStepProgress,
      ],
    ]);
    expect(
      isAssignmentDone(
        {
          id: "a1",
          student_id: "u1",
          include_pre: true,
          include_analysis: true,
          include_translation: true,
          include_wordtest: true,
        },
        progress,
        ["u1"],
      ),
    ).toBe(true);
  });
});

import { describe, it, expect } from "vitest";
import {
  summarizeClassSessions, classSessionLabel, classSessionBadgeHtml, classSessionsReportText, type ClassSession,
} from "@/lib/classSessionMeta";

const row = (sentence_id: string, held_at: string, teacher_id = "t1"): ClassSession => ({
  user_id: "u1", sentence_id, approval_id: null, teacher_id, held_at,
});

describe("수업 기록", () => {
  it("한 번 수업한 문장은 날짜(서울 기준)와 함께 남는다", () => {
    const m = summarizeClassSessions([row("s1", "2026-11-10T05:00:00Z")]);
    expect(classSessionLabel(m.get("s1"))).toBe("수업 11/10");
  });

  it("같은 문장을 두 번 수업하면 횟수와 가장 최근 날짜·선생님을 보여 준다", () => {
    const m = summarizeClassSessions([
      row("s1", "2026-11-12T05:00:00Z", "t2"),
      row("s1", "2026-11-10T05:00:00Z", "t1"),
    ]);
    expect(m.get("s1")).toEqual({ count: 2, lastAt: "2026-11-12T05:00:00Z", lastTeacherId: "t2" });
    expect(classSessionLabel(m.get("s1"))).toBe("수업 2회 · 11/12");
  });

  it("수업 기록이 없는 문장은 워크북에 아무 표시도 하지 않는다", () => {
    expect(classSessionBadgeHtml(undefined)).toBe("");
    expect(classSessionBadgeHtml(summarizeClassSessions([row("s1", "2026-11-10T05:00:00Z")]).get("s1"))).toContain("수업 11/10");
  });

  it("리포트는 같은 날 여러 문장을 하루로 센다", () => {
    expect(classSessionsReportText([
      { sentenceId: "a", heldAt: "2026-11-10T05:00:00Z" },
      { sentenceId: "b", heldAt: "2026-11-10T06:00:00Z" },
      { sentenceId: "c", heldAt: "2026-11-12T05:00:00Z" },
    ])).toBe("수업 2일 · 3문장 (11/10, 11/12)");
  });
});

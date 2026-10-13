import { describe, it, expect } from "vitest";
import { buildStudentReport, type CoachingReportSource } from "@/lib/coachingReport";

const period = { start: "2026-09-01", end: "2026-09-30" };

const baseSource = (overrides: Partial<CoachingReportSource> = {}): CoachingReportSource => ({
  approvals: [],
  firstPassAt: new Map(),
  wordResults: [],
  handouts: [],
  reviewReqs: [],
  ...overrides,
});

describe("buildStudentReport 기간 판정", () => {
  it("9월에 학습하고 10월 2일에 첨삭된 문장은 9월 리포트에 포함된다", () => {
    const src = baseSource({
      approvals: [
        {
          user_id: "u1",
          sentence_id: "s1",
          grade: "good",
          memo: "잘했어요",
          praise_text: "칭찬",
          approved_at: "2026-10-02T03:00:00.000Z",
          requested_at: "2026-09-20T03:00:00.000Z",
        },
      ],
      firstPassAt: new Map([["u1|s1", "2026-09-20T03:00:00.000Z"]]),
    });
    const r = buildStudentReport("u1", src, period);
    expect(r.passCount).toBe(1);
    expect(r.gradeCounts.good).toBe(1);
    expect(r.praises).toEqual(["칭찬"]);
    expect(r.memos).toHaveLength(1);
  });

  it("학습일이 기간 밖이면 첨삭일이 기간 안이어도 제외된다", () => {
    const src = baseSource({
      approvals: [
        {
          user_id: "u1",
          sentence_id: "s1",
          grade: "good",
          memo: null,
          praise_text: null,
          approved_at: "2026-09-15T03:00:00.000Z",
          requested_at: "2026-08-01T03:00:00.000Z",
        },
      ],
      firstPassAt: new Map([["u1|s1", "2026-08-01T03:00:00.000Z"]]),
    });
    const r = buildStudentReport("u1", src, period);
    expect(r.passCount).toBe(0);
  });

  it("학습 기록이 없으면 첨삭일 기준으로 판정한다", () => {
    const src = baseSource({
      approvals: [
        {
          user_id: "u1",
          sentence_id: "s1",
          grade: null,
          memo: null,
          praise_text: null,
          approved_at: "2026-09-10T03:00:00.000Z",
          requested_at: "2026-09-01T03:00:00.000Z",
        },
      ],
    });
    const r = buildStudentReport("u1", src, period);
    expect(r.passCount).toBe(1);
  });
});

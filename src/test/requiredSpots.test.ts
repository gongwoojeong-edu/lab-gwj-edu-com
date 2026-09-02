// 필수 분석 지점(★)이 저장/재접속(=클라우드 재조회) 후에도 유지되는지 재현 테스트
import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = { owner_id: string; user_id: string | null; progress: unknown };

const state: { adminIds: string[]; masterRows: Row[]; studentRows: Row[] } = {
  adminIds: ["admin-1"],
  masterRows: [],
  studentRows: [],
};

vi.mock("@/integrations/supabase/client", () => {
  const build = (table: string) => {
    const ctx: { userIds?: string[]; singleUser?: string } = {};
    const result = () => {
      if (table === "user_roles") {
        return { data: state.adminIds.map((user_id) => ({ user_id })), error: null };
      }
      if (ctx.singleUser) {
        return { data: state.studentRows.filter((r) => r.user_id === ctx.singleUser), error: null };
      }
      const ids = ctx.userIds ?? [];
      return { data: state.masterRows.filter((r) => ids.includes(r.user_id ?? "")), error: null };
    };
    const api: Record<string, unknown> = {};
    api.select = () => api;
    api.eq = (col: string, val: string) => {
      if (col === "user_id") ctx.singleUser = val;
      return api;
    };
    api.in = (_col: string, vals: string[]) => {
      ctx.userIds = vals;
      return api;
    };
    api.then = (res: (v: unknown) => unknown) => Promise.resolve(result()).then(res);
    return api;
  };
  return { supabase: { from: (table: string) => build(table) } };
});

vi.mock("@/lib/authState", () => ({
  getCurrentUserId: async () => "student-1",
}));

const master = (required?: boolean) => ({
  pos: "noun",
  required,
  noun: { form: "명사", element: "S", role: null },
});

describe("필수 분석 지점 유지", () => {
  beforeEach(() => {
    state.masterRows = [
      { owner_id: "w1::0", user_id: "admin-1", progress: master(true) },
      { owner_id: "span::s1::3-5", user_id: "admin-1", progress: master(true) },
      { owner_id: "w9::0", user_id: "admin-1", progress: master(false) },
    ];
    state.studentRows = [];
  });

  it("재접속 시 클라우드에서 required 플래그가 그대로 복원된다", async () => {
    const { fetchMasterAnswers } = await import("@/lib/analysisGrading");
    const m = await fetchMasterAnswers("s1");
    const requiredIds = Object.entries(m)
      .filter(([, v]) => (v as { required?: boolean }).required === true)
      .map(([id]) => id);
    expect(requiredIds.sort()).toEqual(["span::s1::3-5", "w1::0"]);
  });

  it("필수 지점 미완료면 비율이 높아도 통과하지 못한다", async () => {
    const { gradeAnalysis } = await import("@/lib/analysisGrading");
    const r = await gradeAnalysis("s1", { fallbackRate: 0.9 });
    expect(r.hasExplicitRequired).toBe(true);
    expect(r.explicitRequiredCount).toBe(2);
    expect(r.requiredOwnersFilled).toBe(false);
    expect(r.missingRequiredOwnerIds.sort()).toEqual(["span::s1::3-5", "w1::0"]);
  });

  it("필수 지점을 모두 채우면(구는 단어 커버리지 포함) 통과한다", async () => {
    state.studentRows = [
      { owner_id: "w1::0", user_id: "student-1", progress: { pos: "noun" } },
      { owner_id: "w4::0", user_id: "student-1", progress: { pos: "adj" } },
    ];
    const { gradeAnalysis } = await import("@/lib/analysisGrading");
    const r = await gradeAnalysis("s1", { fallbackRate: 0.2 });
    expect(r.missingRequiredOwnerIds).toEqual([]);
    expect(r.requiredOwnersFilled).toBe(true);
  });

  it("명시 필수 지점이 없으면 기존 비율 정책을 유지한다", async () => {
    state.masterRows = [{ owner_id: "w9::0", user_id: "admin-1", progress: master(false) }];
    const { gradeAnalysis } = await import("@/lib/analysisGrading");
    const low = await gradeAnalysis("s1", { fallbackRate: 0.1 });
    const high = await gradeAnalysis("s1", { fallbackRate: 0.9 });
    expect(low.hasExplicitRequired).toBe(false);
    expect(low.requiredOwnersFilled).toBe(false);
    expect(high.requiredOwnersFilled).toBe(true);
  });
});

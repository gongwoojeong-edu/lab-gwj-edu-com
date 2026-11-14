import { describe, it, expect, vi, beforeEach } from "vitest";

const calls: string[][] = [];
let failOn: number | null = null;
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      delete: () => ({
        in: async (_col: string, ids: string[]) => {
          calls.push(ids);
          return { error: failOn === calls.length ? { message: "boom" } : null };
        },
      }),
    }),
  },
}));

import { deleteApprovals } from "@/lib/sentenceApprovals";

describe("deleteApprovals (여러 건 한꺼번에 삭제)", () => {
  beforeEach(() => { calls.length = 0; failOn = null; });

  it("선택한 250건을 중복 없이 모두 삭제 요청한다", async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `id-${i}`);
    const n = await deleteApprovals([...ids, "id-0", "id-1"]);
    expect(n).toBe(250);
    expect(calls.flat().sort()).toEqual([...ids].sort());
    expect(calls.every((c) => c.length <= 100)).toBe(true);
  });

  it("선택이 없으면 아무것도 지우지 않는다", async () => {
    expect(await deleteApprovals([])).toBe(0);
    expect(calls.length).toBe(0);
  });

  it("중간에 실패하면 오류를 그대로 알린다", async () => {
    failOn = 2;
    const ids = Array.from({ length: 250 }, (_, i) => `id-${i}`);
    await expect(deleteApprovals(ids)).rejects.toBeTruthy();
  });
});

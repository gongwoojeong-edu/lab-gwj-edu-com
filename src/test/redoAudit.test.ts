import { expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { isOpenRedo } from "@/lib/redoAudit";

it("재학습 요청 뒤 아직 다시 제출하지 않았으면 선생님 점검 목록에 남는다", () => {
  expect(isOpenRedo("2026-09-27T09:24:00Z", "2026-09-27T08:43:00Z")).toBe(true);
  expect(isOpenRedo("2026-09-27T09:24:00Z", null)).toBe(true);
});

it("재학습 요청 뒤 같은 문장을 다시 제출했으면 목록에서 빠진다", () => {
  expect(isOpenRedo("2026-11-07T01:07:00Z", "2026-11-07T02:03:00Z")).toBe(false);
});

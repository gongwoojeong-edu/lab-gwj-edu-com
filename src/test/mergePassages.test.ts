import { beforeEach, describe, expect, it, vi } from "vitest";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
import { mergePassagesWithTranslations } from "@/lib/mergePassages";

describe("passage merge", () => {
  beforeEach(() => rpc.mockReset());
  it("uses the atomic merge with all selected passages", async () => {
    rpc.mockResolvedValue({ error: null });
    await mergePassagesWithTranslations(["second", "first", "second"]);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("merge_passages_with_translations", { p_ids: ["second", "first"] });
  });
  it("does not merge fewer than two distinct passages", async () => {
    await expect(mergePassagesWithTranslations(["first", "first"])).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });
  it("surfaces a failed transaction instead of reporting success", async () => {
    const error = new Error("translation save failed");
    rpc.mockResolvedValue({ error });
    await expect(mergePassagesWithTranslations(["first", "second"])).rejects.toBe(error);
  });
});
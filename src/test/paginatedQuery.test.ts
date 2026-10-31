import { describe, expect, it, vi } from "vitest";
import { fetchAllPages, fetchInChunks } from "@/lib/paginatedQuery";

describe("approval queue pagination", () => {
  it("keeps all 2507 records instead of stopping at 1000", async () => {
    const rows = Array.from({ length: 2507 }, (_, id) => ({ id }));
    const query = vi.fn(async (from: number, to: number) => ({
      data: rows.slice(from, to + 1), error: null,
    }));
    expect(await fetchAllPages(query)).toEqual(rows);
    expect(query.mock.calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });
  it("checks the next page when exactly 1000 records exist", async () => {
    const query = vi.fn(async (from: number) => ({
      data: from === 0 ? Array.from({ length: 1000 }, (_, id) => id) : [], error: null,
    }));
    expect(await fetchAllPages(query)).toHaveLength(1000);
    expect(query).toHaveBeenCalledTimes(2);
  });
  it("rejects later-page failures rather than returning missing translations as success", async () => {
    const error = new Error("network failed");
    await expect(fetchAllPages(async from => ({
      data: from === 0 ? Array.from({ length: 1000 }, (_, id) => id) : null,
      error: from === 0 ? null : error,
    }))).rejects.toThrow("network failed");
  });
  it("bounds filters and keeps each of 251 unique identifiers exactly once", async () => {
    const ids = Array.from({ length: 251 }, (_, i) => `id-${i}`);
    const query = vi.fn(async (chunk: string[]) => chunk);
    expect(await fetchInChunks([...ids, ids[0]], query)).toEqual(ids);
    expect(query.mock.calls.map(([chunk]) => chunk.length)).toEqual([100, 100, 51]);
  });
});
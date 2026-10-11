import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));
import { fetchImportantSentenceIds, setImportantSentence } from "@/lib/importantSentences";

describe("중요문장 저장", () => {
  beforeEach(() => vi.clearAllMocks());
  it.each([true, false])("지정/해제(%s)는 해당 학생 문장만 갱신하고 스킵을 덮어쓰지 않는다", async (important) => {
    const single = vi.fn().mockResolvedValue({ data: { sentence_id: "sentence-1" }, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const upsert = vi.fn().mockReturnValue({ select });
    mocks.from.mockReturnValue({ upsert });
    await setImportantSentence("student-1", "sentence-1", important);
    expect(upsert).toHaveBeenCalledWith({ user_id: "student-1", sentence_id: "sentence-1", important_sentence: important }, { onConflict: "user_id,sentence_id" });
  });
  it("워크북 조회는 대상 학생과 중요문장 지정만 조회한다", async () => {
    const query = { select: vi.fn(), eq: vi.fn(), in: vi.fn().mockResolvedValue({ data: [{ sentence_id: "sentence-1" }], error: null }) };
    query.select.mockReturnValue(query); query.eq.mockReturnValue(query);
    mocks.from.mockReturnValue(query);
    const ids = await fetchImportantSentenceIds("student-1", ["sentence-1", "sentence-2"]);
    expect(query.eq).toHaveBeenCalledWith("user_id", "student-1");
    expect(query.eq).toHaveBeenCalledWith("important_sentence", true);
    expect([...ids]).toEqual(["sentence-1"]);
  });
  it("저장 실패를 숨기지 않는다", async () => {
    mocks.from.mockReturnValue({ upsert: () => ({ select: () => ({ single: async () => ({ error: new Error("권한 없음") }) }) }) });
    await expect(setImportantSentence("student-1", "sentence-1", true)).rejects.toThrow("권한 없음");
  });
});
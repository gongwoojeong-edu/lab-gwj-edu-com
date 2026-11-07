import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));
import { fetchTopicSentenceIds, setTopicSentence } from "@/lib/topicSentences";

describe("주제문 지정", () => {
  beforeEach(() => vi.clearAllMocks());
  it.each([true, false])("지정/해제(%s)는 학생 문장의 주제문만 변경한다", async (topic) => {
    const single = vi.fn().mockResolvedValue({ data: { sentence_id: "sentence-1" }, error: null });
    const upsert = vi.fn().mockReturnValue({ select: () => ({ single }) });
    mocks.from.mockReturnValue({ upsert });
    await setTopicSentence("student-1", "sentence-1", topic);
    expect(mocks.from).toHaveBeenCalledWith("student_passage_overrides");
    expect(upsert).toHaveBeenCalledWith({ user_id: "student-1", sentence_id: "sentence-1", topic_sentence: topic }, { onConflict: "user_id,sentence_id" });
  });
  it("워크북에 전달할 주제문은 지정된 학생·문장 범위에서 조회한다", async () => {
    const query = { select: vi.fn(), eq: vi.fn(), in: vi.fn().mockResolvedValue({ data: [{ sentence_id: "sentence-1" }], error: null }) };
    query.select.mockReturnValue(query); query.eq.mockReturnValue(query);
    mocks.from.mockReturnValue(query);
    const ids = await fetchTopicSentenceIds("student-1", ["sentence-1", "sentence-2"]);
    expect(query.eq).toHaveBeenCalledWith("user_id", "student-1");
    expect(query.eq).toHaveBeenCalledWith("topic_sentence", true);
    expect(query.in).toHaveBeenCalledWith("sentence_id", ["sentence-1", "sentence-2"]);
    expect([...ids]).toEqual(["sentence-1"]);
  });
  it("저장 실패를 표시하기 위해 오류를 전달한다", async () => {
    mocks.from.mockReturnValue({ upsert: () => ({ select: () => ({ single: async () => ({ error: new Error("권한 없음") }) }) }) });
    await expect(setTopicSentence("student-1", "sentence-1", true)).rejects.toThrow("권한 없음");
  });
  it("조회 실패 시 주제문이 없는 것으로 처리하지 않는다", async () => {
    const query = { select: vi.fn(), eq: vi.fn(), in: vi.fn().mockResolvedValue({ error: new Error("연결 실패") }) };
    query.select.mockReturnValue(query); query.eq.mockReturnValue(query);
    mocks.from.mockReturnValue(query);
    await expect(fetchTopicSentenceIds("student-1", ["sentence-1"])).rejects.toThrow("연결 실패");
  });
});
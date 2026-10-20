import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ from: vi.fn(), channel: vi.fn(), removeChannel: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: mocks }));
vi.mock("@/lib/authState", () => ({ getCurrentUserId: async () => "student-1" }));
import { fetchOpenQuestionsForStudent, subscribeTeachingQuestions } from "@/lib/teachingQuestions";

describe("첨삭질문 전달", () => {
  beforeEach(() => vi.clearAllMocks());
  it("미답변·오답을 학생별로 먼저 조회해 지난 정답이 새 질문을 밀어내지 않는다", async () => {
    const query = { select: vi.fn(), eq: vi.fn(), or: vi.fn(), order: vi.fn(), limit: vi.fn().mockResolvedValue({ data: [], error: null }) };
    query.select.mockReturnValue(query); query.eq.mockReturnValue(query); query.or.mockReturnValue(query); query.order.mockReturnValue(query);
    mocks.from.mockReturnValue(query);
    await fetchOpenQuestionsForStudent("student-1");
    expect(query.eq).toHaveBeenCalledWith("user_id", "student-1");
    expect(query.or).toHaveBeenCalledWith("answered_at.is.null,verdict.eq.wrong");
  });
  it("조회 실패를 빈 질문 목록처럼 숨기지 않는다", async () => {
    const query = { select: vi.fn(), eq: vi.fn(), or: vi.fn(), order: vi.fn(), limit: vi.fn().mockResolvedValue({ data: null, error: new Error("offline") }) };
    query.select.mockReturnValue(query); query.eq.mockReturnValue(query); query.or.mockReturnValue(query); query.order.mockReturnValue(query);
    mocks.from.mockReturnValue(query);
    await expect(fetchOpenQuestionsForStudent()).rejects.toThrow("offline");
  });
  it("학생별 새 질문·재접속·화면 복귀 때 다시 조회하고 종료 시 해제한다", () => {
    let connected: ((status: string) => void) | undefined;
    const channel = { on: vi.fn(), subscribe: vi.fn((callback) => { connected = callback; return channel; }) };
    channel.on.mockReturnValue(channel);
    mocks.channel.mockReturnValue(channel);
    const reload = vi.fn();
    const stop = subscribeTeachingQuestions("student-1", reload);
    expect(channel.on.mock.calls[0][1].filter).toBe("user_id=eq.student-1");
    channel.on.mock.calls[0][2]();
    connected?.("SUBSCRIBED");
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("online"));
    expect(reload).toHaveBeenCalledTimes(4);
    stop();
    window.dispatchEvent(new Event("focus"));
    expect(reload).toHaveBeenCalledTimes(4);
    expect(mocks.removeChannel).toHaveBeenCalledWith(channel);
  });
});
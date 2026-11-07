import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ from: vi.fn(), channel: vi.fn(), removeChannel: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: mocks }));
vi.mock("@/lib/authState", () => ({ getCurrentUserId: async () => "student-1" }));
import { isRedoNotification, redoNotificationPath } from "@/lib/redoNotifications";
import { fetchMyUnreadNotifications, subscribeMyNotifications, type StudentNotification } from "@/lib/studentNotifications";

const notification: StudentNotification = {
  id: "n1", user_id: "student-1", kind: "evaluation", grade: "coach",
  title: "수업 코칭 — 한 번 더 제출해주세요", body: null, sentence_id: "s1", approval_id: "a1",
  sent_by: "teacher", read_at: null, created_at: "2026-11-07", updated_at: "2026-11-07",
};
beforeEach(() => vi.clearAllMocks());
it("수업 완료의 코칭 알림은 열린 학생 화면의 재학습 대상으로 분류한다", () => {
  expect(isRedoNotification(notification)).toBe(true);
});
it("일반 코칭 승인은 추가 제출 요청으로 바꾸지 않는다", () => {
  expect(isRedoNotification({ ...notification, title: "선생님 평가: 코칭" })).toBe(false);
});
it("기존 재학습 등급 알림도 유지한다", () => {
  expect(isRedoNotification({ ...notification, grade: "redo", title: "선생님 평가" })).toBe(true);
});
it("특별과제에서 수업했다면 같은 회독의 재학습을 연다", async () => {
  const q = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: { assignment_id: "round-2" }, error: null }) };
  q.select.mockReturnValue(q); q.eq.mockReturnValue(q); mocks.from.mockReturnValue(q);
  expect(await redoNotificationPath(notification)).toBe("/learn/sentence/s1?restart=1&assignment=round-2");
  expect(q.eq).toHaveBeenCalledWith("user_id", "student-1");
});
it("메인덱 재학습은 회독 지정 없이 연다", async () => {
  const q = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: { assignment_id: null }, error: null }) };
  q.select.mockReturnValue(q); q.eq.mockReturnValue(q); mocks.from.mockReturnValue(q);
  expect(await redoNotificationPath(notification)).toBe("/learn/sentence/s1?restart=1");
});
it("학생 알림은 새 알림·접속·화면 복귀 때 홈 이동 없이 갱신한다", () => {
  let connected: ((status: string) => void) | undefined;
  const channel = { on: vi.fn(), subscribe: vi.fn((cb) => { connected = cb; return channel; }) };
  channel.on.mockReturnValue(channel); mocks.channel.mockReturnValue(channel);
  const reload = vi.fn();
  const stop = subscribeMyNotifications("student-1", reload);
  expect(channel.on.mock.calls[0][1].filter).toBe("user_id=eq.student-1");
  channel.on.mock.calls[0][2](); connected?.("SUBSCRIBED");
  window.dispatchEvent(new Event("focus")); window.dispatchEvent(new Event("online"));
  expect(reload).toHaveBeenCalledTimes(4);
  stop(); window.dispatchEvent(new Event("focus"));
  expect(reload).toHaveBeenCalledTimes(4);
});
it("알림 조회 실패는 빈 목록으로 숨기지 않는다", async () => {
  const q = { select: vi.fn(), eq: vi.fn(), neq: vi.fn(), is: vi.fn(), order: vi.fn().mockResolvedValue({ data: null, error: new Error("offline") }) };
  q.select.mockReturnValue(q); q.eq.mockReturnValue(q); q.neq.mockReturnValue(q); q.is.mockReturnValue(q);
  mocks.from.mockReturnValue(q);
  await expect(fetchMyUnreadNotifications()).rejects.toThrow("offline");
});
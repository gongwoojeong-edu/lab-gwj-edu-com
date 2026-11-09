import { expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/authState", () => ({ getCurrentUserId: async () => "student-1" }));
import { classifyRedoNotifications, isCurrentNotification } from "@/lib/studentInbox";
import type { StudentNotification } from "@/lib/studentNotifications";

const redo = (id: string, created_at: string, extra: Partial<StudentNotification> = {}): StudentNotification => ({
  id, user_id: "student-1", kind: "evaluation", grade: "redo", title: "선생님 평가",
  body: null, sentence_id: "s1", approval_id: null, sent_by: "t", read_at: null,
  created_at, updated_at: created_at, ...extra,
});

it("재학습 후 같은 문장을 다시 제출하면 재학습 완료로 현재 알림에서 빠진다", () => {
  const n = redo("n1", "2026-11-09T01:00:00Z");
  const status = classifyRedoNotifications([n], {
    submissions: [{ sentence_id: "s1", requested_at: "2026-11-09T02:00:00Z" }],
    flaggedSentenceIds: new Set(),
  });
  expect(status.get("n1")).toBe("done");
  expect(isCurrentNotification(n, status)).toBe(false);
});

it("확인(읽음)만 누르고 다시 제출하지 않았으면 현재 알림에 남는다", () => {
  const n = redo("n1", "2026-11-09T01:00:00Z", { read_at: "2026-11-09T01:05:00Z" });
  const status = classifyRedoNotifications([n], {
    submissions: [{ sentence_id: "s1", requested_at: "2026-11-08T23:00:00Z" }],
    flaggedSentenceIds: new Set(["s1"]),
  });
  expect(status.get("n1")).toBe("pending");
  expect(isCurrentNotification(n, status)).toBe(true);
});

it("같은 문장에 재학습이 두 번 오면 최근 것 하나만 남는다", () => {
  const older = redo("old", "2026-11-08T01:00:00Z", { read_at: "2026-11-08T02:00:00Z" });
  const newer = redo("new", "2026-11-09T01:00:00Z");
  const status = classifyRedoNotifications([older, newer], {
    submissions: [],
    flaggedSentenceIds: new Set(["s1"]),
  });
  expect(status.get("new")).toBe("pending");
  expect(isCurrentNotification(older, status)).toBe(false);
});

it("일반 평가 알림은 기존처럼 확인 여부로만 나뉜다", () => {
  const n = redo("g", "2026-11-09T01:00:00Z", { grade: "good", title: "선생님 평가: 잘함" });
  const status = classifyRedoNotifications([n], {
    submissions: [{ sentence_id: "s1", requested_at: "2026-11-09T02:00:00Z" }],
    flaggedSentenceIds: new Set(["s1"]),
  });
  expect(status.has("g")).toBe(false);
  expect(isCurrentNotification(n, status)).toBe(true);
});

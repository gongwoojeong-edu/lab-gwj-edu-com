// ============================================================
// assignmentNotifications — 특별과제 생성 시 학생 알림 (구문랩 알림함)
// Orbit(잉글앱) 푸시는 별도 연동 — lab student_notifications 가 1차 채널
// ============================================================
import { supabase } from "@/integrations/supabase/client";
import { getCurrentUserId } from "@/lib/authState";
import { createNotification, type NotificationKind } from "@/lib/studentNotifications";
import { taskModeIncludesMemorize, type TaskMode } from "@/lib/taskMode";

export async function notifyStudentsForNewAssignment(opts: {
  title: string;
  description?: string | null;
  dueAt?: Date | null;
  studentIds: string[];
  taskMode: TaskMode | null;
  passageCount: number;
  mode: "unit" | "sentence" | "book";
  unitCount?: number;
}): Promise<number> {
  const sender = await getCurrentUserId();
  if (!sender) return 0;

  let targets: string[] = opts.studentIds;
  if (targets.length === 0) {
    const { data } = await supabase
      .from("student_profiles")
      .select("user_id")
      .eq("orbit_enrollment_active", true);
    targets = ((data ?? []) as Array<{ user_id: string }>).map((r) => r.user_id);
  }

  if (targets.length === 0) return 0;

  const includesMem = taskModeIncludesMemorize(opts.taskMode);
  const dueLabel = opts.dueAt
    ? opts.dueAt.toLocaleDateString("ko-KR", { month: "short", day: "numeric" })
    : "무기한";
  const scope =
    opts.mode === "sentence"
      ? "문장 1개"
      : `유닛 지문 ${opts.passageCount}개`;

  const kind: NotificationKind = "assignment";
  const title = includesMem ? `📋 암기 과제: ${opts.title}` : `📋 새 과제: ${opts.title}`;
  const body =
    `${scope} · 마감 ${dueLabel}` +
    (opts.description?.trim() ? `\n${opts.description.trim()}` : "") +
    (includesMem ? "\n문장암기 학습을 진행해 주세요." : "");

  let sent = 0;
  for (const userId of targets) {
    try {
      await createNotification({
        userId,
        kind,
        title,
        body,
      });
      sent++;
    } catch (e) {
      console.error("assignment notification failed", userId, e);
    }
  }
  return sent;
}

import { supabase } from "@/integrations/supabase/client";
import type { StudentNotification } from "@/lib/studentNotifications";

export const isRedoNotification = (n: StudentNotification): boolean =>
  n.grade === "redo" || n.kind === "retest" ||
  n.title.includes("재학습") || n.title.includes("추가학습") ||
  // Ordinary coaching is not a resubmission request. Class completion is.
  (n.grade === "coach" && n.title === "수업 코칭 — 한 번 더 제출해주세요");

export const redoNotificationPath = async (n: StudentNotification): Promise<string> => {
  if (!n.sentence_id) return "/learn/notifications";
  const params = new URLSearchParams({ restart: "1" });
  if (n.approval_id) {
    const { data, error } = await supabase.from("sentence_approvals")
      .select("assignment_id").eq("id", n.approval_id).eq("user_id", n.user_id).maybeSingle();
    if (error) throw error;
    if (data?.assignment_id) params.set("assignment", data.assignment_id);
  }
  return `/learn/sentence/${encodeURIComponent(n.sentence_id)}?${params}`;
};
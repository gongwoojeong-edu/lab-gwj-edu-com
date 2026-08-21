// ============================================================
// studentNotifications.ts — 학생 알림함 CRUD + 구독
// ============================================================
import { supabase } from "@/integrations/supabase/client";
import { getCurrentUserId } from "@/lib/authState";

export type NotificationKind = "evaluation" | "system" | "retest" | "assignment" | "teaching";

export interface StudentNotification {
  id: string;
  user_id: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  grade: string | null;
  sentence_id: string | null;
  approval_id: string | null;
  sent_by: string | null;
  read_at: string | null;
  created_at: string;
  updated_at: string;
}

export const createNotification = async (input: {
  userId: string;
  kind?: NotificationKind;
  title: string;
  body?: string | null;
  grade?: string | null;
  sentenceId?: string | null;
  approvalId?: string | null;
}): Promise<void> => {
  const sender = await getCurrentUserId();
  const { error } = await supabase.from("student_notifications").insert({
    user_id: input.userId,
    kind: input.kind ?? "evaluation",
    title: input.title,
    body: input.body ?? null,
    grade: input.grade ?? null,
    sentence_id: input.sentenceId ?? null,
    approval_id: input.approvalId ?? null,
    sent_by: sender,
  });
  if (error) throw error;
};

export const fetchMyNotifications = async (
  limit = 100,
): Promise<StudentNotification[]> => {
  const uid = await getCurrentUserId();
  if (!uid) return [];
  const { data, error } = await supabase
    .from("student_notifications")
    .select("*")
    .eq("user_id", uid)
    .neq("kind", "teaching")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as StudentNotification[];
};

export const fetchMyUnreadNotifications = async (): Promise<StudentNotification[]> => {
  const uid = await getCurrentUserId();
  if (!uid) return [];
  const { data } = await supabase
    .from("student_notifications")
    .select("*")
    .eq("user_id", uid)
    .neq("kind", "teaching")
    .is("read_at", null)
    .order("created_at", { ascending: false });
  return (data ?? []) as StudentNotification[];
};

export const markNotificationRead = async (id: string): Promise<void> => {
  await supabase
    .from("student_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id);
};

export const markAllNotificationsRead = async (): Promise<void> => {
  const uid = await getCurrentUserId();
  if (!uid) return;
  await supabase
    .from("student_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", uid)
    .is("read_at", null);
};

export const subscribeMyNotifications = (
  userId: string,
  onChange: () => void,
) => {
  const channel = supabase
    .channel(`sn_${userId}_${Math.random().toString(36).slice(2)}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "student_notifications",
        filter: `user_id=eq.${userId}`,
      },
      () => onChange(),
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
};

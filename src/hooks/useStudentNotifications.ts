import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { subscribeMyNotifications, type StudentNotification } from "@/lib/studentNotifications";
import { fetchMyActiveInbox } from "@/lib/studentInbox";
import { toast } from "@/hooks/use-toast";

export function useStudentNotifications() {
  const { user } = useAuth();
  /** 현재 알림 — 재학습은 다시 제출할 때까지 포함 */
  const [active, setActive] = useState<StudentNotification[]>([]);
  /** 아직 읽지 않은 새 알림 (도착 팝업용) */
  const [unread, setUnread] = useState<StudentNotification[]>([]);
  /** 아직 다시 제출하지 않은 재학습 알림 */
  const [pendingRedos, setPendingRedos] = useState<StudentNotification[]>([]);
  const [error, setError] = useState(false);
  const activeUser = useRef(user?.id);
  activeUser.current = user?.id;
  const requestVersion = useRef(0);
  const failed = useRef(false);
  const reload = useCallback(async () => {
    const uid = user?.id;
    if (!uid) return;
    const version = ++requestVersion.current;
    try {
      const inbox = await fetchMyActiveInbox();
      if (activeUser.current !== uid || version !== requestVersion.current) return;
      setActive(inbox.active);
      setUnread(inbox.unread);
      setPendingRedos(inbox.pendingRedos);
      setError(false);
      failed.current = false;
    } catch {
      if (activeUser.current !== uid || version !== requestVersion.current) return;
      setError(true);
      if (!failed.current) toast({ title: "알림을 불러오지 못했어요", description: "다시 불러오기를 눌러 주세요.", variant: "destructive" });
      failed.current = true;
    }
  }, [user?.id]);

  useEffect(() => {
    setActive([]);
    setUnread([]);
    setPendingRedos([]);
    setError(false);
    failed.current = false;
    if (!user?.id) return;
    void reload();
    const stop = subscribeMyNotifications(user.id, () => void reload());
    return () => { requestVersion.current++; stop(); };
  }, [user?.id, reload]);

  return { active, unread, pendingRedos, count: active.length, reload, error };
}

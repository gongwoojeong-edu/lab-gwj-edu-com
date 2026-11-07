import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { subscribeMyNotifications, fetchMyUnreadNotifications, type StudentNotification } from "@/lib/studentNotifications";
import { toast } from "@/hooks/use-toast";

export function useStudentNotifications() {
  const { user } = useAuth();
  const [unread, setUnread] = useState<StudentNotification[]>([]);
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
      const rows = await fetchMyUnreadNotifications();
      if (activeUser.current !== uid || version !== requestVersion.current) return;
      setUnread(rows);
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
    setUnread([]);
    setError(false);
    failed.current = false;
    if (!user?.id) return;
    void reload();
    const stop = subscribeMyNotifications(user.id, () => void reload());
    return () => { requestVersion.current++; stop(); };
  }, [user?.id, reload]);

  return { unread, count: unread.length, reload, error };
}

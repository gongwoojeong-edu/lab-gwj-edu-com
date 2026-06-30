import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { subscribeMyNotifications, fetchMyUnreadNotifications, type StudentNotification } from "@/lib/studentNotifications";

export function useStudentNotifications() {
  const { user } = useAuth();
  const [unread, setUnread] = useState<StudentNotification[]>([]);
  const reload = async () => setUnread(await fetchMyUnreadNotifications());

  useEffect(() => {
    if (!user?.id) {
      setUnread([]);
      return;
    }
    reload();
    return subscribeMyNotifications(user.id, reload);
  }, [user?.id]);

  return { unread, count: unread.length, reload };
}

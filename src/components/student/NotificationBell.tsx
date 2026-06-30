import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useStudentNotifications } from "@/hooks/useStudentNotifications";
import { markAllNotificationsRead, type StudentNotification } from "@/lib/studentNotifications";
import { GRADE_BADGE_CLASS, GRADE_LABEL, type ApprovalGrade } from "@/lib/sentenceApprovals";

const STORAGE_KEY = "gwj.seenNotifIds.v1";

const getSeenIds = (): Set<string> => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
};
const saveSeenIds = (ids: Set<string>) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(ids).slice(-200)));
  } catch {}
};

export default function NotificationBell() {
  const { unread, count, reload } = useStudentNotifications();
  const [popup, setPopup] = useState<StudentNotification[]>([]);

  // 신규 미확인(이전 세션에서 못본 것)만 강제 모달로 표시
  useEffect(() => {
    if (count === 0) return;
    const seen = getSeenIds();
    const fresh = unread.filter((n) => !seen.has(n.id));
    if (fresh.length > 0) setPopup(fresh);
  }, [unread, count]);

  const onDismiss = async () => {
    const seen = getSeenIds();
    popup.forEach((n) => seen.add(n.id));
    saveSeenIds(seen);
    setPopup([]);
    await markAllNotificationsRead();
    reload();
  };

  return (
    <>
      <Button variant="ghost" size="sm" asChild className="relative">
        <Link to="/learn/notifications" aria-label="알림함">
          <Bell className="w-4 h-4" />
          {count > 0 && (
            <Badge className="absolute -top-1 -right-1 h-4 min-w-[16px] px-1 text-[10px] bg-rose-500 text-white border-0 rounded-full">
              {count > 99 ? "99+" : count}
            </Badge>
          )}
        </Link>
      </Button>

      <AlertDialog open={popup.length > 0}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-primary" />
              선생님의 새 학습평가가 도착했어요
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 max-h-[50vh] overflow-y-auto pt-2">
                {popup.map((n) => {
                  const grade = n.grade as ApprovalGrade | null;
                  return (
                    <div key={n.id} className="rounded-md border bg-card p-3 text-sm text-foreground">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        {grade && GRADE_LABEL[grade] && (
                          <Badge className={GRADE_BADGE_CLASS[grade]}>{GRADE_LABEL[grade]}</Badge>
                        )}
                        <span className="font-semibold">{n.title}</span>
                        {n.sentence_id && (
                          <span className="text-xs text-muted-foreground">[{n.sentence_id}]</span>
                        )}
                      </div>
                      {n.body && (
                        <p className="text-foreground/80 whitespace-pre-wrap">{n.body}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" asChild>
              <Link to="/learn/notifications" onClick={onDismiss}>알림함 열기</Link>
            </Button>
            <AlertDialogAction onClick={onDismiss}>확인</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

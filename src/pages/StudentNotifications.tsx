import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Bell, CheckCheck, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  fetchMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  subscribeMyNotifications,
  type StudentNotification,
} from "@/lib/studentNotifications";
import { GRADE_BADGE_CLASS, GRADE_LABEL, type ApprovalGrade } from "@/lib/sentenceApprovals";

const fmt = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export default function StudentNotifications() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<StudentNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    setLoading(true);
    try {
      setRows(await fetchMyNotifications(200));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    if (!user?.id) return;
    return subscribeMyNotifications(user.id, reload);
  }, [user?.id]);

  const onRowClick = async (n: StudentNotification) => {
    if (!n.read_at) {
      await markNotificationRead(n.id);
      setRows((prev) =>
        prev.map((r) => (r.id === n.id ? { ...r, read_at: new Date().toISOString() } : r)),
      );
    }
    if (n.sentence_id) navigate(`/learn/sentence/${n.sentence_id}`);
  };

  const onMarkAll = async () => {
    await markAllNotificationsRead();
    setRows((prev) => prev.map((r) => ({ ...r, read_at: r.read_at ?? new Date().toISOString() })));
  };

  const unreadCount = rows.filter((r) => !r.read_at).length;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" asChild>
              <Link to="/learn"><ArrowLeft className="w-4 h-4 mr-1" /> 홈</Link>
            </Button>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Bell className="w-5 h-5" /> 알림함
              {unreadCount > 0 && (
                <Badge className="bg-rose-500 text-white">{unreadCount} 새 알림</Badge>
              )}
            </h1>
          </div>
          {unreadCount > 0 && (
            <Button size="sm" variant="outline" onClick={onMarkAll}>
              <CheckCheck className="w-4 h-4 mr-1" /> 모두 읽음
            </Button>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <Card className="p-10 text-center text-muted-foreground">받은 알림이 없습니다.</Card>
        ) : (
          <div className="space-y-2">
            {rows.map((n) => {
              const grade = n.grade as ApprovalGrade | null;
              return (
                <Card
                  key={n.id}
                  onClick={() => onRowClick(n)}
                  className={`p-4 cursor-pointer transition hover:shadow ${
                    n.read_at ? "opacity-70" : "border-l-4 border-l-primary bg-primary/5"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {!n.read_at && <Badge className="bg-rose-500 text-white">NEW</Badge>}
                        {grade && GRADE_LABEL[grade] && (
                          <Badge className={GRADE_BADGE_CLASS[grade]}>{GRADE_LABEL[grade]}</Badge>
                        )}
                        <span className="font-semibold">{n.title}</span>
                        {n.sentence_id && (
                          <span className="text-xs text-muted-foreground">[{n.sentence_id}]</span>
                        )}
                      </div>
                      {n.body && (
                        <p className="mt-2 text-sm whitespace-pre-wrap text-foreground/80">
                          {n.body}
                        </p>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {fmt(n.created_at)}
                    </span>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Bell,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  markAllNotificationsRead,
  markNotificationRead,
  subscribeMyNotifications,
  type StudentNotification,
} from "@/lib/studentNotifications";
import { GRADE_BADGE_CLASS, GRADE_LABEL, type ApprovalGrade } from "@/lib/sentenceApprovals";
import { SentenceReviewDetail } from "@/components/student/SentenceReviewDetail";
import { fetchMyInboxWithStatus, isCurrentNotification, type RedoStatus } from "@/lib/studentInbox";
import { redoNotificationPath } from "@/lib/redoNotifications";
import { toast } from "@/hooks/use-toast";

const fmt = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export default function StudentNotifications() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<StudentNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [tab, setTab] = useState<"current" | "past">("current");
  const [redoStatus, setRedoStatus] = useState<Map<string, RedoStatus>>(new Map());

  const reload = async () => {
    setLoading(true);
    try {
      const inbox = await fetchMyInboxWithStatus(200);
      setRows(inbox.rows);
      setRedoStatus(inbox.status);
    } catch (e) {
      toast({ title: "알림을 불러오지 못했어요", description: "잠시 후 다시 열어 주세요.", variant: "destructive" });
      console.warn("[StudentNotifications] load failed", e);
    } finally {
      setLoading(false);
    }
  };

  /** 재학습 대기 알림 → 해당 문장 재학습으로 바로 이동 (읽음 처리는 실제 재제출 때 자동) */
  const onRedo = async (n: StudentNotification) => {
    try {
      navigate(await redoNotificationPath(n));
    } catch (e) {
      toast({ title: "재학습을 열지 못했어요", description: String(e), variant: "destructive" });
    }
  };

  useEffect(() => {
    reload();
    if (!user?.id) return;
    return subscribeMyNotifications(user.id, reload);
  }, [user?.id]);

  /** [확인] → 읽음 처리 후 지난 알림으로 이동 */
  const onConfirm = async (n: StudentNotification) => {
    if (n.read_at) return;
    setRows((prev) =>
      prev.map((r) => (r.id === n.id ? { ...r, read_at: new Date().toISOString() } : r)),
    );
    setOpenId((prev) => (prev === n.id ? null : prev));
    await markNotificationRead(n.id);
  };

  const onRowClick = (n: StudentNotification) => {
    if (n.sentence_id) setOpenId((prev) => (prev === n.id ? null : n.id));
  };

  const onMarkAll = async () => {
    setRows((prev) => prev.map((r) => ({ ...r, read_at: r.read_at ?? new Date().toISOString() })));
    await markAllNotificationsRead();
  };

  const currentRows = rows.filter((r) => isCurrentNotification(r, redoStatus));
  const pastRows = rows.filter((r) => !isCurrentNotification(r, redoStatus));
  const visible = tab === "current" ? currentRows : pastRows;
  const unreadCount = currentRows.length;
  // '모두 확인'은 일반 알림만 정리한다. 재학습은 다시 제출해야 사라진다.
  const confirmableCount = currentRows.filter((r) => !r.read_at && redoStatus.get(r.id) !== "pending").length;

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
          {confirmableCount > 0 && (
            <Button size="sm" variant="outline" onClick={onMarkAll}>
              <CheckCheck className="w-4 h-4 mr-1" /> 모두 확인
            </Button>
          )}
        </div>

        <div className="flex gap-2">
          <Button
            size="sm"
            variant={tab === "current" ? "default" : "outline"}
            onClick={() => setTab("current")}
          >
            현재 알림 {currentRows.length > 0 && `(${currentRows.length})`}
          </Button>
          <Button
            size="sm"
            variant={tab === "past" ? "default" : "outline"}
            onClick={() => setTab("past")}
          >
            지난 알림 {pastRows.length > 0 && `(${pastRows.length})`}
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : visible.length === 0 ? (
          <Card className="p-10 text-center text-muted-foreground">
            {tab === "current" ? "새 알림이 없습니다." : "지난 알림이 없습니다."}
          </Card>
        ) : (
          <div className="space-y-2">
            {visible.map((n) => {
              const grade = n.grade as ApprovalGrade | null;
              const expandable = !!n.sentence_id;
              const open = openId === n.id;
              const rs = redoStatus.get(n.id);
              const isCurrent = isCurrentNotification(n, redoStatus);
              return (
                <Card
                  key={n.id}
                  className={`p-4 transition ${
                    isCurrent ? "border-l-4 border-l-primary bg-primary/5" : "opacity-70"
                  }`}
                >
                  <div
                    onClick={() => onRowClick(n)}
                    className="flex items-start justify-between gap-2 cursor-pointer"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {expandable &&
                          (open ? (
                            <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                          ))}
                        {!n.read_at && rs !== "pending" && <Badge className="bg-rose-500 text-white">NEW</Badge>}
                        {rs === "pending" && (
                          <Badge variant="destructive">재학습 해야 함</Badge>
                        )}
                        {rs === "done" && (
                          <Badge variant="secondary" className="gap-1">
                            <Check className="w-3 h-3" /> 재학습 완료
                          </Badge>
                        )}
                        {grade && GRADE_LABEL[grade] && (
                          <Badge className={GRADE_BADGE_CLASS[grade]}>{GRADE_LABEL[grade]}</Badge>
                        )}
                        <span className="font-semibold">
                          {n.title.startsWith("첨삭리포트:") ? "첨삭 리포트" : n.title}
                        </span>
                        {n.sentence_id && (
                          <span className="text-xs text-muted-foreground">[{n.sentence_id}]</span>
                        )}
                      </div>
                      {n.body && !open && (
                        <p className="mt-2 text-sm whitespace-pre-wrap text-foreground/80 line-clamp-2">
                          {n.body}
                        </p>
                      )}
                      {n.title.startsWith("첨삭리포트:") && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            const [from, to] = n.title.replace("첨삭리포트:", "").split("~");
                            navigate(`/student/report?from=${from}&to=${to}`);
                          }}
                        >
                          리포트 보기
                        </Button>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <span className="text-xs text-muted-foreground">{fmt(n.created_at)}</span>
                      {rs === "pending" ? (
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            void onRedo(n);
                          }}
                        >
                          <RefreshCw className="w-4 h-4 mr-1" /> 재학습 하기
                        </Button>
                      ) : !n.read_at && rs !== "done" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            void onConfirm(n);
                          }}
                        >
                          <Check className="w-4 h-4 mr-1" /> 확인
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  {expandable && open && user?.id && (
                    <div className="mt-3 pt-3 border-t space-y-3">
                      <SentenceReviewDetail
                        sentenceId={n.sentence_id!}
                        userId={user.id}
                        memo={n.body ?? null}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => navigate(`/learn/sentence/${n.sentence_id}`)}
                      >
                        이 문장 다시 열기
                      </Button>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

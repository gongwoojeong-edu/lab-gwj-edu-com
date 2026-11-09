// ============================================================
// RedoAlertBar — 선생님이 "재학습(추가학습)"을 지정하면 학생 화면 어디서든
// 즉시 상단 바로 안내하고, 해당 문장으로 바로 이동시킨다.
// (알림함에 들어가지 않아도 바로 보이게 하기 위한 전역 배너)
// ============================================================
import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStudentNotifications } from "@/hooks/useStudentNotifications";
import { redoNotificationPath } from "@/lib/redoNotifications";
import { toast } from "@/hooks/use-toast";

export function RedoAlertBar() {
  const { pendingRedos, reload, error } = useStudentNotifications();
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const onSentencePath = (sentenceId: string | null) => {
    if (!sentenceId) return false;
    try {
      return decodeURIComponent(pathname) === `/learn/sentence/${sentenceId}`;
    } catch {
      return false;
    }
  };

  // 재학습 알림은 다시 제출할 때까지 남는다. 이미 그 문장을 학습 중이면 배너는 띄우지 않는다.
  const redos = useMemo(
    () => pendingRedos.filter((n) => !dismissed.includes(n.id) && !onSentencePath(n.sentence_id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pendingRedos, dismissed, pathname],
  );
  const current = redos[0];

  if (!current && !error) return null;
  if (pathname.startsWith("/teacher")) return null;

  const goLearn = async () => {
    if (!current || error) { void reload(); return; }
    try {
      const path = await redoNotificationPath(current);
      // 읽음 처리하지 않는다 — 실제로 다시 제출해야 알림함에서 '재학습 완료'로 넘어간다.
      setDismissed((prev) => [...prev, current.id]);
      navigate(path);
    } catch (e) {
      toast({ title: "재학습을 열지 못했어요", description: String(e), variant: "destructive" });
    }
  };

  const close = async () => {
    if (!current) return;
    setDismissed((prev) => [...prev, current.id]);
  };

  return (
    <div className="fixed inset-x-0 top-0 z-[60] px-2 pt-2 pointer-events-none">
      <div className="pointer-events-auto mx-auto flex max-w-3xl flex-wrap items-start gap-3 rounded-lg border border-primary/30 bg-background px-3 py-2 shadow-lg">
        <RefreshCw className="h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="break-words text-sm font-semibold text-foreground">
            {error ? "알림을 불러오지 못했어요" : current?.title}
          </div>
          {current?.body && (
            <div
              className={
                expanded
                  ? "mt-1 max-h-48 overflow-auto whitespace-pre-wrap text-xs text-foreground"
                  : "truncate text-xs text-muted-foreground"
              }
            >
              {current.body}
            </div>
          )}
          {current?.body && (
            <Button
              variant="link"
              size="sm"
              onClick={() => setExpanded((v) => !v)}
              className="mt-0.5 h-auto p-0 text-xs"
            >
              {expanded ? "접기" : "첨삭 내용 보기"}
            </Button>
          )}
        </div>
        {redos.length > 1 && (
          <span className="shrink-0 text-xs text-muted-foreground">
            +{redos.length - 1}
          </span>
        )}
        <Button size="sm" className="shrink-0" onClick={goLearn}>
          {error ? "다시 불러오기" : "바로 학습하기"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 shrink-0 p-0 text-muted-foreground"
          onClick={close}
          aria-label="닫기"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export default RedoAlertBar;

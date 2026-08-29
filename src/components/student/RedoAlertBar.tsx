// ============================================================
// RedoAlertBar — 선생님이 "재학습(추가학습)"을 지정하면 학생 화면 어디서든
// 즉시 상단 바로 안내하고, 해당 문장으로 바로 이동시킨다.
// (알림함에 들어가지 않아도 바로 보이게 하기 위한 전역 배너)
// ============================================================
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStudentNotifications } from "@/hooks/useStudentNotifications";
import { markNotificationRead, type StudentNotification } from "@/lib/studentNotifications";

const isRedo = (n: StudentNotification) =>
  n.grade === "redo" ||
  n.kind === "retest" ||
  n.title.includes("재학습") ||
  n.title.includes("추가학습");

export function RedoAlertBar() {
  const { unread, reload } = useStudentNotifications();
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const redos = useMemo(
    () => unread.filter((n) => isRedo(n) && !dismissed.includes(n.id)),
    [unread, dismissed],
  );
  const current = redos[0];

  // 라우트가 바뀌어도 배너는 유지 — 학생이 확인/이동할 때까지 노출
  useEffect(() => {
    if (!current) return;
    // 이미 해당 문장 학습 화면에 있으면 바는 필요 없음
  }, [current, pathname]);

  if (!current) return null;
  if (pathname.startsWith("/teacher")) return null;

  const goLearn = async () => {
    await markNotificationRead(current.id).catch(() => {});
    setDismissed((prev) => [...prev, current.id]);
    reload();
    if (current.sentence_id) {
      navigate(`/learn/sentence/${encodeURIComponent(current.sentence_id)}?restart=1`);
    } else {
      navigate("/learn/notifications");
    }
  };

  const close = async () => {
    setDismissed((prev) => [...prev, current.id]);
  };

  return (
    <div className="fixed inset-x-0 top-0 z-[60] px-2 pt-2 pointer-events-none">
      <div className="pointer-events-auto mx-auto flex max-w-3xl items-start gap-3 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 shadow-lg dark:border-rose-700 dark:bg-rose-950/80">
        <RefreshCw className="h-5 w-5 shrink-0 text-rose-600" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-rose-900 dark:text-rose-100">
            {current.title}
          </div>
          {current.body && (
            <div
              className={
                expanded
                  ? "mt-1 max-h-48 overflow-auto whitespace-pre-wrap text-xs text-rose-900 dark:text-rose-100"
                  : "truncate text-xs text-rose-800/80 dark:text-rose-200/80"
              }
            >
              {current.body}
            </div>
          )}
          {current.body && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-0.5 text-[11px] font-bold text-rose-700 underline underline-offset-2 dark:text-rose-200"
            >
              {expanded ? "접기" : "첨삭 내용 보기"}
            </button>
          )}
        </div>
        {redos.length > 1 && (
          <span className="shrink-0 text-xs text-rose-700 dark:text-rose-200">
            +{redos.length - 1}
          </span>
        )}
        <Button size="sm" className="shrink-0 bg-rose-600 text-white hover:bg-rose-700" onClick={goLearn}>
          바로 학습하기
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 shrink-0 p-0 text-rose-700"
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

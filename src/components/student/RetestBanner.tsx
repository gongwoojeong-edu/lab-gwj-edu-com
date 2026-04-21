import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  fetchHandoutResultsForUser,
  WORD_HO_PASS_THRESHOLD,
  type HandoutResult,
} from "@/lib/handoutResults";

interface Props {
  userId: string;
}

const DISMISS_KEY = (id: string) => `retest_dismissed_${id}`;

interface Alert {
  id: string;
  date: string;
  kind: "word" | "syntax";
  text: string;
}

const buildAlerts = (rows: HandoutResult[]): Alert[] => {
  const out: Alert[] = [];
  for (const row of rows) {
    if (row.word_ho_score != null && row.word_ho_score < WORD_HO_PASS_THRESHOLD) {
      const id = `${row.id}_word`;
      if (!localStorage.getItem(DISMISS_KEY(id))) {
        out.push({
          id,
          date: row.test_date,
          kind: "word",
          text: `${row.test_date} 단어 핸드아웃 재시험 대상입니다 (점수: ${Number(row.word_ho_score).toFixed(0)}/100)`,
        });
      }
    }
    if (row.syntax_ho_result === "FAIL") {
      const id = `${row.id}_syntax`;
      if (!localStorage.getItem(DISMISS_KEY(id))) {
        out.push({
          id,
          date: row.test_date,
          kind: "syntax",
          text: `${row.test_date} 구문 핸드아웃 재시험 대상입니다`,
        });
      }
    }
  }
  return out;
};

export const useRetestAlertsCount = (userId: string | undefined): number => {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!userId) return;
    fetchHandoutResultsForUser(userId, 7).then((rows) => {
      setCount(buildAlerts(rows).length);
    }).catch(() => setCount(0));
  }, [userId]);
  return count;
};

const RetestBanner = ({ userId }: Props) => {
  const [alerts, setAlerts] = useState<Alert[]>([]);

  useEffect(() => {
    let mounted = true;
    fetchHandoutResultsForUser(userId, 7).then((rows) => {
      if (mounted) setAlerts(buildAlerts(rows));
    }).catch(() => {});
    return () => {
      mounted = false;
    };
  }, [userId]);

  const dismiss = (id: string) => {
    localStorage.setItem(DISMISS_KEY(id), "1");
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  if (alerts.length === 0) return null;

  return (
    <div className="space-y-2">
      {alerts.map((a) => (
        <Card
          key={a.id}
          className="p-3 flex items-center gap-3 bg-amber-50 border-amber-300 dark:bg-amber-950/30 dark:border-amber-700"
        >
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
          <div className="text-sm text-amber-900 dark:text-amber-100 flex-1">⚠️ {a.text}</div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-amber-700 hover:text-amber-900"
            onClick={() => dismiss(a.id)}
            aria-label="닫기"
          >
            <X className="w-4 h-4" />
          </Button>
        </Card>
      ))}
    </div>
  );
};

export default RetestBanner;

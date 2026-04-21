import { useEffect, useState } from "react";
import { Loader2, Printer } from "lucide-react";
import { fetchHandoutResultsForUser, type HandoutResult } from "@/lib/handoutResults";
import { buildDailyTestRecord, INTEGRATED_PASS_THRESHOLD, type DailyTestRecord } from "@/lib/dailyTest";
import { cn } from "@/lib/utils";

interface Props {
  userId: string;
  days?: number;
}

const Bar = ({ value, color }: { value: number | null; color: string }) => (
  <div className="h-2 bg-muted rounded overflow-hidden">
    <div
      className={cn("h-full transition-all", color)}
      style={{ width: `${value ?? 0}%` }}
    />
  </div>
);

const DailyTestSummary = ({ userId, days = 14 }: Props) => {
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<DailyTestRecord[]>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      const rows: HandoutResult[] = await fetchHandoutResultsForUser(userId, days);
      const built = await Promise.all(rows.map((r) => buildDailyTestRecord(userId, r)));
      if (mounted) {
        setRecords(built);
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [userId, days]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-6">
        최근 {days}일간 일간테스트(종합) 데이터가 없습니다.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground">최근 {days}일 · 종합점수 = 분석 40% + 단어 30% + 단어HO 20% + 구문HO 10%</div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="py-1.5 pr-2">날짜</th>
              <th className="py-1.5 pr-2">회차</th>
              <th className="py-1.5 pr-2 w-32">분석</th>
              <th className="py-1.5 pr-2 w-32">단어테스트</th>
              <th className="py-1.5 pr-2 w-32">단어HO</th>
              <th className="py-1.5 pr-2">구문HO</th>
              <th className="py-1.5 pr-2 text-right">종합</th>
              <th className="py-1.5 pr-2">상태</th>
              <th className="py-1.5 pr-2 text-center">인쇄</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r) => {
              const passed =
                r.scores.integrated_total != null && r.scores.integrated_total >= INTEGRATED_PASS_THRESHOLD;
              return (
                <tr key={r.test_date} className="border-b border-border/50">
                  <td className="py-1.5 pr-2 font-mono">{r.test_date}</td>
                  <td className="py-1.5 pr-2 tabular-nums">{r.session_no}회</td>
                  <td className="py-1.5 pr-2">
                    <Bar value={r.scores.online_analysis} color="bg-primary" />
                  </td>
                  <td className="py-1.5 pr-2">
                    <Bar value={r.scores.online_word_test} color="bg-accent" />
                  </td>
                  <td className="py-1.5 pr-2">
                    <Bar value={r.scores.offline_word_handout} color="bg-emerald-500" />
                  </td>
                  <td className="py-1.5 pr-2 text-center">
                    {r.scores.offline_syntax_handout === "PASS" ? (
                      <span className="px-1.5 py-0.5 rounded bg-emerald-500 text-white text-[10px] font-bold">P</span>
                    ) : r.scores.offline_syntax_handout === "FAIL" ? (
                      <span className="px-1.5 py-0.5 rounded bg-amber-500 text-white text-[10px] font-bold">F</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="py-1.5 pr-2 text-right tabular-nums font-bold">
                    {r.scores.integrated_total != null ? r.scores.integrated_total.toFixed(1) : "—"}
                  </td>
                  <td className="py-1.5 pr-2">
                    {r.scores.integrated_total == null ? (
                      <span className="text-[10px] text-muted-foreground">미완성</span>
                    ) : passed ? (
                      <span className="px-1.5 py-0.5 rounded bg-emerald-500 text-white text-[10px] font-bold">PASS</span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded bg-amber-500 text-white text-[10px] font-bold">FAIL</span>
                    )}
                  </td>
                  <td className="py-1.5 pr-2 text-center">
                    {r.printed_count > 0 ? (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-bold">
                        <Printer className="w-3 h-3" />
                        {r.printed_count}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DailyTestSummary;

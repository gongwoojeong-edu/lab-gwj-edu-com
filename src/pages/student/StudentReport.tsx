import { useEffect, useMemo, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Loader2, ChevronLeft, FileText } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { GRADE_LABEL, GRADE_ORDER, type ApprovalGrade } from "@/lib/sentenceApprovals";
import { memoToPlainText, MEMO_FIELD_KEYS, MEMO_FIELD_LABEL } from "@/lib/approvalMemo";
import { StructuredMemoView } from "@/components/learning/StructuredMemoView";
import {
  buildStudentReport,
  fetchCoachingReportSource,
  periodLabel,
  type ReportPeriod,
} from "@/lib/coachingReport";

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

/**
 * 학생용 첨삭 리포트 열람 — 읽기 전용, 본인 데이터만 (RLS).
 * 알림에서 진입: /student/report?from=yyyy-mm-dd&to=yyyy-mm-dd
 */
const StudentReport = () => {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const period: ReportPeriod = useMemo(() => {
    const today = new Date();
    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    return {
      start: params.get("from") ?? iso(weekAgo),
      end: params.get("to") ?? iso(today),
    };
  }, [params]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ReturnType<typeof buildStudentReport> | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    let mounted = true;
    setLoading(true);
    fetchCoachingReportSource(period)
      .then((src) => {
        if (!mounted) return;
        setReport(buildStudentReport(user.id, src));
        setError(null);
      })
      .catch((e) => mounted && setError(e?.message ?? "리포트를 불러오지 못했어요"))
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, [user?.id, period.start, period.end]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link
            to="/learn"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="w-4 h-4" /> 학습 홈
          </Link>
          <h1 className="text-lg font-bold flex items-center gap-2">
            <FileText className="w-5 h-5" /> 첨삭 리포트
          </h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 space-y-4">
        <p className="text-sm text-muted-foreground">{periodLabel(period)}</p>

        {loading ? (
          <div className="py-16 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <Card className="p-6 text-center text-destructive text-sm">{error}</Card>
        ) : !report || (report.passCount === 0 && report.wordTests === 0) ? (
          <Card className="p-10 text-center text-muted-foreground">
            이 기간에는 아직 기록이 없어요.
          </Card>
        ) : (
          <>
            <Card className="p-4 space-y-2">
              <h2 className="font-bold">학습량 · 등급 요약</h2>
              <div className="text-sm">
                통과 문장 <b className="text-lg">{report.passCount}개</b>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {GRADE_ORDER.filter((g) => (report.gradeCounts[g] ?? 0) > 0).map((g) => (
                  <span
                    key={g}
                    className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold"
                  >
                    {GRADE_LABEL[g as ApprovalGrade]} {report.gradeCounts[g]}
                  </span>
                ))}
              </div>
              {report.wordAvg != null && (
                <div className="text-sm text-muted-foreground">
                  단어테스트 평균 {report.wordAvg}% · 최저 {report.wordMin}% · {report.wordTests}회
                </div>
              )}
            </Card>

            {report.praises.length > 0 && (
              <Card className="p-4 space-y-1.5">
                <h2 className="font-bold">받은 칭찬 💪</h2>
                {report.praises.map((t, i) => (
                  <div key={i} className="text-sm">
                    {t}
                  </div>
                ))}
              </Card>
            )}

            {(report.redoCount > 0 ||
              MEMO_FIELD_KEYS.some((k) => report.memoFieldCounts[k] > 0)) && (
              <Card className="p-4 space-y-1.5">
                <h2 className="font-bold">재학습 · 집중 포인트</h2>
                {report.redoCount > 0 && (
                  <div className="text-sm">재학습 지정 {report.redoCount}회</div>
                )}
                {MEMO_FIELD_KEYS.filter((k) => report.memoFieldCounts[k] > 0).map((k) => (
                  <div key={k} className="text-sm text-muted-foreground">
                    {MEMO_FIELD_LABEL[k]} · {report.memoFieldCounts[k]}회
                  </div>
                ))}
              </Card>
            )}

            {report.memos.length > 0 && (
              <Card className="p-4 space-y-2">
                <h2 className="font-bold">선생님 첨삭 메모 ({report.memos.length}건)</h2>
                <div className="space-y-2">
                  {report.memos.map((m, i) => (
                    <div key={i} className="border border-border rounded-lg p-3 space-y-1">
                      <div className="text-xs text-muted-foreground">
                        <b className="font-mono">{m.sentenceId}</b>
                        {m.grade && <> · {GRADE_LABEL[m.grade]}</>} · {fmtDate(m.at)}
                      </div>
                      <StructuredMemoView raw={m.memo} fallback={memoToPlainText(m.memo)} />
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {report.handouts.length > 0 && (
              <Card className="p-4 space-y-1.5">
                <h2 className="font-bold">핸드아웃 성적</h2>
                {report.handouts.map((h, i) => (
                  <div key={i} className="text-sm text-muted-foreground">
                    {h.testDate} {h.sessionNo}차시 · 단어HO {h.wordHoScore ?? "-"} · 구문HO{" "}
                    {h.syntaxHoResult ?? "-"}
                  </div>
                ))}
              </Card>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default StudentReport;

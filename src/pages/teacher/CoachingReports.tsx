import { useEffect, useMemo, useState } from "react";
import { TeacherLayout } from "@/components/teacher/TeacherLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Send, Printer, FileText, CheckCircle2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { fetchActiveStudents, type StudentProfile } from "@/lib/studentProfile";
import { GRADE_LABEL, GRADE_ORDER, type ApprovalGrade } from "@/lib/sentenceApprovals";
import { memoToPlainText, MEMO_FIELD_KEYS, MEMO_FIELD_LABEL } from "@/lib/approvalMemo";
import {
  buildStudentReport,
  fetchCoachingReportSource,
  fetchSentReportUserIds,
  periodLabel,
  presetPeriod,
  sendCoachingReport,
  PERIOD_PRESET_LABEL,
  type CoachingReportSource,
  type PeriodPreset,
  type ReportPeriod,
  type StudentCoachingReport,
} from "@/lib/coachingReport";
import { launchPrintHtml } from "@/lib/printLauncher";
import { buildCoachingReportHtml } from "@/lib/printTemplates";

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

const gradeSummaryText = (r: StudentCoachingReport): string =>
  GRADE_ORDER.filter((g) => (r.gradeCounts[g] ?? 0) > 0)
    .map((g) => `${GRADE_LABEL[g]} ${r.gradeCounts[g]}`)
    .join(" · ");

const memoFieldSummaryText = (r: StudentCoachingReport): string =>
  MEMO_FIELD_KEYS.filter((k) => r.memoFieldCounts[k] > 0)
    .map((k) => `${MEMO_FIELD_LABEL[k].split("—")[0].trim()} ${r.memoFieldCounts[k]}회`)
    .join(" · ");

const CoachingReports = () => {
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [preset, setPreset] = useState<PeriodPreset>("this_week");
  const [custom, setCustom] = useState<ReportPeriod | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [src, setSrc] = useState<CoachingReportSource | null>(null);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState<Set<string>>(new Set());

  const period: ReportPeriod = custom ?? presetPeriod(preset);
  const pLabel = periodLabel(period);

  useEffect(() => {
    fetchActiveStudents().then(setStudents).catch(() => setStudents([]));
  }, []);

  // 기간이 바뀌면 자동 집계 + 발송 기록 조회
  useEffect(() => {
    let mounted = true;
    setLoading(true);
    Promise.all([fetchCoachingReportSource(period), fetchSentReportUserIds(period)])
      .then(([s, sent]) => {
        if (!mounted) return;
        setSrc(s);
        setSentIds(sent);
      })
      .catch((e) =>
        toast({ title: "집계 실패", description: e?.message ?? "", variant: "destructive" }),
      )
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period.start, period.end]);

  const reports = useMemo(() => {
    if (!src) return [];
    return students
      .filter((s) => !excluded.has(s.user_id))
      .map((s) => ({ student: s, report: buildStudentReport(s.user_id, src) }))
      .filter(
        ({ report }) =>
          report.passCount > 0 ||
          report.wordTests > 0 ||
          report.handouts.length > 0 ||
          report.redoCount > 0,
      );
  }, [src, students, excluded]);

  const toggleExcluded = (uid: string) =>
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });

  const doSend = async (uid: string, report: StudentCoachingReport) => {
    setSending((prev) => new Set(prev).add(uid));
    try {
      await sendCoachingReport(uid, period, report, pLabel);
      setSentIds((prev) => new Set(prev).add(uid));
      toast({ title: "리포트를 발송했어요", description: "학생 알림함에서 확인할 수 있습니다." });
    } catch (e: any) {
      toast({ title: "발송 실패", description: e?.message ?? "", variant: "destructive" });
    } finally {
      setSending((prev) => {
        const next = new Set(prev);
        next.delete(uid);
        return next;
      });
    }
  };

  const sendAll = async () => {
    for (const { student, report } of reports) {
      if (sentIds.has(student.user_id)) continue;
      // 순차 발송 — 실패 시에도 나머지 계속
      // eslint-disable-next-line no-await-in-loop
      await doSend(student.user_id, report);
    }
  };

  const printOne = (student: StudentProfile, report: StudentCoachingReport) => {
    const html = buildCoachingReportHtml({
      studentName: student.display_name ?? "",
      studentNo: student.student_no,
      periodLabel: pLabel,
      passCount: report.passCount,
      gradeSummary: gradeSummaryText(report),
      praises: report.praises,
      memos: report.memos.map((m) => ({
        sentenceId: m.sentenceId,
        gradeLabel: m.grade ? GRADE_LABEL[m.grade] : "-",
        atLabel: fmtDate(m.at),
        plainMemo: memoToPlainText(m.memo),
      })),
      redoCount: report.redoCount,
      memoFieldSummary: memoFieldSummaryText(report),
      wordAvg: report.wordAvg,
      wordMin: report.wordMin,
      wordTests: report.wordTests,
      handouts: report.handouts,
    });
    void launchPrintHtml(html, { jobKey: `coaching-report:${student.user_id}` });
  };

  return (
    <TeacherLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="w-6 h-6" /> 첨삭 리포트 발송
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            기간을 고르면 학생별 리포트가 자동으로 만들어집니다. 확인 후 발송하거나 인쇄하세요.
          </p>
        </div>

        <Card className="p-3 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            {(Object.keys(PERIOD_PRESET_LABEL) as PeriodPreset[]).map((p) => (
              <Button
                key={p}
                size="sm"
                variant={!custom && preset === p ? "default" : "outline"}
                onClick={() => {
                  setPreset(p);
                  setCustom(null);
                }}
              >
                {PERIOD_PRESET_LABEL[p]}
              </Button>
            ))}
            <div className="flex items-center gap-1 ml-2">
              <Input
                type="date"
                className="w-36 h-8"
                value={period.start}
                onChange={(e) => setCustom({ start: e.target.value, end: period.end })}
              />
              <span className="text-xs text-muted-foreground">~</span>
              <Input
                type="date"
                className="w-36 h-8"
                value={period.end}
                onChange={(e) => setCustom({ start: period.start, end: e.target.value })}
              />
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap border-t border-border pt-3">
            <span className="text-xs font-semibold text-muted-foreground">학생 선택</span>
            {students.map((s) => (
              <label key={s.user_id} className="flex items-center gap-1.5 text-sm cursor-pointer">
                <Checkbox
                  checked={!excluded.has(s.user_id)}
                  onCheckedChange={() => toggleExcluded(s.user_id)}
                />
                {s.display_name}
              </label>
            ))}
          </div>
        </Card>

        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {loading ? "집계 중…" : `리포트 ${reports.length}명 · ${pLabel}`}
          </span>
          <Button
            size="sm"
            onClick={sendAll}
            disabled={loading || reports.every((r) => sentIds.has(r.student.user_id))}
          >
            <Send className="w-4 h-4 mr-1" /> 선택 학생 일괄 발송
          </Button>
        </div>

        {loading ? (
          <div className="py-16 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : reports.length === 0 ? (
          <Card className="p-10 text-center text-muted-foreground">
            이 기간에 활동 기록이 있는 학생이 없습니다.
          </Card>
        ) : (
          <div className="space-y-3">
            {reports.map(({ student, report }) => {
              const sent = sentIds.has(student.user_id);
              return (
                <Card key={student.user_id} className="p-4 space-y-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold">{student.display_name}</span>
                      <span className="text-xs text-muted-foreground font-mono">
                        {student.student_no}
                      </span>
                      {sent && (
                        <Badge className="bg-emerald-600 text-white">
                          <CheckCircle2 className="w-3 h-3 mr-1" /> 발송완료
                        </Badge>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => printOne(student, report)}
                      >
                        <Printer className="w-4 h-4 mr-1" /> 인쇄/PDF
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => doSend(student.user_id, report)}
                        disabled={sending.has(student.user_id)}
                      >
                        {sending.has(student.user_id) ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <>
                            <Send className="w-4 h-4 mr-1" /> {sent ? "재발송" : "앱으로 발송"}
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  <div className="text-sm space-y-1">
                    <div>
                      통과 문장 <b>{report.passCount}개</b>
                      {gradeSummaryText(report) && (
                        <span className="text-muted-foreground"> · {gradeSummaryText(report)}</span>
                      )}
                    </div>
                    {report.wordAvg != null && (
                      <div className="text-muted-foreground">
                        단어테스트 평균 {report.wordAvg}% · 최저 {report.wordMin}% ·{" "}
                        {report.wordTests}회
                      </div>
                    )}
                    {report.redoCount > 0 && (
                      <div className="text-amber-600 dark:text-amber-400">
                        재학습 지정 {report.redoCount}회
                      </div>
                    )}
                    {memoFieldSummaryText(report) && (
                      <div className="text-muted-foreground">
                        항목별 지적 · {memoFieldSummaryText(report)}
                      </div>
                    )}
                    {report.handouts.length > 0 && (
                      <div className="text-muted-foreground">
                        핸드아웃 {report.handouts.length}건 기록
                      </div>
                    )}
                    {report.memos.length > 0 && (
                      <div className="text-muted-foreground">
                        첨삭 메모 {report.memos.length}건
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </TeacherLayout>
  );
};

export default CoachingReports;

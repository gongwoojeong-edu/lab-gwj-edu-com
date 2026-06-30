import { useEffect, useMemo, useState } from "react";
import { TeacherLayout } from "@/components/teacher/TeacherLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Printer, CalendarDays, Users, FileText, RotateCcw } from "lucide-react";
import { GRADE_BADGE_CLASS, GRADE_LABEL, type ApprovalGrade } from "@/lib/sentenceApprovals";
import { toast } from "@/hooks/use-toast";

interface StudentRow {
  user_id: string;
  display_name: string;
  student_no: string;
  current_level: string | null;
}

interface ApprovalRow {
  id: string;
  user_id: string;
  sentence_id: string;
  attempt_no: number;
  status: string;
  grade: string | null;
  memo: string | null;
  approved_at: string | null;
  requested_at: string;
  approved_by: string | null;
}

interface AttemptLog {
  user_id: string;
  sentence_id: string;
  attempt_no: number;
  analysis_match_rate: number | null;
  completed_at: string;
}

interface WordResult {
  user_id: string | null;
  sentence_id: string | null;
  score: number | null;
  taken_at: string;
}

interface ReviewReq {
  user_id: string;
  sentence_id: string;
  created_at: string;
}

const ymd = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const fmt = (iso: string) => {
  const d = new Date(iso);
  return `${ymd(iso)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

const TODAY = new Date();
const defaultStart = new Date(TODAY.getFullYear(), TODAY.getMonth(), 1);
const toInputDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default function EvaluationReports() {
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [start, setStart] = useState<string>(toInputDate(defaultStart));
  const [end, setEnd] = useState<string>(toInputDate(TODAY));
  const [selectedStudent, setSelectedStudent] = useState<string>("");

  const [approvals, setApprovals] = useState<ApprovalRow[]>([]);
  const [attempts, setAttempts] = useState<AttemptLog[]>([]);
  const [wordResults, setWordResults] = useState<WordResult[]>([]);
  const [reviewReqs, setReviewReqs] = useState<ReviewReq[]>([]);
  const [loading, setLoading] = useState(false);

  // 학생 로드
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("student_profiles")
        .select("user_id, display_name, student_no, current_level")
        .eq("orbit_enrollment_active", true)
        .order("display_name", { ascending: true });
      const rows = (data ?? []) as StudentRow[];
      setStudents(rows);
      if (!selectedStudent && rows.length > 0) setSelectedStudent(rows[0].user_id);
    })();
  }, []);

  const studentMap = useMemo(() => {
    const m = new Map<string, StudentRow>();
    students.forEach((s) => m.set(s.user_id, s));
    return m;
  }, [students]);

  const reload = async () => {
    if (!start || !end) return;
    setLoading(true);
    try {
      const startIso = new Date(start + "T00:00:00").toISOString();
      const endIso = new Date(end + "T23:59:59.999").toISOString();
      const [ap, at, wr, rr] = await Promise.all([
        supabase
          .from("sentence_approvals")
          .select("id,user_id,sentence_id,attempt_no,status,grade,memo,approved_at,requested_at,approved_by")
          .eq("status", "approved")
          .gte("approved_at", startIso)
          .lte("approved_at", endIso)
          .order("approved_at", { ascending: false }),
        supabase
          .from("sentence_attempt_logs")
          .select("user_id,sentence_id,attempt_no,analysis_match_rate,completed_at")
          .gte("completed_at", startIso)
          .lte("completed_at", endIso),
        supabase
          .from("word_test_results")
          .select("user_id,sentence_id,score,taken_at")
          .gte("taken_at", startIso)
          .lte("taken_at", endIso),
        supabase
          .from("analysis_review_requests")
          .select("user_id,sentence_id,created_at")
          .gte("created_at", startIso)
          .lte("created_at", endIso),
      ]);
      setApprovals((ap.data ?? []) as ApprovalRow[]);
      setAttempts((at.data ?? []) as AttemptLog[]);
      setWordResults((wr.data ?? []) as WordResult[]);
      setReviewReqs((rr.data ?? []) as ReviewReq[]);
    } catch (e: any) {
      toast({ title: "조회 실패", description: e?.message ?? "", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, end]);

  // analysis_match_rate 는 0~1 비율로 가정 → %로 변환
  const toPct = (v: number | null | undefined) => {
    if (v == null) return null;
    const n = Number(v);
    if (!isFinite(n)) return null;
    return n <= 1 ? Math.round(n * 100) : Math.round(n);
  };

  const findAnalysisPct = (uid: string, sid: string, attemptNo: number) => {
    const exact = attempts.find((a) => a.user_id === uid && a.sentence_id === sid && a.attempt_no === attemptNo);
    if (exact) return toPct(exact.analysis_match_rate);
    const any = attempts
      .filter((a) => a.user_id === uid && a.sentence_id === sid)
      .sort((a, b) => b.attempt_no - a.attempt_no)[0];
    return any ? toPct(any.analysis_match_rate) : null;
  };
  const findWordPct = (uid: string, sid: string) => {
    const w = wordResults
      .filter((r) => r.user_id === uid && r.sentence_id === sid && r.score != null)
      .sort((a, b) => +new Date(b.taken_at) - +new Date(a.taken_at))[0];
    return w?.score != null ? Math.round(Number(w.score)) : null;
  };
  const findRetestCount = (uid: string, sid: string) =>
    reviewReqs.filter((r) => r.user_id === uid && r.sentence_id === sid).length;

  const byStudent = useMemo(() => {
    const studentApprovals = selectedStudent
      ? approvals.filter((a) => a.user_id === selectedStudent)
      : [];
    return studentApprovals;
  }, [approvals, selectedStudent]);

  const byDate = useMemo(() => {
    const groups: Record<string, ApprovalRow[]> = {};
    approvals.forEach((a) => {
      const key = ymd(a.approved_at ?? a.requested_at);
      (groups[key] ||= []).push(a);
    });
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
  }, [approvals]);

  const exportCsv = (rows: ApprovalRow[], filename: string) => {
    const header = ["승인일시", "학생", "학번", "문장ID", "시도", "등급", "분석정답률(%)", "단어점수(%)", "재학습요청", "메모"];
    const lines = rows.map((r) => {
      const s = studentMap.get(r.user_id);
      const ap = findAnalysisPct(r.user_id, r.sentence_id, r.attempt_no);
      const wp = findWordPct(r.user_id, r.sentence_id);
      const rc = findRetestCount(r.user_id, r.sentence_id);
      return [
        fmt(r.approved_at ?? r.requested_at),
        s?.display_name ?? "",
        s?.student_no ?? "",
        r.sentence_id,
        r.attempt_no,
        r.grade ? GRADE_LABEL[r.grade as ApprovalGrade] ?? r.grade : "",
        ap ?? "",
        wp ?? "",
        rc,
        (r.memo ?? "").replace(/"/g, '""'),
      ]
        .map((v) => `"${v}"`)
        .join(",");
    });
    const csv = "\uFEFF" + [header.map((h) => `"${h}"`).join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const Row = ({ r }: { r: ApprovalRow }) => {
    const s = studentMap.get(r.user_id);
    const grade = r.grade as ApprovalGrade | null;
    const ap = findAnalysisPct(r.user_id, r.sentence_id, r.attempt_no);
    const wp = findWordPct(r.user_id, r.sentence_id);
    const rc = findRetestCount(r.user_id, r.sentence_id);
    return (
      <div className="border rounded-md p-3 text-sm bg-card">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">{fmt(r.approved_at ?? r.requested_at)}</span>
          <span className="font-semibold">{s?.display_name ?? r.user_id.slice(0, 6)}</span>
          <span className="text-xs text-muted-foreground">{s?.student_no}</span>
          <Badge variant="outline">{r.sentence_id}</Badge>
          <span className="text-xs text-muted-foreground">시도 #{r.attempt_no}</span>
          {grade && GRADE_LABEL[grade] && (
            <Badge className={GRADE_BADGE_CLASS[grade]}>{GRADE_LABEL[grade]}</Badge>
          )}
          {ap != null && <Badge variant="secondary">분석 {ap}%</Badge>}
          {wp != null && <Badge variant="secondary">단어 {wp}%</Badge>}
          {rc > 0 && (
            <Badge className="bg-amber-500 text-white">
              <RotateCcw className="w-3 h-3 mr-1" />
              재학습 {rc}
            </Badge>
          )}
        </div>
        {r.memo && <p className="mt-2 whitespace-pre-wrap text-foreground/80">📝 {r.memo}</p>}
      </div>
    );
  };

  return (
    <TeacherLayout>
      <div className="p-4 space-y-4 print:p-0">
        <div className="flex items-center justify-between flex-wrap gap-2 print:hidden">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="w-6 h-6" /> 학습평가 리포트
          </h1>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="w-4 h-4 mr-1" /> 인쇄
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                exportCsv(approvals, `학습평가_${start}_${end}.csv`)
              }
            >
              CSV 내려받기
            </Button>
          </div>
        </div>

        <Card className="p-3 flex items-end gap-3 flex-wrap print:hidden">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">시작일</label>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="w-40" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">종료일</label>
            <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="w-40" />
          </div>
          <Button size="sm" onClick={reload} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "조회"}
          </Button>
          <span className="text-xs text-muted-foreground">총 {approvals.length}건</span>
        </Card>

        <Tabs defaultValue="by-date">
          <TabsList>
            <TabsTrigger value="by-date">
              <CalendarDays className="w-4 h-4 mr-1" /> 날짜별
            </TabsTrigger>
            <TabsTrigger value="by-student">
              <Users className="w-4 h-4 mr-1" /> 학생별
            </TabsTrigger>
          </TabsList>

          <TabsContent value="by-date" className="space-y-4 mt-3">
            {loading ? (
              <div className="py-10 flex justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : byDate.length === 0 ? (
              <Card className="p-10 text-center text-muted-foreground">기간 내 평가 기록이 없습니다.</Card>
            ) : (
              byDate.map(([date, rows]) => (
                <Card key={date} className="p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-lg">{date}</h3>
                    <Badge variant="secondary">{rows.length}건</Badge>
                  </div>
                  <div className="space-y-2">
                    {rows.map((r) => (
                      <Row key={r.id} r={r} />
                    ))}
                  </div>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="by-student" className="space-y-3 mt-3">
            <div className="flex items-center gap-2 print:hidden">
              <Select value={selectedStudent} onValueChange={setSelectedStudent}>
                <SelectTrigger className="w-60">
                  <SelectValue placeholder="학생 선택" />
                </SelectTrigger>
                <SelectContent>
                  {students.map((s) => (
                    <SelectItem key={s.user_id} value={s.user_id}>
                      {s.display_name} ({s.student_no})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Badge variant="secondary">{byStudent.length}건</Badge>
            </div>

            {byStudent.length === 0 ? (
              <Card className="p-10 text-center text-muted-foreground">선택한 학생의 평가 기록이 없습니다.</Card>
            ) : (
              <Card className="p-3 space-y-2">
                {byStudent.map((r) => (
                  <Row key={r.id} r={r} />
                ))}
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </TeacherLayout>
  );
}

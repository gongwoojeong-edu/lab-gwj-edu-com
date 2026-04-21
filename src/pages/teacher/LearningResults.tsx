// ============================================================
// LearningResults — 학습결과함
// 인쇄 완료된 시험지(`print_requests.status='printed'`) 기준으로
// 학생별 그날 결과(handout 점수 + 최신 분석/단어시험 점수)를 모아 보여줌.
// ============================================================
import { useEffect, useMemo, useState } from "react";
import { TeacherLayout } from "@/components/teacher/TeacherLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Archive, Loader2, Printer, RefreshCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toIsoDate, type HandoutResult } from "@/lib/handoutResults";

interface PrintedRow {
  id: string;
  user_id: string;
  sentence_id: string;
  handled_at: string;
}
interface StudentInfo {
  user_id: string;
  display_name: string | null;
  student_no: string;
}
interface AttemptStat {
  best_word_score: number | null;
  best_analysis_rate: number | null;
  word_passed: boolean;
  analysis_passed: boolean;
}

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });

const LearningResults = () => {
  const [date, setDate] = useState<string>(toIsoDate(new Date()));
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<PrintedRow[]>([]);
  const [students, setStudents] = useState<Record<string, StudentInfo>>({});
  const [handoutMap, setHandoutMap] = useState<Record<string, HandoutResult>>({});
  const [attemptMap, setAttemptMap] = useState<Record<string, AttemptStat>>({}); // key: `${user_id}::${sentence_id}`

  const refresh = async () => {
    setLoading(true);
    try {
      const startIso = `${date}T00:00:00`;
      const endIso = `${date}T23:59:59.999`;

      // 1) printed rows for the date
      const { data: pr } = await supabase
        .from("print_requests")
        .select("id, user_id, sentence_id, handled_at")
        .eq("status", "printed")
        .gte("handled_at", startIso)
        .lte("handled_at", endIso)
        .order("handled_at", { ascending: true });
      const printed = (pr ?? []) as PrintedRow[];
      setRows(printed);

      const userIds = Array.from(new Set(printed.map((r) => r.user_id)));
      const sentenceIds = Array.from(new Set(printed.map((r) => r.sentence_id)));

      if (userIds.length === 0) {
        setStudents({});
        setHandoutMap({});
        setAttemptMap({});
        return;
      }

      // 2) student info
      const { data: sp } = await supabase
        .from("student_profiles")
        .select("user_id, display_name, student_no")
        .in("user_id", userIds);
      const sMap: Record<string, StudentInfo> = {};
      (sp ?? []).forEach((s) => (sMap[s.user_id] = s as StudentInfo));
      setStudents(sMap);

      // 3) handout_results for the date (already keyed by user_id but we need date filter too)
      const { data: hr } = await supabase
        .from("handout_results")
        .select("*")
        .eq("test_date", date)
        .in("user_id", userIds);
      const hMap: Record<string, HandoutResult> = {};
      (hr ?? []).forEach((r) => (hMap[(r as HandoutResult).user_id] = r as HandoutResult));
      setHandoutMap(hMap);

      // 4) sentence attempt stats per (user, sentence)
      if (sentenceIds.length > 0) {
        const { data: logs } = await supabase
          .from("sentence_attempt_logs")
          .select("user_id, sentence_id, word_test_score, word_test_passed, analysis_match_rate, analysis_passed")
          .in("user_id", userIds)
          .in("sentence_id", sentenceIds);
        const aMap: Record<string, AttemptStat> = {};
        (logs ?? []).forEach((l) => {
          const key = `${l.user_id}::${l.sentence_id}`;
          const cur = aMap[key] ?? {
            best_word_score: null,
            best_analysis_rate: null,
            word_passed: false,
            analysis_passed: false,
          };
          const ws = Number(l.word_test_score ?? 0);
          const ar = Number(l.analysis_match_rate ?? 0);
          aMap[key] = {
            best_word_score: cur.best_word_score == null ? ws : Math.max(cur.best_word_score, ws),
            best_analysis_rate:
              cur.best_analysis_rate == null ? ar : Math.max(cur.best_analysis_rate, ar),
            word_passed: cur.word_passed || !!l.word_test_passed,
            analysis_passed: cur.analysis_passed || !!l.analysis_passed,
          };
        });
        setAttemptMap(aMap);
      } else {
        setAttemptMap({});
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, [date]);

  // group rows by student
  const grouped = useMemo(() => {
    const m = new Map<string, PrintedRow[]>();
    rows.forEach((r) => {
      const list = m.get(r.user_id) ?? [];
      list.push(r);
      m.set(r.user_id, list);
    });
    return Array.from(m.entries());
  }, [rows]);

  return (
    <TeacherLayout>
      <div className="p-6 max-w-6xl mx-auto space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Archive className="size-6 text-primary" />
            학습결과함
            <span className="text-sm font-normal text-muted-foreground">
              · 인쇄 완료 {rows.length}건 · 학생 {grouped.length}명
            </span>
          </h1>
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-9 w-44"
            />
            <Button size="sm" variant="outline" onClick={refresh}>
              <RefreshCcw className="size-4 mr-1" />
              새로고침
            </Button>
          </div>
        </div>

        {loading ? (
          <Card className="p-10 flex items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </Card>
        ) : grouped.length === 0 ? (
          <Card className="p-10 text-center text-sm text-muted-foreground">
            해당 날짜에 처리완료된 시험지가 없습니다.
          </Card>
        ) : (
          <div className="space-y-3">
            {grouped.map(([userId, list]) => {
              const s = students[userId];
              const handout = handoutMap[userId];
              return (
                <Card key={userId} className="p-4 space-y-3">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="font-bold text-foreground">
                      {s?.display_name ?? "학생"}
                    </span>
                    <span className="text-xs font-mono text-muted-foreground">
                      ({s?.student_no ?? "—"})
                    </span>
                    <span className="text-xs text-muted-foreground ml-2">
                      인쇄 {list.length}건
                    </span>
                    {handout && (
                      <span className="ml-auto flex items-center gap-2 text-xs">
                        {handout.word_ho_score != null && (
                          <Badge variant="outline" className="font-mono">
                            단어HO {handout.word_ho_score}
                          </Badge>
                        )}
                        {handout.syntax_ho_result && (
                          <Badge
                            variant={handout.syntax_ho_result === "PASS" ? "default" : "destructive"}
                          >
                            구문 {handout.syntax_ho_result}
                          </Badge>
                        )}
                      </span>
                    )}
                  </div>

                  <div className="overflow-hidden rounded-md border border-border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40 text-xs text-muted-foreground">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium">문장 코드</th>
                          <th className="text-left px-3 py-2 font-medium">인쇄 시각</th>
                          <th className="text-left px-3 py-2 font-medium">단어 시험</th>
                          <th className="text-left px-3 py-2 font-medium">구문 분석</th>
                          <th className="text-left px-3 py-2 font-medium">상태</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {list.map((r) => {
                          const a = attemptMap[`${r.user_id}::${r.sentence_id}`];
                          const wScore = a?.best_word_score != null ? Math.round(a.best_word_score) : null;
                          const aScore =
                            a?.best_analysis_rate != null
                              ? Math.round(a.best_analysis_rate * 100)
                              : null;
                          const allPassed = a?.word_passed && a?.analysis_passed;
                          return (
                            <tr key={r.id} className="hover:bg-muted/20">
                              <td className="px-3 py-2 font-mono text-xs">{r.sentence_id}</td>
                              <td className="px-3 py-2 text-xs text-muted-foreground inline-flex items-center gap-1">
                                <Printer className="size-3 text-primary" />
                                {fmtTime(r.handled_at)}
                              </td>
                              <td className="px-3 py-2">
                                {wScore == null ? (
                                  <span className="text-xs text-muted-foreground">—</span>
                                ) : (
                                  <span
                                    className={
                                      a?.word_passed
                                        ? "text-emerald-600 font-semibold"
                                        : "text-amber-600 font-semibold"
                                    }
                                  >
                                    {wScore}
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2">
                                {aScore == null ? (
                                  <span className="text-xs text-muted-foreground">—</span>
                                ) : (
                                  <span
                                    className={
                                      a?.analysis_passed
                                        ? "text-emerald-600 font-semibold"
                                        : "text-amber-600 font-semibold"
                                    }
                                  >
                                    {aScore}
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2">
                                {!a ? (
                                  <Badge variant="outline" className="text-[10px]">
                                    미응시
                                  </Badge>
                                ) : allPassed ? (
                                  <Badge className="bg-emerald-600 hover:bg-emerald-700 text-[10px]">
                                    완료
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary" className="text-[10px]">
                                    부분
                                  </Badge>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
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

export default LearningResults;

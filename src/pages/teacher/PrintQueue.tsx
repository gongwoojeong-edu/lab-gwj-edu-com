// ============================================================
// PrintQueue — 선생님: 학생 시험지 인쇄 요청 대기열
// 학습결과 페이지와 동일한 한 줄 컬럼(코드/구문분석/단어시험)을 보여주고
// [구문], [단어(오답/전체)], [전체] 액션을 제공.
// 처리되면 print_requests 가 'printed' 로 전환되어 행이 사라짐.
// ============================================================
import { useEffect, useState } from "react";
import { TeacherLayout } from "@/components/teacher/TeacherLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Printer, Loader2, FileText, BookOpen, ChevronDown } from "lucide-react";
import {
  fetchPendingPrintRequests,
  subscribeToPrintRequests,
  markPrintRequestHandled,
  type PrintRequest,
} from "@/lib/printRequests";
import { ensureHandoutRow, toIsoDate } from "@/lib/handoutResults";
import { launchPrint, launchPrintMany } from "@/lib/printLauncher";
import { supabase } from "@/integrations/supabase/client";
import { errMsg } from "@/lib/errMsg";
import { toast } from "@/hooks/use-toast";

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

const PrintQueue = () => {
  const [rows, setRows] = useState<PrintRequest[]>([]);
  const [students, setStudents] = useState<Record<string, StudentInfo>>({});
  const [attemptMap, setAttemptMap] = useState<Record<string, AttemptStat>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const refresh = async () => {
    setLoading(true);
    try {
      const list = await fetchPendingPrintRequests();
      setRows(list);
      const userIds = Array.from(new Set(list.map((r) => r.user_id)));
      const sentenceIds = Array.from(new Set(list.map((r) => r.sentence_id)));

      if (userIds.length > 0) {
        const { data } = await supabase
          .from("student_profiles")
          .select("user_id, display_name, student_no")
          .in("user_id", userIds);
        const map: Record<string, StudentInfo> = {};
        (data ?? []).forEach((s) => {
          map[s.user_id] = s as StudentInfo;
        });
        setStudents(map);
      }

      // 점수 통계 join — 모든 attempt + word_test_results
      if (userIds.length > 0 && sentenceIds.length > 0) {
        const [attRes, wtRes] = await Promise.all([
          supabase
            .from("sentence_attempt_logs")
            .select(
              "user_id, sentence_id, word_test_score, word_test_passed, analysis_match_rate, analysis_passed",
            )
            .in("user_id", userIds)
            .in("sentence_id", sentenceIds),
          supabase
            .from("word_test_results")
            .select("user_id, sentence_id, score, passed")
            .in("user_id", userIds)
            .in("sentence_id", sentenceIds),
        ]);
        const aMap: Record<string, AttemptStat> = {};
        ((attRes.data ?? []) as Array<{
          user_id: string;
          sentence_id: string;
          word_test_score: number | null;
          word_test_passed: boolean;
          analysis_match_rate: number | null;
          analysis_passed: boolean;
        }>).forEach((l) => {
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
            best_word_score:
              cur.best_word_score == null ? ws : Math.max(cur.best_word_score, ws),
            best_analysis_rate:
              cur.best_analysis_rate == null ? ar : Math.max(cur.best_analysis_rate, ar),
            word_passed: cur.word_passed || !!l.word_test_passed,
            analysis_passed: cur.analysis_passed || !!l.analysis_passed,
          };
        });
        ((wtRes.data ?? []) as Array<{
          user_id: string;
          sentence_id: string;
          score: number;
          passed: boolean;
        }>).forEach((w) => {
          const key = `${w.user_id}::${w.sentence_id}`;
          const cur = aMap[key];
          const sc = Number(w.score ?? 0);
          if (!cur) {
            aMap[key] = {
              best_word_score: sc,
              best_analysis_rate: null,
              word_passed: !!w.passed,
              analysis_passed: false,
            };
          } else {
            aMap[key] = {
              ...cur,
              best_word_score:
                cur.best_word_score == null ? sc : Math.max(cur.best_word_score, sc),
              word_passed: cur.word_passed || !!w.passed,
            };
          }
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
    const unsub = subscribeToPrintRequests(() => refresh());
    return unsub;
  }, []);

  // 인쇄 액션: 화면전환 없이 숨김 iframe 으로 즉시 인쇄창 표시
  const triggerPrint = async (
    req: PrintRequest,
    kind: "syntax" | "word" | "all",
    wordScope: "wrong" | "all" = "wrong",
    wordMode: "ko" | "en" | "mix" = "ko",
  ) => {
    const busyKey = `${kind}:${req.id}`;
    setBusy((p) => ({ ...p, [busyKey]: true }));
    const sid = encodeURIComponent(req.sentence_id);
    const urls: string[] = [];
    if (kind === "syntax" || kind === "all") {
      urls.push(`/print/handout/${sid}?student=${req.user_id}&autoprint=1&embed=1`);
    }
    if (kind === "word" || kind === "all") {
      urls.push(
        `/print/word/${sid}?student=${req.user_id}&scope=${wordScope}&mode=${wordMode}&autoprint=1&embed=1`,
      );
    }
    launchPrintMany(urls, { jobKey: busyKey }).catch((e) =>
      console.warn("[PrintQueue] launchPrintMany failed", e),
    );
    try {
      await markPrintRequestHandled(req.id);
      await ensureHandoutRow(req.user_id, null, toIsoDate(new Date()));
      toast({ title: "인쇄창 준비 완료 — 학습결과로 이동됨" });
    } catch (e) {
      toast({
        title: "처리 마킹 실패",
        description: errMsg(e),
        variant: "destructive",
      });
    } finally {
      setBusy((p) => ({ ...p, [busyKey]: false }));
    }
  };

  const handleOpenPdf = (req: PrintRequest) => {
    // 미리보기: autoprint 없이 새 탭에서 그냥 열기
    window.open(
      `/teacher/handout/${encodeURIComponent(req.sentence_id)}?student=${req.user_id}`,
      "_blank",
    );
  };

  return (
    <TeacherLayout>
      <div className="p-6 max-w-6xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Printer className="size-6 text-primary" /> 인쇄 대기열
            <span className="text-sm font-normal text-muted-foreground">
              · 대기 {rows.length}건
            </span>
          </h1>
        </div>

        <Card className="px-4 py-2 text-xs text-muted-foreground bg-muted/30">
          [구문]/[단어]/[전체] 클릭 시 <b>현재 화면에서 OS 인쇄 대화상자가 즉시</b> 뜹니다.
          처리되면 학습결과 화면에 자동 합류합니다. PDF 작업이 필요하면 [📄] 버튼으로 미리보기를 새 탭에서 여세요.
        </Card>

        {loading ? (
          <Card className="p-10 flex items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </Card>
        ) : rows.length === 0 ? (
          <Card className="p-10 text-center text-sm text-muted-foreground">
            대기 중인 시험지 요청이 없습니다.
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-[11px] text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">학생</th>
                    <th className="text-left px-3 py-2 font-medium">문장 코드</th>
                    <th className="text-left px-3 py-2 font-medium">구문분석</th>
                    <th className="text-left px-3 py-2 font-medium">단어시험</th>
                    <th className="text-left px-3 py-2 font-medium">요청시각</th>
                    <th className="text-right px-3 py-2 font-medium">인쇄 액션</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((req) => {
                    const s = students[req.user_id];
                    const a = attemptMap[`${req.user_id}::${req.sentence_id}`];
                    const wScore =
                      a?.best_word_score != null ? Math.round(a.best_word_score) : null;
                    const aScore =
                      a?.best_analysis_rate != null
                        ? Math.round(a.best_analysis_rate * 100)
                        : null;
                    return (
                      <tr key={req.id} className="hover:bg-muted/20 align-middle">
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span className="font-bold text-foreground">
                            {s?.display_name ?? "학생"}
                          </span>
                          <span className="text-xs font-mono text-muted-foreground ml-1">
                            ({s?.student_no ?? "—"})
                          </span>
                        </td>
                        <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">
                          {req.sentence_id}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {aScore == null ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs">
                              <Badge
                                className={
                                  a?.analysis_passed
                                    ? "h-5 px-1.5 text-[10px] bg-primary text-primary-foreground"
                                    : "h-5 px-1.5 text-[10px] bg-destructive text-destructive-foreground"
                                }
                              >
                                {a?.analysis_passed ? "P" : "F"}
                              </Badge>
                              <span className="text-muted-foreground tabular-nums">
                                {aScore}%
                              </span>
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {wScore == null ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            <span
                              className={
                                a?.word_passed
                                  ? "text-primary font-semibold tabular-nums"
                                  : "text-destructive font-semibold tabular-nums"
                              }
                            >
                              {wScore}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(req.requested_at).toLocaleString("ko-KR", {
                            month: "2-digit",
                            day: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2"
                              onClick={() => handleOpenPdf(req)}
                              title="PDF 미리보기"
                            >
                              <FileText className="size-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-xs"
                              disabled={!!busy[`syntax:${req.id}`]}
                              onClick={() => triggerPrint(req, "syntax")}
                            >
                              구문
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2 text-xs"
                                  disabled={!!busy[`word:${req.id}`]}
                                >
                                  <BookOpen className="size-3 mr-1" />
                                  단어
                                  <ChevronDown className="size-3 ml-0.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => triggerPrint(req, "word", "wrong", "ko")}>
                                  오답 · 한글 채우기
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => triggerPrint(req, "word", "wrong", "en")}>
                                  오답 · 스펠 채우기
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => triggerPrint(req, "word", "wrong", "mix")}>
                                  오답 · 혼합
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => triggerPrint(req, "word", "all", "ko")}>
                                  전체 · 한글 채우기
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => triggerPrint(req, "word", "all", "en")}>
                                  전체 · 스펠 채우기
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => triggerPrint(req, "word", "all", "mix")}>
                                  전체 · 혼합
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                            <Button
                              size="sm"
                              className="h-7 px-2 text-xs"
                              disabled={!!busy[`all:${req.id}`]}
                              onClick={() => triggerPrint(req, "all", "wrong")}
                            >
                              <Printer className="size-3 mr-1" />
                              전체
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </TeacherLayout>
  );
};

export default PrintQueue;

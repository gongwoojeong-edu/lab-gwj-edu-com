// ============================================================
// RequestsInbox — 통합 [요청확인] 페이지
// 시험지 인쇄 요청 + 선생님분석본보기(자기첨삭) 요청을 한 화면에 표기.
// 각 행 맨 앞에 종류 배지 [시험지] / [정답보기] 표기.
// ============================================================
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { TeacherLayout } from "@/components/teacher/TeacherLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Inbox,
  Loader2,
  Printer,
  Eye,
  CheckCircle2,
  XCircle,
  BookOpen,
  ChevronDown,
  FileText,
} from "lucide-react";
import { getAnalysisPdfSignedUrl } from "@/lib/textbooks";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchPendingPrintRequests,
  fetchHandledPrintRequests,
  subscribeToPrintRequests,
  markPrintRequestHandled,
  type PrintRequest,
} from "@/lib/printRequests";
import {
  fetchInboxReviewRequests,
  subscribeToReviewRequests,
  approveReviewRequest,
  rejectReviewRequest,
  type AnalysisReviewRequest,
} from "@/lib/analysisReview";
import { ensureHandoutRow, toIsoDate } from "@/lib/handoutResults";
import { launchPrintHtmlMany } from "@/lib/printLauncher";
import {
  buildHandoutPrintHtmlFor,
  buildWordPrintHtmlFor,
  printStageMessage,
  PrintPreloadError,
} from "@/lib/printPreload";
import { fetchMasterAvailability } from "@/lib/masterAvailability";
import { errMsg } from "@/lib/errMsg";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface StudentInfo {
  user_id: string;
  display_name: string | null;
  student_no: string;
}

type InboxItem =
  | { kind: "print"; created_at: string; row: PrintRequest }
  | { kind: "review"; created_at: string; row: AnalysisReviewRequest };

const RequestsInbox = () => {
  const navigate = useNavigate();
  const [printRows, setPrintRows] = useState<PrintRequest[]>([]);
  const [handledPrintRows, setHandledPrintRows] = useState<PrintRequest[]>([]);
  const [reviewRows, setReviewRows] = useState<AnalysisReviewRequest[]>([]);
  const [students, setStudents] = useState<Record<string, StudentInfo>>({});
  const [masterMap, setMasterMap] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [tab, setTab] = useState<"pending" | "done">("pending");

  const refresh = async () => {
    setLoading(true);
    try {
      const [pl, hp, rl] = await Promise.all([
        fetchPendingPrintRequests(),
        fetchHandledPrintRequests(100),
        fetchInboxReviewRequests(),
      ]);
      setPrintRows(pl);
      setHandledPrintRows(hp);
      setReviewRows(rl);
      const userIds = Array.from(
        new Set([
          ...pl.map((r) => r.user_id),
          ...hp.map((r) => r.user_id),
          ...rl.map((r) => r.user_id),
        ]),
      );
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
      // 정답보기(review) 요청들의 sentence별 마스터 유무 확인
      const reviewSentenceIds = Array.from(new Set(rl.map((r) => r.sentence_id)));
      if (reviewSentenceIds.length > 0) {
        const m = await fetchMasterAvailability(reviewSentenceIds);
        setMasterMap(m);
      } else {
        setMasterMap({});
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    const u1 = subscribeToPrintRequests(() => refresh());
    const u2 = subscribeToReviewRequests(() => refresh());
    return () => {
      u1?.();
      u2?.();
    };
  }, []);

  const items = useMemo<InboxItem[]>(() => {
    const out: InboxItem[] = [
      ...printRows.map((r): InboxItem => ({
        kind: "print",
        created_at: r.requested_at ?? r.created_at,
        row: r,
      })),
      ...reviewRows.map((r): InboxItem => ({
        kind: "review",
        created_at: r.requested_at ?? r.created_at,
        row: r,
      })),
    ];
    out.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    return out;
  }, [printRows, reviewRows]);

  const pendingCount = useMemo(
    () => printRows.length + reviewRows.filter((row) => row.status === "pending").length,
    [printRows, reviewRows],
  );

  const triggerPrint = async (
    req: PrintRequest,
    kind: "syntax" | "word" | "all",
    wordScope: "wrong" | "all" = "wrong",
    wordMode: "ko" | "en" | "mix" = "ko",
  ) => {
    const busyKey = `${kind}:${req.id}`;
    setBusy((p) => ({ ...p, [busyKey]: true }));
    const htmls: string[] = [];
    try {
      if (kind === "syntax" || kind === "all") {
        htmls.push(
          await buildHandoutPrintHtmlFor({
            sentenceId: req.sentence_id,
            studentId: req.user_id,
          }),
        );
      }
      if (kind === "word" || kind === "all") {
        htmls.push(
          await buildWordPrintHtmlFor({
            sentenceId: req.sentence_id,
            studentId: req.user_id,
            scope: wordScope,
            mode: wordMode,
          }),
        );
      }
    } catch (e) {
      const msg = e instanceof PrintPreloadError ? printStageMessage(e.stage) : errMsg(e);
      toast({ title: "인쇄 준비 실패", description: msg, variant: "destructive" });
      setBusy((p) => ({ ...p, [busyKey]: false }));
      return;
    }
    launchPrintHtmlMany(htmls, { jobKey: busyKey }).catch((e) =>
      console.warn("[RequestsInbox] launchPrintHtmlMany failed", e),
    );
    try {
      await markPrintRequestHandled(req.id);
      await ensureHandoutRow(req.user_id, null, toIsoDate(new Date()), req.sentence_id);
      toast({ title: "인쇄창 준비 완료" });
    } catch (e) {
      console.warn("[RequestsInbox] markHandled/ensureRow failed", e);
    } finally {
      setBusy((p) => ({ ...p, [busyKey]: false }));
    }
  };

  const handleApprove = async (id: string) => {
    try {
      await approveReviewRequest(id);
      toast({ title: "승인 완료" });
    } catch (e) {
      toast({ title: "승인 실패", description: errMsg(e), variant: "destructive" });
    }
  };

  const handleReject = async (id: string) => {
    const note = window.prompt("반려 사유 (선택):") ?? undefined;
    try {
      await rejectReviewRequest(id, note);
      toast({ title: "반려 처리됨" });
    } catch (e) {
      toast({ title: "반려 실패", description: errMsg(e), variant: "destructive" });
    }
  };

  return (
    <TeacherLayout>
      <div className="p-6 max-w-6xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Inbox className="size-6 text-primary" /> 요청확인
              <span className="text-sm font-normal text-muted-foreground">
                · 전체 {items.length}건 / 대기 {pendingCount}건
              </span>
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              학생들이 보낸 시험지 인쇄 요청과 정답 보기 요청을 한 곳에서 처리합니다.
            </p>
          </div>
        </div>

        {loading ? (
          <Card className="p-10 flex items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </Card>
        ) : items.length === 0 ? (
          <Card className="p-10 text-center text-sm text-muted-foreground">
            현재 대기 중인 요청이 없습니다.
          </Card>
        ) : (
          <div className="space-y-2">
            {items.map((it) => {
              const s = students[it.row.user_id];
              const studentName =
                s?.display_name ?? s?.student_no ?? it.row.user_id.slice(0, 8);
              const studentNo = s?.student_no ?? "—";
              const time = new Date(it.created_at).toLocaleString("ko-KR", {
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              });

              if (it.kind === "print") {
                const req = it.row;
                if (req.kind === "analysis") {
                  return (
                    <Card
                      key={`p-${req.id}`}
                      className="p-3 flex items-center gap-3 flex-wrap border-l-4 border-l-primary"
                    >
                      <Badge className="bg-primary text-primary-foreground font-bold">
                        분석자료
                      </Badge>
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-foreground">
                          {studentName}{" "}
                          <span className="text-xs font-mono text-muted-foreground">
                            ({studentNo})
                          </span>
                          <span className="ml-2 text-xs font-mono text-muted-foreground">
                            {req.sentence_id}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground">{time}</div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          onClick={async () => {
                            if (!req.file_url) return;
                            const url = await getAnalysisPdfSignedUrl(req.file_url);
                            if (url) window.open(url, "_blank", "noopener,noreferrer");
                            else toast({ title: "PDF 열람 실패", variant: "destructive" });
                          }}
                        >
                          <FileText className="size-3 mr-1" /> PDF 열기
                        </Button>
                        <Button
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={async () => {
                            try {
                              await markPrintRequestHandled(req.id);
                              toast({ title: "처리 완료" });
                              await refresh();
                            } catch (e) {
                              toast({ title: "처리 실패", description: errMsg(e), variant: "destructive" });
                            }
                          }}
                        >
                          <CheckCircle2 className="size-3 mr-1" /> 인쇄 완료
                        </Button>
                      </div>
                    </Card>
                  );
                }
                return (
                  <Card
                    key={`p-${req.id}`}
                    className="p-3 flex items-center gap-3 flex-wrap border-l-4 border-l-amber-500"
                  >
                    <Badge className="bg-amber-500 text-white font-bold">시험지</Badge>
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-foreground">
                        {studentName}{" "}
                        <span className="text-xs font-mono text-muted-foreground">
                          ({studentNo})
                        </span>
                        <span className="ml-2 text-xs font-mono text-muted-foreground">
                          {req.sentence_id}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">{time}</div>
                    </div>
                    <div className="flex items-center gap-1.5">
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
                        onClick={() => triggerPrint(req, "all", "wrong", "ko")}
                      >
                        <Printer className="size-3 mr-1" />
                        전체
                      </Button>
                    </div>
                  </Card>
                );
              }

              const req = it.row;
              const masterReady = masterMap[req.sentence_id] ?? true;
              return (
                <Card
                  key={`r-${req.id}`}
                  className={cn(
                    "p-3 flex items-center gap-3 flex-wrap border-l-4",
                    !masterReady
                      ? "border-l-muted-foreground/40"
                      : req.track === "fail_assist"
                        ? "border-l-amber-500"
                        : "border-l-emerald-600",
                  )}
                >
                  <Badge
                    className={cn(
                      "font-bold text-white",
                      req.status === "rejected"
                        ? "bg-destructive"
                        : req.status === "approved"
                          ? "bg-primary"
                          : req.track === "fail_assist"
                            ? "bg-amber-500"
                            : "bg-emerald-600",
                    )}
                  >
                    정답보기
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-foreground">
                      {studentName}{" "}
                      <span className="text-xs font-mono text-muted-foreground">
                        ({studentNo})
                      </span>
                      <span className="ml-2 text-xs font-mono text-muted-foreground">
                        {req.sentence_id}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {masterReady ? "정답률" : "분석률"} {Math.round(Number(req.analysis_rate) * 100)}% · 시도 {req.attempt_no}회 · {time}
                      {req.track === "fail_assist" && (
                        <span className="ml-2 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold text-[10px]">
                          미통 보조
                        </span>
                      )}
                      {req.status !== "pending" && (
                        <span className="ml-2 px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-bold text-[10px]">
                          {req.status === "approved" ? "승인됨" : "반려됨"}
                        </span>
                      )}
                      {!masterReady && (
                        <span className="ml-2 px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-bold text-[10px]">
                          마스터 미등록
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs"
                      onClick={() => navigate(`/teacher/review/${req.id}`)}
                    >
                      <Eye className="size-3 mr-1" /> 보기
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs"
                      onClick={() =>
                        window.open(
                          `/teacher/compare/${req.sentence_id}/${req.user_id}`,
                          "_blank",
                        )
                      }
                    >
                      🖼 비교
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                      onClick={() => handleReject(req.id)}
                      disabled={req.status !== "pending"}
                    >
                      <XCircle className="size-3 mr-1" /> 반려
                    </Button>
                    <Button
                      size="sm"
                      className="h-7 px-2 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                      onClick={() => handleApprove(req.id)}
                      disabled={!masterReady || req.status !== "pending"}
                      title={!masterReady ? "마스터 등록 후 승인 가능" : req.status !== "pending" ? "이미 처리된 요청입니다" : undefined}
                    >
                      <CheckCircle2 className="size-3 mr-1" /> 승인
                    </Button>
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

export default RequestsInbox;

// ============================================================
// RequestsInbox — 통합 [요청확인] 페이지
// 유닛 인쇄 요청 + 자료열람 요청 + (레거시) 지문별 시험지 + 정답보기
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
  Trash2,
} from "lucide-react";
import { getAnalysisPdfSignedUrl } from "@/lib/textbooks";
import { openSignedStorageFile } from "@/lib/openSignedStorageFile";

import { supabase } from "@/integrations/supabase/client";
import {
  fetchPendingPrintRequests,
  fetchHandledPrintRequests,
  subscribeToPrintRequests,
  markPrintRequestHandled,
  unmarkPrintRequestHandled,
  deletePrintRequest,
  type PrintRequest,
} from "@/lib/printRequests";
import {
  fetchInboxReviewRequests,
  subscribeToReviewRequests,
  approveReviewRequest,
  rejectReviewRequest,
  deleteReviewRequest,
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
import {
  fetchPendingUnitPrintWorkflows,
  fetchRecentlyPrintedUnitWorkflows,
  markUnitPrinted,
  unmarkUnitPrinted,
  subscribeToUnitWorkflows,
  type UnitWorkflowRow,
} from "@/lib/unitWorkflow";
import {
  fetchPendingMaterialViewRequests,
  fetchHandledMaterialViewRequests,
  approveMaterialViewRequest,
  rejectMaterialViewRequest,
  subscribeToMaterialViewRequests,
  type MaterialViewRequest,
} from "@/lib/materialViewRequests";
import { buildUnitWorkbookHtmlFor } from "@/lib/unitWorkbook";
import { launchPrintHtml } from "@/lib/printLauncher";

interface StudentInfo {
  user_id: string;
  display_name: string | null;
  student_no: string;
}

type InboxItem =
  | { kind: "print"; created_at: string; row: PrintRequest }
  | { kind: "review"; created_at: string; row: AnalysisReviewRequest }
  | { kind: "unit_print"; created_at: string; row: UnitWorkflowRow }
  | { kind: "material_view"; created_at: string; row: MaterialViewRequest };

const RequestsInbox = () => {
  const navigate = useNavigate();
  const [printRows, setPrintRows] = useState<PrintRequest[]>([]);
  const [handledPrintRows, setHandledPrintRows] = useState<PrintRequest[]>([]);
  const [reviewRows, setReviewRows] = useState<AnalysisReviewRequest[]>([]);
  const [unitPrintRows, setUnitPrintRows] = useState<UnitWorkflowRow[]>([]);
  const [handledUnitPrintRows, setHandledUnitPrintRows] = useState<UnitWorkflowRow[]>([]);
  const [materialViewRows, setMaterialViewRows] = useState<MaterialViewRequest[]>([]);
  const [handledMaterialViewRows, setHandledMaterialViewRows] = useState<MaterialViewRequest[]>([]);
  const [unitLabels, setUnitLabels] = useState<Record<string, string>>({});
  const [students, setStudents] = useState<Record<string, StudentInfo>>({});
  const [masterMap, setMasterMap] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [tab, setTab] = useState<"pending" | "done">("pending");

  const refresh = async () => {
    setLoading(true);
    try {
      const [pl, hp, rl, up, hup, mv, hmv] = await Promise.all([
        fetchPendingPrintRequests(),
        fetchHandledPrintRequests(100),
        fetchInboxReviewRequests(),
        fetchPendingUnitPrintWorkflows(),
        fetchRecentlyPrintedUnitWorkflows(100),
        fetchPendingMaterialViewRequests(),
        fetchHandledMaterialViewRequests(100),
      ]);
      setPrintRows(pl);
      setHandledPrintRows(hp);
      setReviewRows(rl);
      setUnitPrintRows(up);
      setHandledUnitPrintRows(hup);
      setMaterialViewRows(mv);
      setHandledMaterialViewRows(hmv);
      const userIds = Array.from(
        new Set([
          ...pl.map((r) => r.user_id),
          ...hp.map((r) => r.user_id),
          ...rl.map((r) => r.user_id),
          ...up.map((r) => r.user_id),
          ...hup.map((r) => r.user_id),
          ...mv.map((r) => r.user_id),
          ...hmv.map((r) => r.user_id),
        ]),
      );
      if (userIds.length > 0) {
        const { data } = await supabase
          .from("student_profiles")
          .select("user_id, display_name, student_no")
          .in("user_id", userIds);
        const map: Record<string, StudentInfo> = {};
        (data ?? []).forEach((s) => {
          const row = s as { user_id: string; display_name: string | null; student_no: string };
          map[row.user_id] = {
            user_id: row.user_id,
            display_name: row.display_name,
            student_no: row.student_no,
          };
        });
        setStudents(map);
      }
      const unitIds = Array.from(
        new Set([
          ...up.map((r) => r.unit_id),
          ...hup.map((r) => r.unit_id),
          ...mv.map((r) => r.unit_id),
          ...hmv.map((r) => r.unit_id),
        ]),
      );
      if (unitIds.length > 0) {
        const { data: units } = await supabase
          .from("textbook_units")
          .select("id, unit_no, title")
          .in("id", unitIds);
        const labels: Record<string, string> = {};
        ((units ?? []) as { id: string; unit_no: number; title: string }[]).forEach((u) => {
          labels[u.id] = `U${u.unit_no} ${u.title}`;
        });
        setUnitLabels(labels);
      } else {
        setUnitLabels({});
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
    const u3 = subscribeToUnitWorkflows(() => refresh());
    const u4 = subscribeToMaterialViewRequests(() => refresh());
    return () => {
      u1?.();
      u2?.();
      u3?.();
      u4?.();
    };
  }, []);

  const pendingItems = useMemo<InboxItem[]>(() => {
    const out: InboxItem[] = [
      ...printRows.map((r): InboxItem => ({
        kind: "print",
        created_at: r.requested_at ?? r.created_at,
        row: r,
      })),
      ...reviewRows
        .filter((r) => r.status === "pending")
        .map((r): InboxItem => ({
          kind: "review",
          created_at: r.requested_at ?? r.created_at,
          row: r,
        })),
      ...unitPrintRows.map((r): InboxItem => ({
        kind: "unit_print",
        created_at: r.print_requested_at ?? r.created_at,
        row: r,
      })),
      ...materialViewRows.map((r): InboxItem => ({
        kind: "material_view",
        created_at: r.requested_at,
        row: r,
      })),
    ];
    out.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    return out;
  }, [printRows, reviewRows, unitPrintRows, materialViewRows]);

  const doneItems = useMemo<InboxItem[]>(() => {
    const out: InboxItem[] = [
      ...handledPrintRows.map((r): InboxItem => ({
        kind: "print",
        created_at: r.handled_at ?? r.requested_at ?? r.created_at,
        row: r,
      })),
      ...reviewRows
        .filter((r) => r.status !== "pending")
        .map((r): InboxItem => ({
          kind: "review",
          created_at: r.responded_at ?? r.requested_at ?? r.created_at,
          row: r,
        })),
      ...handledUnitPrintRows.map((r): InboxItem => ({
        kind: "unit_print",
        created_at: r.printed_at ?? r.print_requested_at ?? r.created_at,
        row: r,
      })),
      ...handledMaterialViewRows.map((r): InboxItem => ({
        kind: "material_view",
        created_at: r.responded_at ?? r.requested_at,
        row: r,
      })),
    ];
    out.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    return out;
  }, [handledPrintRows, reviewRows, handledUnitPrintRows, handledMaterialViewRows]);

  const pendingCount = pendingItems.length;
  const doneCount = doneItems.length;

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
      setTab("done");
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
      setTab("done");
    } catch (e) {
      toast({ title: "승인 실패", description: errMsg(e), variant: "destructive" });
    }
  };

  const handleReject = async (id: string) => {
    const note = window.prompt("반려 사유 (선택):") ?? undefined;
    try {
      await rejectReviewRequest(id, note);
      toast({ title: "반려 처리됨" });
      setTab("done");
    } catch (e) {
      toast({ title: "반려 실패", description: errMsg(e), variant: "destructive" });
    }
  };

  const triggerUnitPrint = async (wf: UnitWorkflowRow) => {
    const busyKey = `unit:${wf.user_id}:${wf.unit_id}`;
    setBusy((p) => ({ ...p, [busyKey]: true }));
    try {
      const label = unitLabels[wf.unit_id] ?? "Unit";
      const { html } = await buildUnitWorkbookHtmlFor({
        unitId: wf.unit_id,
        unitTitle: label,
        unitCode: label,
        studentId: wf.user_id,
        mode: "syntax_unit",
        paperSize: "B5",
      });
      launchPrintHtml(html, { jobKey: busyKey });
      await markUnitPrinted(wf.user_id, wf.unit_id);
      toast({ title: "유닛 워크북 인쇄 · 기록 완료" });
      setTab("done");
      await refresh();
    } catch (e) {
      toast({ title: "인쇄 실패", description: errMsg(e), variant: "destructive" });
    } finally {
      setBusy((p) => ({ ...p, [busyKey]: false }));
    }
  };

  const handleMaterialApprove = async (id: string) => {
    try {
      await approveMaterialViewRequest(id);
      toast({ title: "자료열람 승인" });
      setTab("done");
      await refresh();
    } catch (e) {
      toast({ title: "승인 실패", description: errMsg(e), variant: "destructive" });
    }
  };

  const handleMaterialReject = async (id: string) => {
    try {
      await rejectMaterialViewRequest(id);
      toast({ title: "자료열람 반려" });
      await refresh();
    } catch (e) {
      toast({ title: "반려 실패", description: errMsg(e), variant: "destructive" });
    }
  };

  const handleDelete = async (item: InboxItem) => {
    const ok = window.confirm(
      "이 요청 기록을 영구 삭제할까요?\n(테스트/실수 데이터 정리용 — 되돌릴 수 없습니다)",
    );
    if (!ok) return;
    try {
      if (item.kind === "print") {
        await deletePrintRequest(item.row.id);
      } else if (item.kind === "review") {
        await deleteReviewRequest(item.row.id);
      } else {
        toast({ title: "이 요청은 화면에서 바로 삭제할 수 없습니다.", variant: "destructive" });
        return;
      }
      toast({ title: "삭제 완료" });
      await refresh();
    } catch (e) {
      toast({ title: "삭제 실패", description: errMsg(e), variant: "destructive" });
    }
  };

  const items = tab === "pending" ? pendingItems : doneItems;

  return (
    <TeacherLayout>
      <div className="p-6 max-w-6xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Inbox className="size-6 text-primary" /> 요청확인
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              유닛 인쇄·자료열람·정답보기 요청을 한 곳에서 처리합니다.
            </p>
          </div>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "pending" | "done")}>
          <TabsList>
            <TabsTrigger value="pending">대기 {pendingCount}</TabsTrigger>
            <TabsTrigger value="done">처리완료함 {doneCount}</TabsTrigger>
          </TabsList>
        </Tabs>

        {loading ? (
          <Card className="p-10 flex items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </Card>
        ) : items.length === 0 ? (
          <Card className="p-10 text-center text-sm text-muted-foreground">
            {tab === "pending" ? "현재 대기 중인 요청이 없습니다." : "처리완료된 요청이 없습니다."}
          </Card>
        ) : (
          <div className="space-y-2">
            {items.map((it) => {
              const userId =
                it.kind === "unit_print" || it.kind === "material_view"
                  ? it.row.user_id
                  : it.row.user_id;
              const s = students[userId];
              const studentName =
                s?.display_name ?? s?.student_no ?? userId.slice(0, 8);
              const studentNo = s?.student_no ?? "—";
              const time = new Date(it.created_at).toLocaleString("ko-KR", {
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              });
              const wbToggle: React.ReactNode = null;

              if (it.kind === "unit_print") {
                const wf = it.row;
                const busyKey = `unit:${wf.user_id}:${wf.unit_id}`;
                const isDone = tab === "done";
                return (
                  <Card
                    key={`up-${wf.user_id}-${wf.unit_id}-${wf.printed_at ?? "p"}`}
                    className="p-3 flex items-center gap-3 flex-wrap border-l-4 border-l-amber-500"
                  >
                    <Badge className="bg-amber-600 text-white font-bold">유닛 인쇄</Badge>
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-foreground">
                        {studentName}{" "}
                        <span className="text-xs font-mono text-muted-foreground">({studentNo})</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {unitLabels[wf.unit_id] ?? wf.unit_id.slice(0, 8)}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {time}
                        {isDone && (
                          <span className="ml-2 px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-bold text-[10px]">
                            인쇄완료
                          </span>
                        )}
                      </div>
                    </div>
                    {!isDone && (
                      <div className="flex items-center gap-1.5">
                        <Button
                          size="sm"
                          disabled={!!busy[busyKey]}
                          onClick={() => triggerUnitPrint(wf)}
                        >
                          {busy[busyKey] ? (
                            <Loader2 className="size-3 mr-1 animate-spin" />
                          ) : (
                            <Printer className="size-3 mr-1" />
                          )}
                          워크북 인쇄
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 px-2 text-xs"
                          disabled={!!busy[busyKey]}
                          title="인쇄창이 뜨지 않았거나 이미 인쇄한 경우 — 인쇄 없이 처리완료로 기록"
                          onClick={async () => {
                            const ok = window.confirm(
                              "인쇄 없이 '처리완료'로 기록할까요?\n(인쇄창이 열리지 않았거나 이미 다른 방법으로 출력한 경우 사용)",
                            );
                            if (!ok) return;
                            setBusy((p) => ({ ...p, [busyKey]: true }));
                            try {
                              await markUnitPrinted(wf.user_id, wf.unit_id);
                              toast({ title: "처리완료로 기록했습니다" });
                              setTab("done");
                              await refresh();
                            } catch (e) {
                              toast({ title: "처리 실패", description: errMsg(e), variant: "destructive" });
                            } finally {
                              setBusy((p) => ({ ...p, [busyKey]: false }));
                            }
                          }}
                        >
                          <CheckCircle2 className="size-3 mr-1" /> 처리완료
                        </Button>
                      </div>
                    )}
                    {isDone && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        disabled={!!busy[busyKey]}
                        title="처리완료를 취소하고 대기 상태로 되돌립니다"
                        onClick={async () => {
                          if (!window.confirm("처리완료를 취소하고 대기로 되돌릴까요?")) return;
                          setBusy((p) => ({ ...p, [busyKey]: true }));
                          try {
                            await unmarkUnitPrinted(wf.user_id, wf.unit_id);
                            toast({ title: "대기로 되돌렸습니다" });
                            setTab("pending");
                            await refresh();
                          } catch (e) {
                            toast({ title: "취소 실패", description: errMsg(e), variant: "destructive" });
                          } finally {
                            setBusy((p) => ({ ...p, [busyKey]: false }));
                          }
                        }}
                      >
                        <XCircle className="size-3 mr-1" /> 취소
                      </Button>
                    )}
                  </Card>
                );
              }

              if (it.kind === "material_view") {
                const mv = it.row;
                const isDone = tab === "done";
                return (
                  <Card
                    key={`mv-${mv.id}`}
                    className="p-3 flex items-center gap-3 flex-wrap border-l-4 border-l-sky-500"
                  >
                    <Badge className="bg-sky-600 text-white font-bold">자료열람</Badge>
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-foreground">
                        {studentName}{" "}
                        <span className="text-xs font-mono text-muted-foreground">({studentNo})</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {unitLabels[mv.unit_id] ?? mv.unit_id.slice(0, 8)}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {time}
                        {isDone && (
                          <span className="ml-2 px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-bold text-[10px]">
                            {mv.status === "approved" ? "승인됨" : "반려됨"}
                          </span>
                        )}
                      </div>
                    </div>
                    {!isDone && (
                      <>
                        <Button size="sm" onClick={() => handleMaterialApprove(mv.id)}>
                          <CheckCircle2 className="size-3 mr-1" /> 승인
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleMaterialReject(mv.id)}>
                          <XCircle className="size-3 mr-1" /> 반려
                        </Button>
                      </>
                    )}
                  </Card>
                );
              }

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
                      {wbToggle}
                      <div className="flex items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          onClick={async () => {
                            if (!req.file_url) return;
                            const url = await getAnalysisPdfSignedUrl(req.file_url);
                            if (url) {
                              await openSignedStorageFile(url, req.file_url);
                            } else {
                              toast({ title: "PDF 열람 실패", variant: "destructive" });
                            }
                          }}
                        >
                          <FileText className="size-3 mr-1" /> PDF 열기
                        </Button>
                        {tab === "pending" && (
                          <Button
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={async () => {
                              try {
                                await markPrintRequestHandled(req.id);
                                toast({ title: "처리 완료" });
                                setTab("done");
                                await refresh();
                              } catch (e) {
                                toast({ title: "처리 실패", description: errMsg(e), variant: "destructive" });
                              }
                            }}
                          >
                            <CheckCircle2 className="size-3 mr-1" /> 인쇄 완료
                          </Button>
                        )}
                        {tab === "done" && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-xs"
                              title="처리완료를 취소하고 대기 상태로 되돌립니다"
                              onClick={async () => {
                                if (!window.confirm("처리완료를 취소하고 대기로 되돌릴까요?")) return;
                                try {
                                  await unmarkPrintRequestHandled(req.id);
                                  toast({ title: "대기로 되돌렸습니다" });
                                  setTab("pending");
                                  await refresh();
                                } catch (e) {
                                  toast({ title: "취소 실패", description: errMsg(e), variant: "destructive" });
                                }
                              }}
                            >
                              <XCircle className="size-3 mr-1" /> 취소
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                              onClick={() => handleDelete(it)}
                              title="요청 기록 삭제"
                            >
                              <Trash2 className="size-3" />
                            </Button>
                          </>
                        )}
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
                    {wbToggle}
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
                      {tab === "pending" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          title="인쇄창이 뜨지 않았거나 이미 인쇄한 경우 — 인쇄 없이 처리완료로 기록"
                          onClick={async () => {
                            const ok = window.confirm(
                              "인쇄 없이 '처리완료'로 기록할까요?\n(인쇄창이 열리지 않았거나 이미 다른 방법으로 출력한 경우 사용)",
                            );
                            if (!ok) return;
                            try {
                              await markPrintRequestHandled(req.id);
                              toast({ title: "처리완료로 기록했습니다" });
                              setTab("done");
                              await refresh();
                            } catch (e) {
                              toast({ title: "처리 실패", description: errMsg(e), variant: "destructive" });
                            }
                          }}
                        >
                          <CheckCircle2 className="size-3 mr-1" /> 처리완료
                        </Button>
                      )}
                      {tab === "done" && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs"
                            title="처리완료를 취소하고 대기 상태로 되돌립니다"
                            onClick={async () => {
                              if (!window.confirm("처리완료를 취소하고 대기로 되돌릴까요?")) return;
                              try {
                                await unmarkPrintRequestHandled(req.id);
                                toast({ title: "대기로 되돌렸습니다" });
                                setTab("pending");
                                await refresh();
                              } catch (e) {
                                toast({ title: "취소 실패", description: errMsg(e), variant: "destructive" });
                              }
                            }}
                          >
                            <XCircle className="size-3 mr-1" /> 취소
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                            onClick={() => handleDelete(it)}
                            title="요청 기록 삭제"
                          >
                            <Trash2 className="size-3" />
                          </Button>
                        </>
                      )}
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
                  {wbToggle}
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
                    {tab === "done" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                        onClick={() => handleDelete(it)}
                        title="요청 기록 삭제"
                      >
                        <Trash2 className="size-3" />
                      </Button>
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

export default RequestsInbox;

// ============================================================
// BookshelfUnit — 유닛(예: 2603모고) 안의 지문 목록.
// ============================================================
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { TeacherLayout } from "@/components/teacher/TeacherLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ChevronLeft,
  Loader2,
  BookOpen,
  FileEdit,
  FileCheck,
  Pencil,
  Printer,
  Trash2,
  Sparkles,
  Upload,
  FileText,
  X,
  Eye,
  ArrowRight,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

import { UnitWorkbookPreviewDialog } from "@/components/teacher/UnitWorkbookPreviewDialog";
import { LEVEL_LABEL, type LevelCode } from "@/lib/levels";
import {
  fetchSeries,
  fetchTextbook,
  fetchUnit,
  fetchPassagesByUnit,
  reorderPassagesInUnit,
  deletePassage,
  uploadAnalysisPdf,
  deleteAnalysisPdf,
  getAnalysisPdfSignedUrl,
  uploadStructurePdf,
  deleteStructurePdf,
  getStructurePdfSignedUrl,
  fetchAllUnits,
  fetchAllSeries,
  movePassageToUnit,
  type Series,
  type Textbook,
  type Unit,
  type Passage,
} from "@/lib/textbooks";
import { useLevelLabels } from "@/hooks/useLevelLabels";
import { MoveItemsDialog, type MoveTarget } from "@/components/teacher/MoveItemsDialog";
import { ReorderButtons } from "@/components/teacher/ReorderButtons";
import { swapListOrder } from "@/lib/bookshelfOrder";
import { hydrateSentencesFromDb, setPassageReady } from "@/lib/sentenceSource";
import { supabase } from "@/integrations/supabase/client";
import { launchPrintHtml } from "@/lib/printLauncher";
import {
  buildHandoutPrintHtmlFor,
  printStageMessage,
  PrintPreloadError,
} from "@/lib/printPreload";
import {
  buildUnitWorkbookHtmlFor,
  summarizeUnitProgress,
} from "@/lib/unitWorkbook";
import { runExtraction } from "@/lib/wordExtraction";
import { errMsg } from "@/lib/errMsg";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ClipboardList } from "lucide-react";

const BookshelfUnit = () => {
  const { level, seriesNo, volumeNo, unitNo } = useParams<{
    level: LevelCode;
    seriesNo: string;
    volumeNo: string;
    unitNo: string;
  }>();
  const navigate = useNavigate();
  const [series, setSeries] = useState<Series | null>(null);
  const [textbook, setTextbook] = useState<Textbook | null>(null);
  const [unit, setUnit] = useState<Unit | null>(null);
  const [passages, setPassages] = useState<Passage[]>([]);
  const [extractedMap, setExtractedMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Passage | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [extractingCode, setExtractingCode] = useState<string | null>(null);
  const [printingCode, setPrintingCode] = useState<string | null>(null);
  const [statusTogglingCode, setStatusTogglingCode] = useState<string | null>(null);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [uploadingStructure, setUploadingStructure] = useState(false);
  const [viewingAnalysis, setViewingAnalysis] = useState(false);
  const [viewingStructure, setViewingStructure] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const structureInputRef = useRef<HTMLInputElement | null>(null);

  // 유닛 워크북 인쇄용
  const [studentList, setStudentList] = useState<
    Array<{ id: string; name: string; no: string }>
  >([]);
  const [workbookStudentId, setWorkbookStudentId] = useState<string>("");
  const [workbookSummary, setWorkbookSummary] = useState<{
    total: number;
    completed: number;
    completedCodes: string[];
    pendingCodes: string[];
  } | null>(null);
  const [workbookLoading, setWorkbookLoading] = useState(false);
  const [workbookPrinting, setWorkbookPrinting] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  // 다중선택 + 다른 유닛으로 이동
  const { display: levelDisplay } = useLevelLabels();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [moveOpen, setMoveOpen] = useState(false);
  const [allUnits, setAllUnits] = useState<
    Array<Unit & { textbook_id: string }>
  >([]);
  const [allTextbooks, setAllTextbooks] = useState<
    Array<{ id: string; title: string; volume_no: number; series_id: string }>
  >([]);
  const [allSeriesAll, setAllSeriesAll] = useState<Series[]>([]);
  const [reorderingId, setReorderingId] = useState<string | null>(null);

  const toggleSel = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const clearSel = () => setSelectedIds(new Set());

  // 학생 목록 로드 (워크북 인쇄 대상)
  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from("student_profiles")
        .select("user_id, display_name, student_no")
        .eq("orbit_enrollment_active", true)
        .order("student_no", { ascending: true });
      const list = (data ?? []).map((r) => ({
        id: r.user_id as string,
        name: (r.display_name as string | null) ?? (r.student_no as string),
        no: (r.student_no as string) ?? "",
      }));
      setStudentList(list);
    })().catch(() => undefined);
  }, []);

  // 학생 선택 시 진행상황 요약 fetch
  useEffect(() => {
    setWorkbookSummary(null);
    if (!workbookStudentId || !unit) return;
    let cancelled = false;
    setWorkbookLoading(true);
    void summarizeUnitProgress(unit.id, workbookStudentId)
      .then((s) => {
        if (cancelled) return;
        setWorkbookSummary({
          total: s.totalPassages,
          completed: s.completedCodes.length,
          completedCodes: s.completedCodes,
          pendingCodes: s.pendingCodes,
        });
      })
      .catch(() => {
        if (!cancelled) setWorkbookSummary(null);
      })
      .finally(() => {
        if (!cancelled) setWorkbookLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workbookStudentId, unit]);

  // 워크북 인쇄 버튼 → 미리보기 모달 오픈
  const handleOpenWorkbookPreview = () => {
    if (!unit || !workbookStudentId) return;
    if (!workbookSummary || workbookSummary.total === 0) {
      toast({ title: "이 유닛에 지문이 없어요", variant: "destructive" });
      return;
    }
    setPreviewOpen(true);
  };

  // 미리보기 안의 [인쇄 시작] → 실제 인쇄 실행 (모달에서 선택한 mode 사용)
  const handleConfirmPrintWorkbook = async (
    mode: import("@/lib/unitWorkbook").WorkbookMode,
    opts: { answerKey: boolean } = { answerKey: false },
  ) => {
    if (!unit || !workbookStudentId || workbookPrinting) return;
    if (!workbookSummary || workbookSummary.total === 0) {
      toast({ title: "이 유닛에 지문이 없어요", variant: "destructive" });
      return;
    }
    setWorkbookPrinting(true);
    try {
      const unitCode = `${level && LEVEL_LABEL[level]} · ${series?.title ?? ""} · ${textbook?.title ?? ""} · U${unit.unit_no}`;
      const { html, completedCount } = await buildUnitWorkbookHtmlFor({
        unitId: unit.id,
        unitTitle: unit.title,
        unitCode,
        studentId: workbookStudentId,
        mode,
        answerKey: opts.answerKey,
      });
      await launchPrintHtml(html, {
        jobKey: `unit-workbook:${unit.id}:${workbookStudentId}:${mode}${opts.answerKey ? ":ans" : ""}`,
        loadTimeoutMs: 12000,
        cleanupAfterMs: 2500,
      });
      const { WORKBOOK_MODE_LABEL } = await import("@/lib/unitWorkbook");
      toast({
        title: opts.answerKey ? "답지 인쇄 시작" : "워크북 인쇄 시작",
        description: `${WORKBOOK_MODE_LABEL[mode]}${opts.answerKey ? " · 답지" : ""} · ${completedCount}개 지문`,
      });
      setPreviewOpen(false);
    } catch (err) {
      toast({ title: "인쇄 실패", description: errMsg(err), variant: "destructive" });
    } finally {
      setWorkbookPrinting(false);
    }
  };

  useEffect(() => {
    void (async () => {
      const [units, seriesAll, { data: tbs }] = await Promise.all([
        fetchAllUnits(),
        fetchAllSeries(),
        supabase.from("textbooks").select("id, title, volume_no, series_id"),
      ]);
      setAllUnits(units);
      setAllSeriesAll(seriesAll);
      setAllTextbooks(
        ((tbs ?? []) as Array<{
          id: string;
          title: string;
          volume_no: number;
          series_id: string;
        }>),
      );
    })().catch(() => undefined);
  }, []);

  const moveTargets: MoveTarget[] = allUnits
    .filter((u) => u.id !== unit?.id)
    .map((u) => {
      const tb = allTextbooks.find((t) => t.id === u.textbook_id);
      const s = tb ? allSeriesAll.find((x) => x.id === tb.series_id) : undefined;
      const groupParts: string[] = [];
      if (s) groupParts.push(levelDisplay(s.level));
      if (s) groupParts.push(s.title);
      if (tb) groupParts.push(tb.title);
      return {
        id: u.id,
        label: `${u.title} (U${u.unit_no})`,
        group: groupParts.join(" · ") || `U${u.unit_no}`,
      };
    });

  const handleMove = async (passageId: string, targetUnitId: string) => {
    await movePassageToUnit(passageId, targetUnitId);
  };

  /**
   * HTML 파일은 Storage가 잘못된 Content-Type(text/plain 등)으로 응답할 때
   * 브라우저가 소스 코드를 그대로 보여주거나 한글이 깨지는 문제가 있어,
   * 직접 fetch 후 Blob URL(text/html;charset=utf-8)로 다시 열어 준다.
   * PDF/기타 파일은 서명 URL을 그대로 새 탭으로 연다.
   */
  const openSignedFile = async (signedUrl: string, storagePath: string) => {
    const isHtml = /\.html?$/i.test(storagePath);
    if (!isHtml) {
      window.open(signedUrl, "_blank", "noopener,noreferrer");
      return;
    }
    try {
      const res = await fetch(signedUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // 서버가 보낸 charset이 신뢰할 수 없으므로 ArrayBuffer로 받아 UTF-8로 디코드
      const buf = await res.arrayBuffer();
      const text = new TextDecoder("utf-8").decode(buf);
      const blob = new Blob([text], { type: "text/html;charset=utf-8" });
      const blobUrl = URL.createObjectURL(blob);
      const win = window.open(blobUrl, "_blank", "noopener,noreferrer");
      // 새 탭이 닫힐 때까지 URL 유지 — 일정 시간 후 정리
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
      if (!win) {
        // 팝업 차단 시 폴백
        window.location.href = blobUrl;
      }
    } catch {
      // 폴백: 그냥 서명 URL로 열기
      window.open(signedUrl, "_blank", "noopener,noreferrer");
    }
  };

  const handleViewAnalysis = async () => {
    if (!unit?.analysis_pdf_url || viewingAnalysis) return;
    setViewingAnalysis(true);
    try {
      const url = await getAnalysisPdfSignedUrl(unit.analysis_pdf_url);
      if (!url) {
        toast({ title: "파일을 열 수 없어요", variant: "destructive" });
        return;
      }
      await openSignedFile(url, unit.analysis_pdf_url);
    } catch (err) {
      toast({ title: "열기 실패", description: errMsg(err), variant: "destructive" });
    } finally {
      setViewingAnalysis(false);
    }
  };

  const handleViewStructure = async () => {
    if (!unit?.structure_pdf_url || viewingStructure) return;
    setViewingStructure(true);
    try {
      const url = await getStructurePdfSignedUrl(unit.structure_pdf_url);
      if (!url) {
        toast({ title: "파일을 열 수 없어요", variant: "destructive" });
        return;
      }
      await openSignedFile(url, unit.structure_pdf_url);
    } catch (err) {
      toast({ title: "열기 실패", description: errMsg(err), variant: "destructive" });
    } finally {
      setViewingStructure(false);
    }
  };

  const handlePdfPick = () => {
    fileInputRef.current?.click();
  };

  const handleStructurePick = () => {
    structureInputRef.current?.click();
  };

  const handlePdfChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !unit) return;
    if (file.type && file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      toast({ title: "PDF 파일만 업로드할 수 있어요", variant: "destructive" });
      return;
    }
    setUploadingPdf(true);
    try {
      const updated = await uploadAnalysisPdf(unit.id, file);
      setUnit(updated);
      toast({ title: "분석자료 업로드 완료", description: file.name });
    } catch (err) {
      toast({ title: "업로드 실패", description: errMsg(err), variant: "destructive" });
    } finally {
      setUploadingPdf(false);
    }
  };

  const handlePdfDelete = async () => {
    if (!unit) return;
    if (!window.confirm(`'${unit.analysis_pdf_name ?? "분석자료"}' 파일을 삭제할까요?`)) return;
    setUploadingPdf(true);
    try {
      await deleteAnalysisPdf(unit);
      setUnit({
        ...unit,
        analysis_pdf_url: null,
        analysis_pdf_name: null,
        analysis_pdf_uploaded_at: null,
      });
      toast({ title: "분석자료 삭제됨" });
    } catch (err) {
      toast({ title: "삭제 실패", description: errMsg(err), variant: "destructive" });
    } finally {
      setUploadingPdf(false);
    }
  };

  const handleStructureChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !unit) return;
    if (file.type && file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      toast({ title: "PDF 파일만 업로드할 수 있어요", variant: "destructive" });
      return;
    }
    setUploadingStructure(true);
    try {
      const updated = await uploadStructurePdf(unit.id, file);
      setUnit(updated);
      toast({ title: "구조도 업로드 완료", description: file.name });
    } catch (err) {
      toast({ title: "업로드 실패", description: errMsg(err), variant: "destructive" });
    } finally {
      setUploadingStructure(false);
    }
  };

  const handleStructureDelete = async () => {
    if (!unit) return;
    if (!window.confirm(`'${unit.structure_pdf_name ?? "구조도"}' 파일을 삭제할까요?`)) return;
    setUploadingStructure(true);
    try {
      await deleteStructurePdf(unit);
      setUnit({
        ...unit,
        structure_pdf_url: null,
        structure_pdf_name: null,
        structure_pdf_uploaded_at: null,
      });
      toast({ title: "구조도 삭제됨" });
    } catch (err) {
      toast({ title: "삭제 실패", description: errMsg(err), variant: "destructive" });
    } finally {
      setUploadingStructure(false);
    }
  };

  const handleExtract = async (p: Passage) => {
    if (extractingCode) return;
    setExtractingCode(p.code);
    try {
      const res = await runExtraction(p.code, p.english);
      if ("error" in res) {
        const status = res.status;
        if (status === 429) {
          toast({
            title: "잠시 후 다시 시도해 주세요",
            description: "AI 호출 한도 초과",
            variant: "destructive",
          });
        } else if (status === 402) {
          toast({ title: "AI 크레딧이 소진되었어요", variant: "destructive" });
        } else if (status === 403) {
          toast({ title: "권한이 없습니다", variant: "destructive" });
        } else {
          toast({ title: "추출 실패", description: res.error, variant: "destructive" });
        }
        return;
      }
      toast({ title: "✨ 단어 추출 완료", description: `${res.count}개 단어` });
      setExtractedMap((prev) => ({ ...prev, [p.code]: res.count }));
    } finally {
      setExtractingCode(null);
    }
  };

  const handleToggleStatus = async (p: Passage) => {
    if (statusTogglingCode) return;
    const nextReady = p.analysis_status !== "ready";
    if (!nextReady) {
      const ok = window.confirm(
        `[${p.code}] 지문을 '준비중(draft)'으로 되돌릴까요?\n학생 화면에서 더 이상 노출되지 않습니다.`,
      );
      if (!ok) return;
    }
    setStatusTogglingCode(p.code);
    try {
      await setPassageReady(p.code, nextReady);
      setPassages((prev) =>
        prev.map((x) =>
          x.id === p.id
            ? { ...x, analysis_status: nextReady ? "ready" : "draft" }
            : x,
        ),
      );
      toast({
        title: nextReady ? "분석상태: 완료(ready)" : "분석상태: 준비중(draft)",
        description: nextReady
          ? "학생 화면에서 이 지문이 노출됩니다."
          : "학생 화면에서 숨겨집니다.",
      });
    } catch (e) {
      toast({
        title: "상태 변경 실패",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setStatusTogglingCode(null);
    }
  };

  const handlePrint = async (p: Passage) => {
    if (printingCode) return;
    setPrintingCode(p.code);
    try {
      const html = await buildHandoutPrintHtmlFor({ sentenceId: p.code });
      await launchPrintHtml(html, { jobKey: `book-handout:${p.code}` });
    } catch (e) {
      const msg = e instanceof PrintPreloadError ? printStageMessage(e.stage) : errMsg(e);
      toast({ title: "인쇄 실패", description: msg, variant: "destructive" });
    } finally {
      setPrintingCode(null);
    }
  };

  const handleMovePassage = async (fromIdx: number, toIdx: number) => {
    if (!unit || reorderingId) return;
    const next = swapListOrder(passages, fromIdx, toIdx);
    const moving = passages[fromIdx];
    if (!moving) return;
    setReorderingId(moving.id);
    try {
      await reorderPassagesInUnit(next.map((p) => p.id));
      setPassages(next.map((p, i) => ({ ...p, passage_no: i + 1 })));
      toast({ title: "지문 순서가 변경되었습니다" });
    } catch (e) {
      toast({ title: "순서 변경 실패", description: errMsg(e), variant: "destructive" });
    } finally {
      setReorderingId(null);
    }
  };

  const reload = async () => {
    if (!level || !seriesNo || !volumeNo || !unitNo) return;
    setLoading(true);
    try {
      const sNo = parseInt(seriesNo, 10);
      const vNo = parseInt(volumeNo, 10);
      const uNo = parseInt(unitNo, 10);
      const s = await fetchSeries(level, sNo);
      setSeries(s);
      if (!s) return;
      const tb = await fetchTextbook(s.id, vNo);
      setTextbook(tb);
      if (!tb) return;
      const u = await fetchUnit(tb.id, uNo);
      setUnit(u);
      if (!u) return;
      const ps = await fetchPassagesByUnit(u.id);
      setPassages(ps);
      const ids = ps.map((p) => p.code);
      if (ids.length > 0) {
        const { data } = await supabase
          .from("sentence_word_extractions")
          .select("sentence_id, words")
          .in("sentence_id", ids);
        const map: Record<string, number> = {};
        (data ?? []).forEach((row) => {
          const arr = Array.isArray(row.words) ? row.words : [];
          map[row.sentence_id as string] = arr.length;
        });
        setExtractedMap(map);
      } else {
        setExtractedMap({});
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
    clearSel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level, seriesNo, volumeNo, unitNo]);

  const handleDeletePassage = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deletePassage(deleteTarget.id);
      await hydrateSentencesFromDb(true);
      toast({ title: `지문 ${deleteTarget.code} 삭제됨` });
      setDeleteTarget(null);
      void reload();
    } catch (e) {
      toast({
        title: "삭제 실패",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <TeacherLayout>
        <div className="flex justify-center py-20">
          <Loader2 className="animate-spin text-primary" />
        </div>
      </TeacherLayout>
    );
  }

  if (!series || !textbook || !unit) {
    return (
      <TeacherLayout>
        <div className="p-6 max-w-3xl mx-auto">
          <Card className="p-10 text-center text-sm text-muted-foreground">
            유닛을 찾을 수 없습니다.{" "}
            <Link to="/teacher/bookshelf" className="text-primary underline">
              책장으로
            </Link>
          </Card>
        </div>
      </TeacherLayout>
    );
  }

  return (
    <TeacherLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-5">
        <div>
          <Link
            to={`/teacher/bookshelf/${level}/${series.series_no}/${textbook.volume_no}`}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="size-3" /> {textbook.title}
          </Link>
          <h1 className="text-2xl font-bold flex items-center gap-2 mt-1">
            <BookOpen className="size-6 text-primary" /> {unit.title}
            <span className="text-xs font-mono text-muted-foreground">
              {level && LEVEL_LABEL[level]} · {series.title} · {textbook.title} · U
              {unit.unit_no}
            </span>
          </h1>
          {unit.description && (
            <p className="text-sm text-muted-foreground mt-1">{unit.description}</p>
          )}
        </div>

        {/* 유닛 단위 분석자료(PDF) */}
        <Card className="p-4 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-sm font-bold">
            <FileText className="size-4 text-primary" />
            분석자료 (PDF)
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={handlePdfChange}
          />
          {unit.analysis_pdf_url ? (
            <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
              <span
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-primary/10 text-primary text-xs font-bold max-w-full truncate"
                title={unit.analysis_pdf_name ?? ""}
              >
                <FileText className="size-3.5 shrink-0" />
                <span className="truncate">{unit.analysis_pdf_name ?? "PDF"}</span>
              </span>
              {unit.analysis_pdf_uploaded_at && (
                <span className="text-[10px] text-muted-foreground">
                  업로드: {new Date(unit.analysis_pdf_uploaded_at).toLocaleString("ko-KR", {
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              )}
              <div className="flex items-center gap-1.5 ml-auto">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={handleViewAnalysis}
                  disabled={viewingAnalysis}
                >
                  {viewingAnalysis ? (
                    <Loader2 className="size-3 mr-1 animate-spin" />
                  ) : (
                    <Eye className="size-3 mr-1" />
                  )}
                  보기
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={handlePdfPick}
                  disabled={uploadingPdf}
                >
                  {uploadingPdf ? (
                    <Loader2 className="size-3 mr-1 animate-spin" />
                  ) : (
                    <Upload className="size-3 mr-1" />
                  )}
                  교체
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={handlePdfDelete}
                  disabled={uploadingPdf}
                >
                  <X className="size-3 mr-1" /> 삭제
                </Button>
              </div>
            </div>
          ) : (
            <>
              <span className="text-xs text-muted-foreground flex-1">
                아직 업로드된 분석자료가 없어요. 클로드에서 만든 PDF를 올리면 학생이 Hand-out
                학습 완료 후 열람할 수 있어요.
              </span>
              <Button
                size="sm"
                className="h-7 text-xs"
                onClick={handlePdfPick}
                disabled={uploadingPdf}
              >
                {uploadingPdf ? (
                  <Loader2 className="size-3 mr-1 animate-spin" />
                ) : (
                  <Upload className="size-3 mr-1" />
                )}
                {uploadingPdf ? "업로드 중…" : "PDF 업로드"}
              </Button>
            </>
          )}
        </Card>

        {/* 유닛 단위 구조도(PDF) */}
        <Card className="p-4 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-sm font-bold">
            <FileText className="size-4 text-primary" />
            구조도 (PDF)
          </div>
          <input
            ref={structureInputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={handleStructureChange}
          />
          {unit.structure_pdf_url ? (
            <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
              <span
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-primary/10 text-primary text-xs font-bold max-w-full truncate"
                title={unit.structure_pdf_name ?? ""}
              >
                <FileText className="size-3.5 shrink-0" />
                <span className="truncate">{unit.structure_pdf_name ?? "PDF"}</span>
              </span>
              {unit.structure_pdf_uploaded_at && (
                <span className="text-[10px] text-muted-foreground">
                  업로드: {new Date(unit.structure_pdf_uploaded_at).toLocaleString("ko-KR", {
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              )}
              <div className="flex items-center gap-1.5 ml-auto">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={handleViewStructure}
                  disabled={viewingStructure}
                >
                  {viewingStructure ? (
                    <Loader2 className="size-3 mr-1 animate-spin" />
                  ) : (
                    <Eye className="size-3 mr-1" />
                  )}
                  보기
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={handleStructurePick}
                  disabled={uploadingStructure}
                >
                  {uploadingStructure ? (
                    <Loader2 className="size-3 mr-1 animate-spin" />
                  ) : (
                    <Upload className="size-3 mr-1" />
                  )}
                  교체
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={handleStructureDelete}
                  disabled={uploadingStructure}
                >
                  <X className="size-3 mr-1" /> 삭제
                </Button>
              </div>
            </div>
          ) : (
            <>
              <span className="text-xs text-muted-foreground flex-1">
                구조도 PDF를 올리면 학생이 학습 후 함께 열람할 수 있어요.
              </span>
              <Button
                size="sm"
                className="h-7 text-xs"
                onClick={handleStructurePick}
                disabled={uploadingStructure}
              >
                {uploadingStructure ? (
                  <Loader2 className="size-3 mr-1 animate-spin" />
                ) : (
                  <Upload className="size-3 mr-1" />
                )}
                {uploadingStructure ? "업로드 중…" : "PDF 업로드"}
              </Button>
            </>
          )}
        </Card>

        {/* 유닛 워크북 일괄 인쇄 */}
        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-bold">
            <ClipboardList className="size-4 text-primary" />
            유닛 워크북 일괄 인쇄
            <span className="text-xs font-normal text-muted-foreground">
              · 유닛 전체 지문을 한 권으로 인쇄
            </span>
          </div>
          <div className="flex items-end gap-3 flex-wrap">
            <div className="flex flex-col gap-1 min-w-[220px]">
              <label className="text-xs text-muted-foreground">학생 선택</label>
              <Select
                value={workbookStudentId}
                onValueChange={(v) => setWorkbookStudentId(v)}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="학생을 선택하세요" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {studentList.length === 0 ? (
                    <div className="p-3 text-xs text-muted-foreground">
                      등록된 학생이 없습니다.
                    </div>
                  ) : (
                    studentList.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name} ({s.no})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="text-xs text-muted-foreground min-w-[140px]">
              {!workbookStudentId ? (
                <span>학생을 선택하면 진행상황이 표시됩니다.</span>
              ) : workbookLoading ? (
                <span className="inline-flex items-center gap-1">
                  <Loader2 className="size-3 animate-spin" /> 진행상황 조회 중…
                </span>
              ) : workbookSummary ? (
                <span>
                  완료 <b className="text-foreground">{workbookSummary.completed}</b> /{" "}
                  {workbookSummary.total} 지문
                </span>
              ) : (
                <span>—</span>
              )}
            </div>
            <Button
              size="sm"
              className="h-9"
              onClick={handleOpenWorkbookPreview}
              disabled={
                !workbookStudentId ||
                workbookPrinting ||
                workbookLoading ||
                !workbookSummary ||
                workbookSummary.total === 0
              }
            >
              {workbookPrinting ? (
                <Loader2 className="size-3.5 mr-1 animate-spin" />
              ) : (
                <Eye className="size-3.5 mr-1" />
              )}
              {workbookPrinting ? "인쇄 준비 중…" : "미리보기 & 인쇄"}
            </Button>
          </div>
        </Card>

        {/* 유닛 워크북 인쇄 미리보기 모달 */}
        {workbookStudentId && workbookSummary && unit && (() => {
          const sel = studentList.find((s) => s.id === workbookStudentId);
          if (!sel) return null;
          const unitCode = `${level && LEVEL_LABEL[level]} · ${series?.title ?? ""} · ${textbook?.title ?? ""} · U${unit.unit_no}`;
          return (
            <UnitWorkbookPreviewDialog
              open={previewOpen}
              onOpenChange={(o) => {
                if (!workbookPrinting) setPreviewOpen(o);
              }}
              studentName={sel.name}
              studentNo={sel.no}
              unitTitle={unit.title}
              unitCode={unitCode}
              completedCodes={workbookSummary.completedCodes}
              pendingCodes={workbookSummary.pendingCodes}
              printing={workbookPrinting}
              onConfirmPrint={handleConfirmPrintWorkbook}
            />
          );
        })()}

        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2 px-1">
            <span className="text-xs text-muted-foreground">
              {selectedIds.size}개 선택됨
            </span>
            <Button variant="outline" size="sm" onClick={clearSel}>
              선택 해제
            </Button>
            <Button variant="outline" size="sm" onClick={() => setMoveOpen(true)}>
              <ArrowRight className="size-4 mr-1" /> 다른 유닛으로 이동
            </Button>
          </div>
        )}

        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-2 px-3 w-10">
                    <Checkbox
                      checked={
                        passages.length > 0 &&
                        passages.every((p) => selectedIds.has(p.id))
                      }
                      onCheckedChange={(v) => {
                        if (v) setSelectedIds(new Set(passages.map((p) => p.id)));
                        else clearSel();
                      }}
                      aria-label="전체 선택"
                    />
                  </th>
                  <th className="py-2 px-3 w-12">순서</th>
                  <th className="py-2 px-3 w-12">#</th>
                  <th className="py-2 px-3 w-44">코드</th>
                  <th className="py-2 px-3">본문 (미리보기)</th>
                  <th className="py-2 px-3 w-28">단어추출</th>
                  <th className="py-2 px-3 w-28">분석상태</th>
                  <th className="py-2 px-3 w-44 text-right">액션</th>
                </tr>
              </thead>
              <tbody>
                {passages.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="py-12 text-center text-sm text-muted-foreground"
                    >
                      아직 지문이 없습니다. 이전 화면의 <strong>본문 삽입</strong>으로
                      지문을 추가하세요.
                    </td>
                  </tr>
                ) : (
                  passages.map((p, idx) => {
                    const ready = p.analysis_status === "ready";
                    const wordCount = extractedMap[p.code] ?? 0;
                    const hasExtracted = wordCount > 0;
                    const checked = selectedIds.has(p.id);
                    return (
                      <tr
                        key={p.id}
                        className={cn(
                          "border-b border-border/50 hover:bg-muted/30",
                          checked && "bg-primary/5",
                        )}
                      >
                        <td className="py-2 px-3">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggleSel(p.id)}
                            aria-label="지문 선택"
                          />
                        </td>
                        <td className="py-2 px-3">
                          <ReorderButtons
                            onMoveUp={() => void handleMovePassage(idx, idx - 1)}
                            onMoveDown={() => void handleMovePassage(idx, idx + 1)}
                            disableUp={idx === 0}
                            disableDown={idx === passages.length - 1}
                            saving={reorderingId === p.id}
                          />
                        </td>
                        <td className="py-2 px-3 font-mono text-xs">{p.passage_no}</td>
                        <td className="py-2 px-3 font-mono text-[10px] text-primary truncate">
                          {p.code}
                        </td>
                        <td className="py-2 px-3 text-xs text-foreground/80 max-w-xl">
                          <span className="line-clamp-2">{p.english}</span>
                        </td>
                        <td className="py-2 px-3">
                          {hasExtracted ? (
                            <button
                              type="button"
                              onClick={() => handleExtract(p)}
                              disabled={extractingCode === p.code}
                              title="다시 추출"
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/15 text-primary hover:bg-primary/25 transition disabled:opacity-50"
                            >
                              {extractingCode === p.code ? (
                                <Loader2 className="size-3 animate-spin" />
                              ) : (
                                <Sparkles className="size-3" />
                              )}
                              {wordCount}개
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleExtract(p)}
                              disabled={extractingCode === p.code}
                              title="AI 단어 추출"
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-muted text-muted-foreground hover:bg-primary/15 hover:text-primary transition disabled:opacity-50"
                            >
                              {extractingCode === p.code ? (
                                <Loader2 className="size-3 animate-spin" />
                              ) : (
                                <Sparkles className="size-3" />
                              )}
                              {extractingCode === p.code ? "추출 중…" : "미추출"}
                            </button>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(p)}
                            disabled={statusTogglingCode === p.code}
                            title={
                              ready
                                ? "클릭하면 '준비중(draft)'으로 되돌립니다"
                                : "클릭하면 '완료(ready)'로 학생에게 공개합니다"
                            }
                            className={cn(
                              "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold transition disabled:opacity-50 cursor-pointer",
                              ready
                                ? "bg-[hsl(142_71%_29%_/_0.15)] text-[hsl(var(--success-foreground,142_71%_29%))] hover:bg-[hsl(142_71%_29%_/_0.25)]"
                                : "bg-[hsl(38_92%_40%_/_0.15)] text-[hsl(var(--warning-foreground,38_92%_40%))] hover:bg-[hsl(38_92%_40%_/_0.25)]",
                            )}
                          >
                            {statusTogglingCode === p.code ? (
                              <Loader2 className="size-3 animate-spin" />
                            ) : ready ? (
                              <FileCheck className="size-3" />
                            ) : (
                              <FileEdit className="size-3" />
                            )}
                            {ready ? "완료" : "완료로 표시"}
                          </button>
                        </td>
                        <td className="py-2 px-3 text-right whitespace-nowrap">
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Hand-out 인쇄"
                            disabled={printingCode === p.code}
                            onClick={() => handlePrint(p)}
                          >
                            {printingCode === p.code ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <Printer className="size-3.5" />
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              navigate(
                                `/teacher/bookshelf/${level}/${series.series_no}/${textbook.volume_no}/${unit.unit_no}/${encodeURIComponent(
                                  p.code,
                                )}/edit`,
                              )
                            }
                          >
                            <Pencil className="size-3.5 mr-1" /> 정답 설정
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            title="지문 삭제"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10 ml-1"
                            onClick={() => setDeleteTarget(p)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>지문을 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-mono text-foreground">{deleteTarget?.code}</span>{" "}
              지문과 관련된 분석/학습 기록은 그대로 남지만, 책장에서는 더 이상 보이지
              않습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeletePassage}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="size-3.5 mr-1 animate-spin" />}삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <MoveItemsDialog
        open={moveOpen}
        onOpenChange={setMoveOpen}
        itemKindLabel="지문"
        selectedIds={Array.from(selectedIds)}
        targets={moveTargets}
        onMove={handleMove}
        onDone={() => {
          clearSel();
          void reload();
        }}
      />
    </TeacherLayout>
  );
};

export default BookshelfUnit;

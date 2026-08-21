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
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
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
  Volume2,
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
  deletePassages,
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
import { fetchExtraction, runExtraction, type ExtractedWord } from "@/lib/wordExtraction";
import { errMsg } from "@/lib/errMsg";
import { openSignedStorageFile } from "@/lib/openSignedStorageFile";
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
import {
  TASK_MODES,
  TASK_MODE_LABEL,
  DEFAULT_TASK_MODE,
  type TaskMode,
} from "@/lib/taskMode";
import {
  composePassageMemorization,
  setPassageMemReady,
  updatePassageTaskMode,
  updateUnitDefaultTaskMode,
  updateUnitMemSettings,
} from "@/lib/memorizationPassage";
import {
  MEM_DIRECTION_SETTING_LABEL,
  type MemDirectionSetting,
} from "@/lib/fetchMemSettings";
import { updatePassageKorean } from "@/lib/textbooks";
import { generatePassageAudio } from "@/lib/passageAudio";

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
  const [hoverWordsMap, setHoverWordsMap] = useState<Record<string, ExtractedWord[]>>({});
  const [reviewedMap, setReviewedMap] = useState<Record<string, boolean>>({});
  const [reviewingCode, setReviewingCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Passage | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
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
  const [unitTaskMode, setUnitTaskMode] = useState<TaskMode>(DEFAULT_TASK_MODE);
  const [unitMemDirection, setUnitMemDirection] = useState<MemDirectionSetting>("ko_to_en");
  const [unitRequireRecord, setUnitRequireRecord] = useState(false);
  const [unitIncludeInterpret, setUnitIncludeInterpret] = useState(false);
  const [unitIncludeTranslate, setUnitIncludeTranslate] = useState(false);
  const [unitDictationBlankRatio, setUnitDictationBlankRatio] = useState(0.6);
  const [unitDictationMinScore, setUnitDictationMinScore] = useState(0);
  const [savingUnitTask, setSavingUnitTask] = useState(false);
  const [savingUnitMem, setSavingUnitMem] = useState(false);
  const [koreanEditId, setKoreanEditId] = useState<string | null>(null);
  const [koreanDraft, setKoreanDraft] = useState("");
  const [composingId, setComposingId] = useState<string | null>(null);
  const [ttsGeneratingCode, setTtsGeneratingCode] = useState<string | null>(null);
  const [bulkTtsBusy, setBulkTtsBusy] = useState(false);
  const [memTogglingCode, setMemTogglingCode] = useState<string | null>(null);
  const [taskSavingId, setTaskSavingId] = useState<string | null>(null);

  const toggleSel = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const clearSel = () => setSelectedIds(new Set());

  const duplicatePassageKey = (p: Passage) => {
    const en = p.english.trim().replace(/\s+/g, " ").toLowerCase();
    if (en.length > 8) return en;
    return p.code.trim().toLowerCase().replace(/-alt\d+/gi, "");
  };

  const selectDuplicatePassages = () => {
    const seen = new Map<string, string>();
    const dupIds = new Set<string>();
    for (const p of passages) {
      const key = duplicatePassageKey(p);
      if (seen.has(key)) dupIds.add(p.id);
      else seen.set(key, p.id);
    }
    setSelectedIds(dupIds);
    if (dupIds.size === 0) {
      toast({
        title: "중복 지문 없음",
        description: "같은 #·본문이 두 번 이상인 항목이 없습니다.",
      });
    } else {
      toast({
        title: `${dupIds.size}개 중복 선택`,
        description: "각 그룹의 뒤쪽(나중) 지문만 선택했습니다.",
      });
    }
  };

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
    opts: { answerKey: boolean; extraUnitIds: string[] } = {
      answerKey: false,
      extraUnitIds: [],
    },
  ) => {
    if (!unit || !workbookStudentId || workbookPrinting) return;
    if (!workbookSummary || workbookSummary.total === 0) {
      toast({ title: "이 유닛에 지문이 없어요", variant: "destructive" });
      return;
    }
    setWorkbookPrinting(true);
    try {
      const codeOf = (unitNo: number) =>
        `${level && LEVEL_LABEL[level]} · ${series?.title ?? ""} · ${textbook?.title ?? ""} · U${unitNo}`;
      const unitCode = codeOf(unit.unit_no);
      const extras = (opts.extraUnitIds ?? [])
        .map((id) => allUnits.find((u) => u.id === id))
        .filter((u): u is NonNullable<typeof u> => !!u)
        .sort((a, b) => a.unit_no - b.unit_no);

      let html: string;
      let completedCount: number;
      if (extras.length > 0) {
        const { buildMultiUnitWorkbookHtml } = await import("@/lib/unitWorkbook");
        const res = await buildMultiUnitWorkbookHtml({
          units: [
            { unitId: unit.id, unitTitle: unit.title, unitCode },
            ...extras.map((u) => ({
              unitId: u.id,
              unitTitle: u.title,
              unitCode: codeOf(u.unit_no),
            })),
          ],
          studentId: workbookStudentId,
          mode,
          answerKey: opts.answerKey,
        });
        html = res.html;
        completedCount = res.passageCount;
      } else {
        const res = await buildUnitWorkbookHtmlFor({
          unitId: unit.id,
          unitTitle: unit.title,
          unitCode,
          studentId: workbookStudentId,
          mode,
          answerKey: opts.answerKey,
        });
        html = res.html;
        completedCount = res.completedCount;
      }
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
   * openSignedStorageFile 로 Blob(text/html) 재오픈한다.
   */
  const openSignedFile = async (signedUrl: string, storagePath: string, fileName?: string | null) => {
    await openSignedStorageFile(signedUrl, storagePath, { fileName });
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
      await openSignedFile(url, unit.analysis_pdf_url, unit.analysis_pdf_name);
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
      await openSignedFile(url, unit.structure_pdf_url, unit.structure_pdf_name);
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
      setHoverWordsMap((prev) => ({ ...prev, [p.code]: res.words }));
      setReviewedMap((prev) => ({ ...prev, [p.code]: false }));
    } finally {
      setExtractingCode(null);
    }
  };

  const handleToggleReviewed = async (code: string) => {
    if (reviewingCode) return;
    const next = !reviewedMap[code];
    setReviewingCode(code);
    try {
      await setExtractionReviewed(code, next);
      setReviewedMap((prev) => ({ ...prev, [code]: next }));
      toast({ title: next ? "✅ 검수완료로 표기했습니다" : "검수완료를 해제했습니다" });
    } catch (e) {
      toast({ title: "검수 표기 실패", description: errMsg(e), variant: "destructive" });
    } finally {
      setReviewingCode(null);
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

  const handleUnitTaskModeChange = async (mode: TaskMode) => {
    if (!unit || savingUnitTask) return;
    setSavingUnitTask(true);
    try {
      await updateUnitDefaultTaskMode(unit.id, mode);
      setUnitTaskMode(mode);
      setUnit({ ...unit, default_task_mode: mode });
      toast({ title: "유닛 기본 테스크 저장", description: TASK_MODE_LABEL[mode] });
    } catch (e) {
      toast({ title: "저장 실패", description: errMsg(e), variant: "destructive" });
    } finally {
      setSavingUnitTask(false);
    }
  };

  const handlePassageTaskModeChange = async (p: Passage, mode: string) => {
    setTaskSavingId(p.id);
    try {
      const value =
        mode === "__unit__" ? null : (mode as TaskMode);
      await updatePassageTaskMode(p.id, value);
      setPassages((prev) =>
        prev.map((x) => (x.id === p.id ? { ...x, task_mode: value } : x)),
      );
    } catch (e) {
      toast({ title: "테스크 변경 실패", description: errMsg(e), variant: "destructive" });
    } finally {
      setTaskSavingId(null);
    }
  };

  const handleUnitMemDirectionChange = async (dir: MemDirectionSetting) => {
    if (!unit || savingUnitMem) return;
    setSavingUnitMem(true);
    try {
      await updateUnitMemSettings(unit.id, { defaultMemDirection: dir });
      setUnitMemDirection(dir);
      toast({ title: "암기 방향 저장", description: MEM_DIRECTION_SETTING_LABEL[dir] });
    } catch (e) {
      toast({ title: "저장 실패", description: errMsg(e), variant: "destructive" });
    } finally {
      setSavingUnitMem(false);
    }
  };

  const handleUnitRequireRecordChange = async (v: boolean) => {
    if (!unit || savingUnitMem) return;
    setSavingUnitMem(true);
    try {
      await updateUnitMemSettings(unit.id, { memRequireRecord: v });
      setUnitRequireRecord(v);
      toast({ title: v ? "녹음 필수 ON" : "녹음 필수 OFF" });
    } catch (e) {
      toast({ title: "저장 실패", description: errMsg(e), variant: "destructive" });
    } finally {
      setSavingUnitMem(false);
    }
  };

  const handleUnitIncludeInterpretChange = async (v: boolean) => {
    if (!unit || savingUnitMem) return;
    setSavingUnitMem(true);
    try {
      await updateUnitMemSettings(unit.id, { memIncludeInterpret: v });
      setUnitIncludeInterpret(v);
      toast({ title: v ? "동시통역 단계 ON" : "동시통역 단계 OFF" });
    } catch (e) {
      toast({ title: "저장 실패", description: errMsg(e), variant: "destructive" });
    } finally {
      setSavingUnitMem(false);
    }
  };

  const handleUnitIncludeTranslateChange = async (v: boolean) => {
    if (!unit || savingUnitMem) return;
    setSavingUnitMem(true);
    try {
      await updateUnitMemSettings(unit.id, { memIncludeTranslate: v });
      setUnitIncludeTranslate(v);
      toast({ title: v ? "번역 단계 ON" : "번역 단계 OFF" });
    } catch (e) {
      toast({ title: "저장 실패", description: errMsg(e), variant: "destructive" });
    } finally {
      setSavingUnitMem(false);
    }
  };

  const handleUnitDictationBlankRatioChange = async (ratio: number) => {
    if (!unit || savingUnitMem) return;
    setSavingUnitMem(true);
    try {
      await updateUnitMemSettings(unit.id, { memDictationBlankRatio: ratio });
      setUnitDictationBlankRatio(ratio);
      toast({ title: "받아쓰기 빈칸 비율 저장", description: `${Math.round(ratio * 100)}%` });
    } catch (e) {
      toast({ title: "저장 실패", description: errMsg(e), variant: "destructive" });
    } finally {
      setSavingUnitMem(false);
    }
  };

  const handleUnitDictationMinScoreChange = async (minScore: number) => {
    if (!unit || savingUnitMem) return;
    setSavingUnitMem(true);
    try {
      await updateUnitMemSettings(unit.id, { memDictationMinScore: minScore });
      setUnitDictationMinScore(minScore);
      toast({
        title: "받아쓰기 최저점 저장",
        description: minScore === 0 ? "기준 없음" : `${minScore}점 이상 권장`,
      });
    } catch (e) {
      toast({ title: "저장 실패", description: errMsg(e), variant: "destructive" });
    } finally {
      setSavingUnitMem(false);
    }
  };

  const startKoreanEdit = (p: Passage) => {
    setKoreanEditId(p.id);
    setKoreanDraft(p.korean ?? "");
  };

  const saveKoreanEdit = async (p: Passage) => {
    try {
      await updatePassageKorean(p.code, koreanDraft.trim());
      setPassages((prev) =>
        prev.map((x) =>
          x.id === p.id ? { ...x, korean: koreanDraft.trim() || null } : x,
        ),
      );
      setKoreanEditId(null);
    } catch (e) {
      toast({ title: "한글 저장 실패", description: errMsg(e), variant: "destructive" });
    }
  };

  const handleComposeMem = async (p: Passage) => {
    setComposingId(p.id);
    try {
      const updated = await composePassageMemorization(p.id);
      setPassages((prev) => prev.map((x) => (x.id === p.id ? updated : x)));
      toast({ title: "암기 자동구성 완료", description: p.code });
    } catch (e) {
      toast({ title: "자동구성 실패", description: errMsg(e), variant: "destructive" });
    } finally {
      setComposingId(null);
    }
  };

  const handleGenerateTts = async (p: Passage, force = false) => {
    setTtsGeneratingCode(p.code);
    try {
      const r = await generatePassageAudio(p.code, p.english, force);
      if (!r.ok) throw new Error(r.error ?? "TTS 생성 실패");
      toast({
        title: r.cached ? "TTS 이미 있음" : "TTS 생성 완료",
        description: p.code,
      });
    } catch (e) {
      toast({ title: "TTS 생성 실패", description: errMsg(e), variant: "destructive" });
    } finally {
      setTtsGeneratingCode(null);
    }
  };

  const handleBulkTts = async () => {
    const targets = passages.filter((p) => p.english?.trim());
    if (targets.length === 0) return;
    setBulkTtsBusy(true);
    let ok = 0;
    let fail = 0;
    try {
      for (const p of targets) {
        const r = await generatePassageAudio(p.code, p.english, false);
        if (r.ok) ok++;
        else fail++;
      }
      toast({
        title: "유닛 TTS 일괄 생성 완료",
        description: `성공 ${ok} · 실패 ${fail}`,
        variant: fail > 0 ? "destructive" : "default",
      });
    } finally {
      setBulkTtsBusy(false);
    }
  };

  const handleToggleMemStatus = async (p: Passage) => {
    if (memTogglingCode) return;
    const nextReady = p.mem_status !== "ready";
    if (nextReady && !p.korean?.trim()) {
      toast({
        title: "한글 해석 필요",
        description: "암기 공개 전 한글을 입력해 주세요.",
        variant: "destructive",
      });
      return;
    }
    setMemTogglingCode(p.code);
    try {
      await setPassageMemReady(p.code, nextReady);
      setPassages((prev) =>
        prev.map((x) =>
          x.id === p.id ? { ...x, mem_status: nextReady ? "ready" : "draft" } : x,
        ),
      );
      toast({
        title: nextReady ? "암기 공개(ready)" : "암기 비공개(draft)",
      });
    } catch (e) {
      toast({ title: "암기 상태 변경 실패", description: errMsg(e), variant: "destructive" });
    } finally {
      setMemTogglingCode(null);
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
      if (u) {
        setUnitTaskMode(u.default_task_mode ?? DEFAULT_TASK_MODE);
        setUnitMemDirection(
          (u as Unit & { default_mem_direction?: MemDirectionSetting }).default_mem_direction ??
            "ko_to_en",
        );
        setUnitRequireRecord(
          !!(u as Unit & { mem_require_record?: boolean }).mem_require_record,
        );
        setUnitIncludeInterpret(
          !!(u as Unit & { mem_include_interpret?: boolean }).mem_include_interpret,
        );
        setUnitIncludeTranslate(
          !!(u as Unit & { mem_include_translate?: boolean }).mem_include_translate,
        );
        setUnitDictationBlankRatio(
          (u as Unit & { mem_dictation_blank_ratio?: number }).mem_dictation_blank_ratio ?? 0.6,
        );
        setUnitDictationMinScore(
          (u as Unit & { mem_dictation_min_score?: number }).mem_dictation_min_score ?? 0,
        );
      }
      if (!u) return;
      const ps = await fetchPassagesByUnit(u.id);
      setPassages(ps);
      const ids = ps.map((p) => p.code);
      if (ids.length > 0) {
        const { data } = await supabase
          .from("sentence_word_extractions")
          .select("sentence_id, words, reviewed_at")
          .in("sentence_id", ids);
        const map: Record<string, number> = {};
        const rmap: Record<string, boolean> = {};
        (data ?? []).forEach((row) => {
          const arr = Array.isArray(row.words) ? row.words : [];
          map[row.sentence_id as string] = arr.length;
          rmap[row.sentence_id as string] = !!(row as { reviewed_at?: string | null }).reviewed_at;
        });
        setExtractedMap(map);
        setReviewedMap(rmap);
      } else {
        setExtractedMap({});
        setReviewedMap({});
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

  const handleBulkDeletePassages = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkDeleting(true);
    try {
      await deletePassages(ids);
      await hydrateSentencesFromDb(true);
      toast({ title: `${ids.length}개 지문 삭제됨` });
      setBulkDeleteOpen(false);
      clearSel();
      void reload();
    } catch (e) {
      toast({
        title: "삭제 실패",
        description: errMsg(e),
        variant: "destructive",
      });
    } finally {
      setBulkDeleting(false);
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
              siblingUnits={allUnits
                .filter((u) => u.textbook_id === textbook.id && u.id !== unit.id)
                .sort((a, b) => a.unit_no - b.unit_no)
                .map((u) => ({ unitId: u.id, unit_no: u.unit_no, title: u.title }))}
              completedCodes={workbookSummary.completedCodes}
              pendingCodes={workbookSummary.pendingCodes}
              printing={workbookPrinting}
              onConfirmPrint={handleConfirmPrintWorkbook}
            />
          );
        })()}

        {(selectedIds.size > 0 || passages.length > 0) && (
          <div className="flex flex-wrap items-center gap-2 px-1 py-2 rounded-lg border border-border bg-muted/30">
            {selectedIds.size > 0 ? (
              <span className="text-xs font-semibold text-foreground">
                {selectedIds.size}개 선택됨
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">
                체크로 여러 지문을 선택하세요
              </span>
            )}
            <Button variant="outline" size="sm" onClick={clearSel} disabled={selectedIds.size === 0}>
              선택 해제
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={selectDuplicatePassages}
              disabled={passages.length < 2}
              title="같은 #·본문이 두 번 이상이면 뒤쪽만 선택"
            >
              중복 선택 (뒤쪽)
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMoveOpen(true)}
              disabled={selectedIds.size === 0}
            >
              <ArrowRight className="size-4 mr-1" /> 다른 유닛으로 이동
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={selectedIds.size === 0}
              className="text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setBulkDeleteOpen(true)}
            >
              <Trash2 className="size-4 mr-1" />
              선택 삭제{selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
            </Button>
          </div>
        )}

        <Card className="p-4 space-y-3">
          <div className="text-sm font-bold">유닛 기본 테스크</div>
          <div className="flex flex-wrap items-center gap-3">
            <Select
              value={unitTaskMode}
              onValueChange={(v) => void handleUnitTaskModeChange(v as TaskMode)}
              disabled={savingUnitTask}
            >
              <SelectTrigger className="w-[200px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TASK_MODES.map((m) => (
                  <SelectItem key={m} value={m}>
                    {TASK_MODE_LABEL[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">
              지문별 「유닛 따름」은 이 설정을 사용합니다.
            </span>
          </div>
        </Card>

        <Card className="p-4 space-y-3">
          <div className="text-sm font-bold">암기 설정</div>
          <div className="flex flex-wrap items-center gap-3">
            <Select
              value={unitMemDirection}
              onValueChange={(v) => void handleUnitMemDirectionChange(v as MemDirectionSetting)}
              disabled={savingUnitMem}
            >
              <SelectTrigger className="w-[200px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(MEM_DIRECTION_SETTING_LABEL) as MemDirectionSetting[]).map((d) => (
                  <SelectItem key={d} value={d}>
                    {MEM_DIRECTION_SETTING_LABEL[d]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">D. 받아쓰기 빈칸 비율</div>
              <Select
                value={String(unitDictationBlankRatio)}
                onValueChange={(v) => void handleUnitDictationBlankRatioChange(Number(v))}
                disabled={savingUnitMem}
              >
                <SelectTrigger className="w-[120px] h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[60, 65, 70, 75, 80, 85, 90, 95, 100].map((pct) => (
                    <SelectItem key={pct} value={String(pct / 100)}>
                      {pct}%{pct === 100 ? " (전체 받아쓰기)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">D. 권장 최저점</div>
              <Select
                value={String(unitDictationMinScore)}
                onValueChange={(v) => void handleUnitDictationMinScoreChange(Number(v))}
                disabled={savingUnitMem}
              >
                <SelectTrigger className="w-[120px] h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">기준 없음</SelectItem>
                  {[60, 70, 80, 90, 100].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}점 이상
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <Checkbox
                checked={unitRequireRecord}
                onCheckedChange={(v) => void handleUnitRequireRecordChange(!!v)}
                disabled={savingUnitMem}
              />
              F. 녹음 필수
            </label>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <Checkbox
                checked={unitIncludeInterpret}
                onCheckedChange={(v) => void handleUnitIncludeInterpretChange(!!v)}
                disabled={savingUnitMem}
              />
              G. 동시통역 포함
            </label>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <Checkbox
                checked={unitIncludeTranslate}
                onCheckedChange={(v) => void handleUnitIncludeTranslateChange(!!v)}
                disabled={savingUnitMem}
              />
              H. 번역 포함
            </label>
            {unit && (
              <Button variant="outline" size="sm" asChild>
                <Link to={`/learn/unit/${unit.id}/flow`}>단락흐름 미리보기</Link>
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              disabled={bulkTtsBusy || passages.length === 0}
              onClick={() => void handleBulkTts()}
            >
              {bulkTtsBusy ? (
                <Loader2 className="size-3.5 mr-1 animate-spin" />
              ) : (
                <Volume2 className="size-3.5 mr-1" />
              )}
              유닛 TTS 일괄 생성
            </Button>
          </div>
        </Card>

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
                  <th className="py-2 px-3 min-w-[140px]">한글 해석</th>
                  <th className="py-2 px-3 w-32">테스크</th>
                  <th className="py-2 px-3 w-24">단어</th>
                  <th className="py-2 px-3 w-24">구문</th>
                  <th className="py-2 px-3 w-24">암기</th>
                  <th className="py-2 px-3 w-36 text-right">액션</th>
                </tr>
              </thead>
              <tbody>
                {passages.length === 0 ? (
                  <tr>
                    <td
                      colSpan={11}
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
                    const isReviewed = !!reviewedMap[p.code];
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
                        <td className="py-2 px-3 text-xs text-foreground/80 max-w-xs">
                          <span
                            className="line-clamp-2 cursor-help"
                            title={p.english ?? ""}
                          >
                            {p.english}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-xs max-w-[180px]">
                          {koreanEditId === p.id ? (
                            <div className="flex flex-col gap-1">
                              <textarea
                                className="w-full min-h-[52px] text-xs rounded border border-border bg-background px-2 py-1"
                                value={koreanDraft}
                                onChange={(e) => setKoreanDraft(e.target.value)}
                              />
                              <div className="flex gap-1">
                                <Button size="sm" className="h-6 text-[10px]" onClick={() => void saveKoreanEdit(p)}>
                                  저장
                                </Button>
                                <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => setKoreanEditId(null)}>
                                  취소
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="text-left line-clamp-2 hover:text-primary w-full cursor-help"
                              onClick={() => startKoreanEdit(p)}
                              title={p.korean?.trim() || "클릭하여 편집"}
                            >
                              {p.korean?.trim() || (
                                <span className="text-muted-foreground italic">한글 입력…</span>
                              )}
                            </button>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          <Select
                            value={p.task_mode ?? "__unit__"}
                            onValueChange={(v) => void handlePassageTaskModeChange(p, v)}
                            disabled={taskSavingId === p.id}
                          >
                            <SelectTrigger className="h-7 text-[10px] w-[108px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__unit__">유닛 따름</SelectItem>
                              {TASK_MODES.map((m) => (
                                <SelectItem key={m} value={m}>
                                  {TASK_MODE_LABEL[m]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="py-2 px-3">
                          {hasExtracted ? (
                            <HoverCard
                              openDelay={120}
                              closeDelay={80}
                              onOpenChange={(open) => {
                                if (open && !hoverWordsMap[p.code]) {
                                  fetchExtraction(p.code).then((row) => {
                                    setHoverWordsMap((prev) => ({
                                      ...prev,
                                      [p.code]: row?.words ?? [],
                                    }));
                                  });
                                }
                              }}
                            >
                              <HoverCardTrigger asChild>
                                <button
                                  type="button"
                                  onClick={() => handleExtract(p)}
                                  disabled={extractingCode === p.code}
                                  className={cn(
                                    "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold transition disabled:opacity-50",
                                    isReviewed
                                      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/25"
                                      : "bg-primary/15 text-primary hover:bg-primary/25",
                                  )}
                                >
                                  {extractingCode === p.code ? (
                                    <Loader2 className="size-3 animate-spin" />
                                  ) : (
                                    <Sparkles className="size-3" />
                                  )}
                                  {wordCount}개{isReviewed ? " ✓" : ""}
                                </button>
                              </HoverCardTrigger>
                              <HoverCardContent
                                side="top"
                                align="center"
                                className="w-64 p-3"
                              >
                                <div className="flex items-center justify-between gap-2 border-b border-border pb-1.5 mb-1.5">
                                  <span className="text-xs font-bold font-kr">
                                    추출된 단어 {wordCount}개
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleToggleReviewed(p.code)}
                                    disabled={reviewingCode === p.code}
                                    className={cn(
                                      "px-2 py-0.5 rounded-full text-[10px] font-bold font-kr transition disabled:opacity-50",
                                      isReviewed
                                        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                                        : "bg-muted text-muted-foreground hover:bg-emerald-500/15 hover:text-emerald-700",
                                    )}
                                  >
                                    {isReviewed ? "검수완료 ✓" : "검수완료로 표기"}
                                  </button>
                                </div>
                                <ul className="max-h-64 overflow-y-auto space-y-1">
                                  {(hoverWordsMap[p.code] ?? []).map((w, i) => (
                                    <li key={i} className="text-xs leading-tight">
                                      <span className="font-semibold">{w.word}</span>
                                      {w.pos && (
                                        <span className="text-muted-foreground ml-1">({w.pos})</span>
                                      )}
                                      <span className="text-foreground/80 ml-1 font-kr">{w.meaning}</span>
                                    </li>
                                  ))}
                                </ul>
                              </HoverCardContent>
                            </HoverCard>
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
                        <td className="py-2 px-3">
                          <button
                            type="button"
                            onClick={() => handleToggleMemStatus(p)}
                            disabled={memTogglingCode === p.code}
                            className={cn(
                              "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold transition disabled:opacity-50",
                              p.mem_status === "ready"
                                ? "bg-violet-500/15 text-violet-700 dark:text-violet-300"
                                : "bg-muted text-muted-foreground hover:bg-violet-500/10",
                            )}
                          >
                            {memTogglingCode === p.code ? (
                              <Loader2 className="size-3 animate-spin" />
                            ) : null}
                            {p.mem_status === "ready" ? "암기공개" : "암기 대기"}
                          </button>
                        </td>
                        <td className="py-2 px-3 text-right whitespace-nowrap">
                          <Button
                            size="sm"
                            variant="ghost"
                            title="TTS 오디오 생성"
                            disabled={ttsGeneratingCode === p.code}
                            onClick={() => void handleGenerateTts(p)}
                          >
                            {ttsGeneratingCode === p.code ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <Volume2 className="size-3.5" />
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            title="암기 자동구성"
                            disabled={composingId === p.id}
                            onClick={() => void handleComposeMem(p)}
                          >
                            {composingId === p.id ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <Sparkles className="size-3.5" />
                            )}
                          </Button>
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

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              선택한 {selectedIds.size}개 지문을 삭제할까요?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  책장 목록에서 제거됩니다. 학생 학습·분석 기록은 DB에 남을 수
                  있습니다.
                </p>
                <ul className="max-h-36 overflow-y-auto rounded border border-border bg-muted/40 p-2 font-mono text-[10px] text-foreground">
                  {passages
                    .filter((p) => selectedIds.has(p.id))
                    .map((p) => (
                      <li key={p.id} className="truncate">
                        {p.code}
                      </li>
                    ))}
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleting}>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDeletePassages}
              disabled={bulkDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {bulkDeleting && <Loader2 className="size-3.5 mr-1 animate-spin" />}
              {selectedIds.size}개 삭제
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

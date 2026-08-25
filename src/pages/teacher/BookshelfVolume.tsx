// ============================================================
// BookshelfVolume — 권 안의 "유닛" 목록 (예: 2026 모고 > 2603모고 / 2509모고)
// 본문 일괄 삽입은 유닛 단위로 수행됩니다.
// ============================================================
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { TeacherLayout } from "@/components/teacher/TeacherLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Plus,
  FileText,
  Pencil,
  Trash2,
  Sparkles,
  Layers,
  FileSignature,
  ListPlus,
  Combine,
  Printer,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowRight } from "lucide-react";
import { LEVEL_LABEL, type LevelCode } from "@/lib/levels";
import {
  fetchSeries,
  fetchTextbook,
  fetchUnitsByTextbook,
  fetchPassagesByUnit,
  createUnit,
  updateUnit,
  deleteUnit,
  updatePassage,
  bulkInsertPassages,
  splitPassageText,
  moveUnitToTextbook,
  reorderUnitsInTextbook,
  reorderPassagesInUnit,
  deletePassages,
  fetchAllSeries,
  type Series,
  type Textbook,
  type Unit,
  type Passage,
} from "@/lib/textbooks";
import { useLevelLabels } from "@/hooks/useLevelLabels";
import { MoveItemsDialog, type MoveTarget } from "@/components/teacher/MoveItemsDialog";
import { MergeUnitsDialog } from "@/components/teacher/MergeUnitsDialog";
import { ReorderButtons } from "@/components/teacher/ReorderButtons";
import { swapListOrder } from "@/lib/bookshelfOrder";
import { cn } from "@/lib/utils";
import { errMsg } from "@/lib/errMsg";
import { hydrateSentencesFromDb } from "@/lib/sentenceSource";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  buildMultiUnitWorkbookHtml,
  WORKBOOK_MODE_LABEL,
  WORKBOOK_MODE_DESC,
  type WorkbookMode,
} from "@/lib/unitWorkbook";
import { launchPrintHtml } from "@/lib/printLauncher";

// ============================================================
// Helpers — bulk unit creation
// ============================================================

/** "18, 19, 40-42\n50" → [18,19,40,41,42,50] (정렬, 중복 제거) */
const parseNumberList = (input: string): number[] => {
  const set = new Set<number>();
  for (const raw of input.split(/[\s,]+/)) {
    const tok = raw.trim();
    if (!tok) continue;
    const m = tok.match(/^(\d+)\s*-\s*(\d+)$/);
    if (m) {
      const a = parseInt(m[1], 10);
      const b = parseInt(m[2], 10);
      if (Number.isFinite(a) && Number.isFinite(b)) {
        const lo = Math.min(a, b);
        const hi = Math.max(a, b);
        for (let i = lo; i <= hi; i++) set.add(i);
      }
      continue;
    }
    const n = parseInt(tok, 10);
    if (Number.isFinite(n)) set.add(n);
  }
  return Array.from(set).sort((a, b) => a - b);
};

/**
 * 기존 값들에서 끝의 1~3자리 숫자를 `{nn}` 으로 치환한 템플릿을 추론.
 * 예) ["263모고20", "263모고21", "263모고32"] → "263모고{nn}"
 *    ["260320", "260321"] → "2603{nn}"
 * 추론 불가 시 빈 문자열.
 */
const inferTemplate = (samples: string[]): string => {
  const candidates = samples
    .map((s) => {
      const m = s.match(/^(.*?)(\d{1,3})$/);
      if (!m) return null;
      return { prefix: m[1], digits: m[2].length };
    })
    .filter((x): x is { prefix: string; digits: number } => !!x);
  if (candidates.length === 0) return "";
  // 가장 흔한 prefix 선택
  const counts = new Map<string, number>();
  for (const c of candidates) counts.set(c.prefix, (counts.get(c.prefix) ?? 0) + 1);
  let bestPrefix = "";
  let bestCount = 0;
  for (const [p, n] of counts) {
    if (n > bestCount) {
      bestPrefix = p;
      bestCount = n;
    }
  }
  return `${bestPrefix}{nn}`;
};

/** `{n}` / `{nn}` / `{nnn}` 토큰을 숫자로 치환. */
const applyTemplate = (tmpl: string, n: number): string => {
  return tmpl
    .replace(/\{nnn\}/g, String(n).padStart(3, "0"))
    .replace(/\{nn\}/g, String(n).padStart(2, "0"))
    .replace(/\{n\}/g, String(n));
};

const MAX_BULK_UNITS = 100;

const BookshelfVolume = () => {
  const { level, seriesNo, volumeNo } = useParams<{
    level: LevelCode;
    seriesNo: string;
    volumeNo: string;
  }>();
  const navigate = useNavigate();
  const [series, setSeries] = useState<Series | null>(null);
  const [textbook, setTextbook] = useState<Textbook | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [firstSentenceMap, setFirstSentenceMap] = useState<Record<string, string>>({});
  const [passageCountMap, setPassageCountMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  // create unit
  const [createOpen, setCreateOpen] = useState(false);
  const [newUnitNo, setNewUnitNo] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);

  // bulk create units (여러 유닛을 한 번에 생성)
  const [bulkCreateOpen, setBulkCreateOpen] = useState(false);
  const [bulkNumbers, setBulkNumbers] = useState("");
  const [titleTemplate, setTitleTemplate] = useState("");
  const [unitNoTemplate, setUnitNoTemplate] = useState("");
  const [bulkCreating, setBulkCreating] = useState(false);

  // bulk insert
  const [insertOpen, setInsertOpen] = useState(false);
  const [insertTarget, setInsertTarget] = useState<Unit | null>(null);
  const [bulkText, setBulkText] = useState("");
  const [splitMode, setSplitMode] = useState<"blank" | "line" | "sentence">("sentence");
  const [inserting, setInserting] = useState(false);

  // edit
  const [editTarget, setEditTarget] = useState<Unit | null>(null);
  const [editUnitNo, setEditUnitNo] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // delete
  const [deleteTarget, setDeleteTarget] = useState<Unit | null>(null);
  const [deleting, setDeleting] = useState(false);

  // 다중선택 + 다른 권으로 이동
  const { display: levelDisplay } = useLevelLabels();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [moveOpen, setMoveOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [reorderingId, setReorderingId] = useState<string | null>(null);
  const [allTextbooks, setAllTextbooks] = useState<
    Array<{ id: string; title: string; volume_no: number; series_id: string }>
  >([]);
  const [allSeriesAll, setAllSeriesAll] = useState<Series[]>([]);

  // 다중 유닛 워크북 인쇄
  const [printOpen, setPrintOpen] = useState(false);
  const [printStudentList, setPrintStudentList] = useState<
    Array<{ id: string; name: string; no: string }>
  >([]);
  const [printStudentId, setPrintStudentId] = useState<string>("");
  const [printMode, setPrintMode] = useState<
    "syntax_unit" | "syntax_book" | "syntax_passage" | "word_unit" | "word_passage"
  >("syntax_book");

  const [printAnswerKey, setPrintAnswerKey] = useState(false);
  const [printing, setPrinting] = useState(false);
  /** 선택한 유닛을 배정받은 학생만 보기 */
  const [printOnlyAssigned, setPrintOnlyAssigned] = useState(true);
  const [assignedStudentIds, setAssignedStudentIds] = useState<Set<string> | null>(null);

  const toggleSel = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const clearSel = () => setSelectedIds(new Set());

  // 워크북 인쇄 모달 오픈 시 학생 목록 로드 (최초 1회만, 재원생만)
  useEffect(() => {
    if (!printOpen || printStudentList.length > 0) return;
    void (async () => {
      const { data } = await supabase
        .from("student_profiles")
        .select("user_id, display_name, student_no, orbit_enrollment_active")
        .order("student_no", { ascending: true });
      const list = (data ?? [])
        .filter((r) => (r as { orbit_enrollment_active?: boolean }).orbit_enrollment_active !== false)
        .map((r) => ({
          id: r.user_id as string,
          name: (r.display_name as string | null) ?? (r.student_no as string),
          no: (r.student_no as string) ?? "",
        }));
      setPrintStudentList(list);
    })().catch(() => undefined);
  }, [printOpen, printStudentList.length]);

  // 선택한 유닛을 배정(또는 학습)받은 학생 id 수집
  useEffect(() => {
    if (!printOpen) return;
    const unitIds = Array.from(selectedIds);
    if (unitIds.length === 0) {
      setAssignedStudentIds(new Set());
      return;
    }
    let cancelled = false;
    void (async () => {
      const ids = new Set<string>();
      const { data: asg } = await supabase
        .from("assignments")
        .select("student_id, unit_id")
        .in("unit_id", unitIds);
      for (const a of asg ?? []) {
        const sid = (a as { student_id: string | null }).student_id;
        if (sid) ids.add(sid);
      }
      const { data: passages } = await supabase
        .from("textbook_passages")
        .select("code, unit_id")
        .in("unit_id", unitIds);
      const codes = (passages ?? []).map((p) => p.code as string).filter(Boolean);
      if (codes.length > 0) {
        const { data: prog } = await supabase
          .from("sentence_progress")
          .select("user_id, sentence_id")
          .in("sentence_id", codes);
        for (const p of prog ?? []) {
          const uid = (p as { user_id: string | null }).user_id;
          if (uid) ids.add(uid);
        }
      }
      if (!cancelled) setAssignedStudentIds(ids);
    })().catch(() => {
      if (!cancelled) setAssignedStudentIds(null);
    });
    return () => {
      cancelled = true;
    };
  }, [printOpen, selectedIds]);

  const visiblePrintStudents =
    printOnlyAssigned && assignedStudentIds
      ? printStudentList.filter((s) => assignedStudentIds.has(s.id))
      : printStudentList;


  const handleOpenPrintDialog = () => {
    if (selectedIds.size === 0) {
      toast({ title: "유닛을 1개 이상 선택하세요", variant: "destructive" });
      return;
    }
    // 여러 유닛을 골랐다면 통합(분석·첨삭) 모드를 기본값으로
    if (selectedIds.size > 1) setPrintMode("syntax_book");
    setPrintOpen(true);
  };


  const handleConfirmPrint = async () => {
    if (!series || !textbook) return;
    if (!printStudentId) {
      toast({ title: "학생을 선택하세요", variant: "destructive" });
      return;
    }
    const selectedUnits = units.filter((u) => selectedIds.has(u.id));
    if (selectedUnits.length === 0) return;
    setPrinting(true);
    try {
      const levelLabel = level ? LEVEL_LABEL[level as LevelCode] ?? level : "";
      const baseCode = `${levelLabel} · ${series.title} · ${textbook.title}`;
      const { html, unitCount, passageCount } = await buildMultiUnitWorkbookHtml({
        units: selectedUnits.map((u) => ({
          unitId: u.id,
          unitTitle: u.title,
          unitCode: `${baseCode} · U${u.unit_no}`,
        })),
        studentId: printStudentId,
        mode: printMode as WorkbookMode,
        answerKey: printMode === "syntax_unit" && printAnswerKey,
      });
      await launchPrintHtml(html, {
        jobKey: `multi-unit-workbook:${textbook.id}:${printStudentId}:${printMode}:${Array.from(selectedIds).sort().join(",")}`,
        loadTimeoutMs: 15000,
        cleanupAfterMs: 2500,
      });
      toast({
        title: "워크북 인쇄 시작",
        description: `${WORKBOOK_MODE_LABEL[printMode]} · 유닛 ${unitCount}개 · 지문 ${passageCount}건`,
      });
      setPrintOpen(false);
    } catch (e) {
      toast({ title: "인쇄 실패", description: errMsg(e), variant: "destructive" });
    } finally {
      setPrinting(false);
    }
  };

  useEffect(() => {
    void (async () => {
      const [seriesAll, { data: tbs }] = await Promise.all([
        fetchAllSeries(),
        supabase.from("textbooks").select("id, title, volume_no, series_id"),
      ]);
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

  const moveTargets: MoveTarget[] = allTextbooks
    .filter((t) => t.id !== textbook?.id)
    .map((t) => {
      const s = allSeriesAll.find((x) => x.id === t.series_id);
      return {
        id: t.id,
        label: t.title,
        group: s
          ? `${levelDisplay(s.level)} · ${s.title} · V${t.volume_no}`
          : `V${t.volume_no}`,
      };
    });

  const handleMove = async (unitId: string, targetTextbookId: string) => {
    await moveUnitToTextbook(unitId, targetTextbookId);
  };

  // edit passages (본문 수정)
  const [passagesUnit, setPassagesUnit] = useState<Unit | null>(null);
  const [unitPassages, setUnitPassages] = useState<Passage[]>([]);
  const [loadingPassages, setLoadingPassages] = useState(false);
  const [editPassage, setEditPassage] = useState<Passage | null>(null);
  const [editPassageEnglish, setEditPassageEnglish] = useState("");
  const [editPassageKorean, setEditPassageKorean] = useState("");
  const [savingPassage, setSavingPassage] = useState(false);
  const [passageSel, setPassageSel] = useState<Set<string>>(new Set());
  const [bulkPassageBusy, setBulkPassageBusy] = useState(false);
  const [mergeConfirmOpen, setMergeConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const togglePassageSel = (id: string) => {
    setPassageSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const clearPassageSel = () => setPassageSel(new Set());
  const allPassagesSelected =
    unitPassages.length > 0 && passageSel.size === unitPassages.length;
  const togglePassageSelAll = () => {
    if (allPassagesSelected) clearPassageSel();
    else setPassageSel(new Set(unitPassages.map((p) => p.id)));
  };

  const handleDeleteSelectedPassages = async () => {
    const ids = Array.from(passageSel);
    if (ids.length === 0) return;
    setBulkPassageBusy(true);
    try {
      await deletePassages(ids);
      const remaining = unitPassages.filter((p) => !passageSel.has(p.id));
      // 남은 지문들 번호 재정렬 (1..N)
      if (remaining.length > 0) {
        await reorderPassagesInUnit(remaining.map((p) => p.id));
      }
      // 새로 불러오기
      if (passagesUnit) {
        const refreshed = await fetchPassagesByUnit(passagesUnit.id);
        setUnitPassages(refreshed);
      }
      clearPassageSel();
      await hydrateSentencesFromDb(true);
      toast({ title: `${ids.length}개 문장 삭제됨` });
      setDeleteConfirmOpen(false);
    } catch (e) {
      toast({ title: "삭제 실패", description: errMsg(e), variant: "destructive" });
    } finally {
      setBulkPassageBusy(false);
    }
  };

  const handleMergeSelectedPassages = async () => {
    const selected = unitPassages
      .filter((p) => passageSel.has(p.id))
      .sort((a, b) => a.passage_no - b.passage_no);
    if (selected.length < 2) return;
    const [keep, ...rest] = selected;
    const mergedEnglish = selected
      .map((p) => p.english.trim())
      .filter(Boolean)
      .join(" ");
    const koreanParts = selected
      .map((p) => (p.korean ?? "").trim())
      .filter(Boolean);
    const mergedKorean = koreanParts.length > 0 ? koreanParts.join(" ") : null;

    setBulkPassageBusy(true);
    try {
      await updatePassage(keep.id, {
        english: mergedEnglish,
        korean: mergedKorean,
      });
      await deletePassages(rest.map((p) => p.id));
      // 재정렬
      const remaining = unitPassages
        .filter((p) => p.id === keep.id || !passageSel.has(p.id))
        .sort((a, b) => a.passage_no - b.passage_no);
      if (remaining.length > 0) {
        await reorderPassagesInUnit(remaining.map((p) => p.id));
      }
      if (passagesUnit) {
        const refreshed = await fetchPassagesByUnit(passagesUnit.id);
        setUnitPassages(refreshed);
      }
      clearPassageSel();
      await hydrateSentencesFromDb(true);
      toast({
        title: `${selected.length}개 문장을 1개로 합쳤어요`,
        description: `${keep.code} 에 이어붙였고, 나머지 ${rest.length}개는 삭제했어요.`,
      });
      setMergeConfirmOpen(false);
    } catch (e) {
      toast({ title: "합치기 실패", description: errMsg(e), variant: "destructive" });
    } finally {
      setBulkPassageBusy(false);
    }
  };

  const openPassagesEditor = async (u: Unit) => {
    setPassagesUnit(u);
    setLoadingPassages(true);
    try {
      const ps = await fetchPassagesByUnit(u.id);
      setUnitPassages(ps);
    } catch (e) {
      toast({ title: "본문 불러오기 실패", description: errMsg(e), variant: "destructive" });
      setPassagesUnit(null);
    } finally {
      setLoadingPassages(false);
    }
  };

  const openEditPassage = (p: Passage) => {
    setEditPassage(p);
    setEditPassageEnglish(p.english);
    setEditPassageKorean(p.korean ?? "");
  };

  const handleSavePassage = async () => {
    if (!editPassage) return;
    const nextEnglish = editPassageEnglish.trim();
    if (!nextEnglish) {
      toast({ title: "본문(영문)을 입력해 주세요", variant: "destructive" });
      return;
    }
    setSavingPassage(true);
    try {
      const { passage: updated, englishChanged, cacheCleared } = await updatePassage(
        editPassage.id,
        {
          english: nextEnglish,
          korean: editPassageKorean.trim() ? editPassageKorean.trim() : null,
        },
      );
      setUnitPassages((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      await hydrateSentencesFromDb(true);
      toast({
        title: "본문이 수정되었습니다",
        description: englishChanged
          ? `${updated.code} · 분석/단어추출 캐시를 자동 정리했어요${cacheCleared ? "" : " (일부 실패)"}. 학생들의 기존 분석 결과는 새 본문과 어긋날 수 있어요.`
          : updated.code,
      });
      setEditPassage(null);
    } catch (e) {
      toast({ title: "수정 실패", description: errMsg(e), variant: "destructive" });
    } finally {
      setSavingPassage(false);
    }
  };

  const reload = async () => {
    if (!level || !seriesNo || !volumeNo) return;
    setLoading(true);
    try {
      const sNo = parseInt(seriesNo, 10);
      const vNo = parseInt(volumeNo, 10);
      const s = await fetchSeries(level, sNo);
      setSeries(s);
      if (!s) {
        setTextbook(null);
        setUnits([]);
        return;
      }
      const tb = await fetchTextbook(s.id, vNo);
      setTextbook(tb);
      if (!tb) {
        setUnits([]);
        return;
      }
      const us = await fetchUnitsByTextbook(tb.id);
      setUnits(us);
      const unitIds = us.map((u) => u.id);
      if (unitIds.length > 0) {
        const { data: ps } = await supabase
          .from("textbook_passages")
          .select("unit_id, passage_no, english")
          .in("unit_id", unitIds)
          .order("passage_no", { ascending: true });
        const firstMap: Record<string, string> = {};
        const countMap: Record<string, number> = {};
        ((ps ?? []) as { unit_id: string; passage_no: number; english: string }[]).forEach(
          (row) => {
            countMap[row.unit_id] = (countMap[row.unit_id] ?? 0) + 1;
            if (!firstMap[row.unit_id] && row.english) {
              const first =
                String(row.english).split(/(?<=[.!?])\s+/)[0] ?? row.english;
              firstMap[row.unit_id] = first;
            }
          },
        );
        setFirstSentenceMap(firstMap);
        setPassageCountMap(countMap);
      } else {
        setFirstSentenceMap({});
        setPassageCountMap({});
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
    clearSel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level, seriesNo, volumeNo]);

  const handleCreate = async () => {
    if (!textbook) return;
    const no = parseInt(newUnitNo, 10);
    if (!Number.isFinite(no) || no < 1) {
      toast({ title: "유닛 번호는 1 이상의 정수여야 합니다", variant: "destructive" });
      return;
    }
    if (!newTitle.trim()) {
      toast({ title: "유닛 제목을 입력하세요", variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      await createUnit({
        textbook_id: textbook.id,
        unit_no: no,
        title: newTitle.trim(),
      });
      toast({ title: "유닛이 추가되었습니다" });
      setCreateOpen(false);
      setNewUnitNo("");
      setNewTitle("");
      void reload();
    } catch (e) {
      toast({
        title: "추가 실패",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  // -------- Bulk-create units --------
  const openBulkCreate = () => {
    // 기존 유닛에서 자동으로 템플릿 추론
    const titleTmpl = inferTemplate(units.map((u) => u.title));
    const noTmpl = inferTemplate(units.map((u) => String(u.unit_no)));
    setTitleTemplate(titleTmpl);
    setUnitNoTemplate(noTmpl);
    setBulkNumbers("");
    setBulkCreateOpen(true);
  };

  const bulkParsedNumbers = parseNumberList(bulkNumbers);
  const bulkPreview = bulkParsedNumbers.slice(0, MAX_BULK_UNITS).map((n) => {
    const title = titleTemplate ? applyTemplate(titleTemplate, n) : "";
    const noStr = unitNoTemplate ? applyTemplate(unitNoTemplate, n) : "";
    const unitNo = parseInt(noStr, 10);
    const exists = units.some((u) => u.unit_no === unitNo);
    const validNo = Number.isFinite(unitNo) && unitNo > 0;
    const validTitle = title.trim().length > 0;
    return { n, title, unitNo, validNo, validTitle, exists };
  });
  const bulkToCreate = bulkPreview.filter(
    (p) => p.validNo && p.validTitle && !p.exists,
  );
  const bulkSkipExisting = bulkPreview.filter((p) => p.exists).length;
  const bulkInvalid = bulkPreview.filter((p) => !p.validNo || !p.validTitle).length;
  const bulkOverLimit = bulkParsedNumbers.length > MAX_BULK_UNITS;

  const handleBulkCreate = async () => {
    if (!textbook) return;
    if (bulkToCreate.length === 0) {
      toast({ title: "추가할 유닛이 없습니다", variant: "destructive" });
      return;
    }
    setBulkCreating(true);
    let okCount = 0;
    let failCount = 0;
    try {
      for (const item of bulkToCreate) {
        try {
          await createUnit({
            textbook_id: textbook.id,
            unit_no: item.unitNo,
            title: item.title,
          });
          okCount += 1;
        } catch (err) {
          console.error("createUnit failed", item, err);
          failCount += 1;
        }
      }
      toast({
        title: `${okCount}개 유닛이 생성되었습니다`,
        description: [
          bulkSkipExisting > 0 ? `이미 있음: ${bulkSkipExisting}개` : null,
          failCount > 0 ? `실패: ${failCount}개` : null,
        ]
          .filter(Boolean)
          .join(" · ") || undefined,
      });
      setBulkCreateOpen(false);
      setBulkNumbers("");
      void reload();
    } finally {
      setBulkCreating(false);
    }
  };

  const openInsert = (u: Unit) => {
    setInsertTarget(u);
    setBulkText("");
    setSplitMode("sentence");
    setInsertOpen(true);
  };

  const previewItems = bulkText ? splitPassageText(bulkText, splitMode) : [];

  const handleBulkInsert = async () => {
    if (!insertTarget || !textbook || !series || !level) return;
    const items = splitPassageText(bulkText, splitMode);
    if (items.length === 0) {
      toast({ title: "본문을 입력하세요", variant: "destructive" });
      return;
    }
    setInserting(true);
    try {
      const inserted = await bulkInsertPassages(
        {
          level,
          series_no: series.series_no,
          volume_no: textbook.volume_no,
          unit: insertTarget,
          textbook_id: textbook.id,
        },
        items,
      );
      toast({ title: `${inserted.length}개 지문이 추가되었습니다` });
      setInsertOpen(false);
      navigate(
        `/teacher/bookshelf/${level}/${series.series_no}/${textbook.volume_no}/${insertTarget.unit_no}`,
      );
    } catch (e) {
      toast({
        title: "추가 실패",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setInserting(false);
    }
  };

  const openEdit = (u: Unit) => {
    setEditTarget(u);
    setEditUnitNo(String(u.unit_no));
    setEditTitle(u.title);
    setEditDesc(u.description ?? "");
  };

  const handleSaveEdit = async () => {
    if (!editTarget) return;
    const no = parseInt(editUnitNo, 10);
    if (!Number.isFinite(no) || no < 1) {
      toast({ title: "유닛 번호는 1 이상의 정수여야 합니다", variant: "destructive" });
      return;
    }
    if (!editTitle.trim()) {
      toast({ title: "제목을 입력하세요", variant: "destructive" });
      return;
    }
    setSavingEdit(true);
    try {
      await updateUnit(editTarget.id, {
        unit_no: no,
        title: editTitle.trim(),
        description: editDesc.trim() || null,
      });
      toast({ title: "유닛 정보가 수정되었습니다" });
      setEditTarget(null);
      void reload();
    } catch (e) {
      toast({
        title: "수정 실패",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setSavingEdit(false);
    }
  };

  const handleMoveUnit = async (fromIdx: number, toIdx: number) => {
    if (reorderingId || !textbook) return;
    const next = swapListOrder(units, fromIdx, toIdx);
    const moving = units[fromIdx];
    if (!moving) return;
    setReorderingId(moving.id);
    try {
      await reorderUnitsInTextbook(next.map((u) => u.id));
      setUnits(next.map((u, i) => ({ ...u, unit_no: i + 1 })));
      toast({ title: "유닛 순서가 변경되었습니다" });
    } catch (e) {
      toast({
        title: "순서 변경 실패",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setReorderingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteUnit(deleteTarget.id);
      await hydrateSentencesFromDb(true);
      toast({ title: `유닛 "${deleteTarget.title}" 삭제됨` });
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

  if (!series || !textbook) {
    return (
      <TeacherLayout>
        <div className="p-6 max-w-3xl mx-auto">
          <Card className="p-10 text-center text-sm text-muted-foreground">
            권을 찾을 수 없습니다.{" "}
            <Link to={`/teacher/bookshelf/${level}`} className="text-primary underline">
              시리즈 목록
            </Link>
          </Card>
        </div>
      </TeacherLayout>
    );
  }

  return (
    <TeacherLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <Link
              to={`/teacher/bookshelf/${level}/${series.series_no}`}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="size-3" /> {series.title}
            </Link>
            <h1 className="text-2xl font-bold flex items-center gap-2 mt-1">
              <Layers className="size-6 text-primary" /> {textbook.title}
              <span className="text-xs font-mono text-muted-foreground">
                {level} · S{series.series_no} · V{textbook.volume_no}
              </span>
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              유닛(예: 2603모고)을 만들고, 그 안에 지문을 일괄 삽입하세요.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {selectedIds.size > 0 && (
              <>
                <span className="text-xs text-muted-foreground">
                  {selectedIds.size}개 선택됨
                </span>
                <Button variant="outline" size="sm" onClick={clearSel}>
                  선택 해제
                </Button>
                <Button variant="outline" size="sm" onClick={() => setMoveOpen(true)}>
                  <ArrowRight className="size-4 mr-1" /> 다른 권으로 이동
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleOpenPrintDialog}
                  className="border-primary/40 text-primary hover:bg-primary/10"
                >
                  <Printer className="size-4 mr-1" /> 워크북 인쇄
                </Button>
                {selectedIds.size >= 2 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setMergeOpen(true)}
                  >
                    <Combine className="size-4 mr-1" /> 유닛 합치기
                  </Button>
                )}
              </>
            )}
            {units.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedIds(new Set(units.map((u) => u.id)))}
                disabled={selectedIds.size === units.length}
              >
                권 전체 유닛 선택
              </Button>
            )}
            <Button variant="outline" onClick={openBulkCreate}>
              <ListPlus className="size-4 mr-1" /> 여러 유닛 추가
            </Button>

            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4 mr-1" /> 새 유닛
            </Button>
          </div>
        </div>

        {units.length === 0 ? (
          <Card className="p-10 text-center text-sm text-muted-foreground">
            아직 유닛이 없습니다. <strong>새 유닛</strong>으로 시작하세요. (예: 2603모고)
          </Card>
        ) : (
          <div className="grid gap-3">
            {units.map((u, idx) => {
              const checked = selectedIds.has(u.id);
              return (
                <Card
                  key={u.id}
                  className={cn(
                    "p-4 hover:border-primary/30 transition-colors",
                    checked && "border-primary ring-1 ring-primary/30",
                  )}
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <ReorderButtons
                        onMoveUp={() => void handleMoveUnit(idx, idx - 1)}
                        onMoveDown={() => void handleMoveUnit(idx, idx + 1)}
                        disableUp={idx === 0}
                        disableDown={idx === units.length - 1}
                        saving={reorderingId === u.id}
                        className="mt-1 shrink-0"
                      />
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleSel(u.id)}
                        className="mt-1.5 shrink-0"
                        aria-label="유닛 선택"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] text-muted-foreground font-mono">
                          U{u.unit_no}
                        </div>
                        <div className="flex items-baseline gap-2 mt-0.5 flex-wrap">
                          <h2 className="text-base font-bold shrink-0">{u.title}</h2>
                          {firstSentenceMap[u.id] && (
                            <span className="text-xs text-muted-foreground italic line-clamp-1 min-w-0">
                              “{firstSentenceMap[u.id]}”
                            </span>
                          )}
                        </div>
                        {u.description && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {u.description}
                          </p>
                        )}
                        <div className="text-[11px] text-muted-foreground mt-1">
                          지문 {passageCountMap[u.id] ?? 0}개
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(u)}
                        title="유닛 수정"
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteTarget(u)}
                        title="유닛 삭제"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => openInsert(u)}>
                        <Sparkles className="size-3.5 mr-1" /> 본문 삽입
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openPassagesEditor(u)}
                        title="본문 수정"
                      >
                        <FileSignature className="size-3.5 mr-1" /> 본문 수정
                      </Button>
                      <Button
                        size="sm"
                        onClick={() =>
                          navigate(
                            `/teacher/bookshelf/${level}/${series.series_no}/${textbook.volume_no}/${u.unit_no}`,
                          )
                        }
                      >
                        <FileText className="size-3.5 mr-1" /> 열기
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Create unit */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>새 유닛 — {textbook.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="unit-no">유닛 번호</Label>
              <Input
                id="unit-no"
                type="number"
                min={1}
                value={newUnitNo}
                onChange={(e) => setNewUnitNo(e.target.value)}
                placeholder="예: 2603"
              />
            </div>
            <div>
              <Label htmlFor="unit-title">유닛 제목</Label>
              <Input
                id="unit-title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="예: 2603모고, Lesson 1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              취소
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating && <Loader2 className="size-3.5 mr-1 animate-spin" />}추가
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk create units */}
      <Dialog open={bulkCreateOpen} onOpenChange={setBulkCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ListPlus className="size-4 text-primary" />
              여러 유닛 한꺼번에 추가 — {textbook.title}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="bulk-numbers">
                유닛 번호 목록 <span className="text-muted-foreground">(콤마/공백/범위 허용)</span>
              </Label>
              <Textarea
                id="bulk-numbers"
                rows={2}
                value={bulkNumbers}
                onChange={(e) => setBulkNumbers(e.target.value)}
                placeholder="예: 18, 19, 40-45"
                className="font-mono text-sm"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="title-tmpl">
                  제목 템플릿 <span className="text-muted-foreground">{`({nn} 자리)`}</span>
                </Label>
                <Input
                  id="title-tmpl"
                  value={titleTemplate}
                  onChange={(e) => setTitleTemplate(e.target.value)}
                  placeholder="예: 263모고{nn}"
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="unitno-tmpl">
                  유닛 번호 템플릿 <span className="text-muted-foreground">{`({nn} 자리)`}</span>
                </Label>
                <Input
                  id="unitno-tmpl"
                  value={unitNoTemplate}
                  onChange={(e) => setUnitNoTemplate(e.target.value)}
                  placeholder="예: 2603{nn}"
                  className="font-mono text-sm"
                />
              </div>
            </div>
            {bulkOverLimit && (
              <div className="text-xs text-destructive">
                최대 {MAX_BULK_UNITS}개까지만 처리됩니다. 나머지는 무시됩니다.
              </div>
            )}
            {bulkPreview.length > 0 && (
              <div className="rounded-md border border-border p-3 bg-muted/30 max-h-64 overflow-auto">
                <div className="flex items-center gap-2 mb-2 text-xs font-bold">
                  <span>미리보기 — </span>
                  <Badge variant="secondary">생성 {bulkToCreate.length}</Badge>
                  {bulkSkipExisting > 0 && (
                    <Badge variant="outline" className="border-amber-500/50 text-amber-600 dark:text-amber-400">
                      이미 있음 {bulkSkipExisting}
                    </Badge>
                  )}
                  {bulkInvalid > 0 && (
                    <Badge variant="destructive">오류 {bulkInvalid}</Badge>
                  )}
                </div>
                <ul className="text-xs space-y-1 font-mono">
                  {bulkPreview.map((p) => {
                    const status = !p.validNo || !p.validTitle
                      ? "invalid"
                      : p.exists
                        ? "exists"
                        : "create";
                    return (
                      <li
                        key={p.n}
                        className="flex items-center gap-2 py-0.5"
                      >
                        <span className="text-muted-foreground w-10">#{p.n}</span>
                        <span className="text-primary w-20">
                          {p.validNo ? `U${p.unitNo}` : "U?"}
                        </span>
                        <span className="flex-1 truncate text-foreground">
                          {p.validTitle ? p.title : "(제목 없음)"}
                        </span>
                        {status === "create" && (
                          <Badge variant="secondary" className="text-[10px]">생성</Badge>
                        )}
                        {status === "exists" && (
                          <Badge variant="outline" className="text-[10px] border-amber-500/50 text-amber-600 dark:text-amber-400">
                            이미 있음
                          </Badge>
                        )}
                        {status === "invalid" && (
                          <Badge variant="destructive" className="text-[10px]">오류</Badge>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              팁: 빈 유닛만 만들어집니다. 본문은 Claude 분석기에서 같은{" "}
              <span className="font-mono">unit_title</span>로 전송하면 자동으로 채워집니다.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBulkCreateOpen(false)} disabled={bulkCreating}>
              취소
            </Button>
            <Button
              onClick={handleBulkCreate}
              disabled={bulkCreating || bulkToCreate.length === 0}
            >
              {bulkCreating && <Loader2 className="size-3.5 mr-1 animate-spin" />}
              {bulkToCreate.length}개 생성
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk insert */}
      <Dialog open={insertOpen} onOpenChange={setInsertOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              본문 일괄 삽입 — {insertTarget?.title} (U{insertTarget?.unit_no})
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>분할 방식</Label>
              <Select
                value={splitMode}
                onValueChange={(v) => setSplitMode(v as typeof splitMode)}
              >
                <SelectTrigger className="w-60">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="blank">빈 줄 기준 (권장)</SelectItem>
                  <SelectItem value="line">한 줄 = 한 지문</SelectItem>
                  <SelectItem value="sentence">한 문장(. ! ?) 기준</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="bulk">영어 본문</Label>
              <Textarea
                id="bulk"
                rows={10}
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                placeholder={
                  "여러 지문을 빈 줄로 구분해 붙여넣으세요.\n\n예) Radio provided the driving force...\n\nWho knew that sportscaster..."
                }
              />
            </div>
            {previewItems.length > 0 && (
              <div className="rounded-md border border-border p-3 bg-muted/30 max-h-52 overflow-auto text-xs space-y-2">
                <div className="font-bold text-foreground">
                  미리보기 — {previewItems.length}개 지문이 추가됩니다
                </div>
                {previewItems.map((p, i) => (
                  <div key={i} className="text-muted-foreground">
                    <span className="font-mono text-primary mr-2">
                      {String(i + 1).padStart(3, "0")}
                    </span>
                    {p.length > 120 ? p.slice(0, 120) + "…" : p}
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setInsertOpen(false)}>
              취소
            </Button>
            <Button
              onClick={handleBulkInsert}
              disabled={inserting || previewItems.length === 0}
            >
              {inserting && <Loader2 className="size-3.5 mr-1 animate-spin" />}
              {previewItems.length}개 추가
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit */}
      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>유닛 수정 — {editTarget?.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="edit-unit-no">유닛 번호</Label>
              <Input
                id="edit-unit-no"
                type="number"
                min={1}
                value={editUnitNo}
                onChange={(e) => setEditUnitNo(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="edit-unit-title">제목</Label>
              <Input
                id="edit-unit-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="edit-unit-desc">설명 (선택)</Label>
              <Textarea
                id="edit-unit-desc"
                rows={2}
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditTarget(null)}>
              취소
            </Button>
            <Button onClick={handleSaveEdit} disabled={savingEdit}>
              {savingEdit && <Loader2 className="size-3.5 mr-1 animate-spin" />}저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>유닛을 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-bold text-foreground">
                {deleteTarget?.title} (U{deleteTarget?.unit_no})
              </span>{" "}
              유닛과 그 안의 <b>모든 지문 · 분석 데이터</b>가 함께 삭제됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="size-3.5 mr-1 animate-spin" />}삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Passage list editor */}
      <Dialog
        open={!!passagesUnit}
        onOpenChange={(o) => {
          if (!o) {
            setPassagesUnit(null);
            setUnitPassages([]);
            clearPassageSel();
          }
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSignature className="size-4 text-primary" />
              본문 수정 — {passagesUnit?.title} (U{passagesUnit?.unit_no})
            </DialogTitle>
          </DialogHeader>
          {unitPassages.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap px-1">
              <Button
                size="sm"
                variant="outline"
                onClick={togglePassageSelAll}
                disabled={bulkPassageBusy}
              >
                {allPassagesSelected ? "선택 해제" : "전체 선택"}
              </Button>
              <div className="text-xs text-muted-foreground">
                {passageSel.size > 0 ? `${passageSel.size}개 선택됨` : "문장 왼쪽 체크박스로 선택"}
              </div>
              <div className="ml-auto flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setMergeConfirmOpen(true)}
                  disabled={bulkPassageBusy || passageSel.size < 2}
                  title="선택한 2개 이상의 문장을 하나로 합칩니다"
                >
                  합치기
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => setDeleteConfirmOpen(true)}
                  disabled={bulkPassageBusy || passageSel.size === 0}
                >
                  <Trash2 className="size-3.5 mr-1" />
                  삭제 ({passageSel.size})
                </Button>
              </div>
            </div>
          )}
          <div className="max-h-[60vh] overflow-auto -mx-6 px-6">
            {loadingPassages ? (
              <div className="flex justify-center py-10">
                <Loader2 className="animate-spin text-primary" />
              </div>
            ) : unitPassages.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                아직 지문이 없습니다.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {unitPassages.map((p) => {
                  const checked = passageSel.has(p.id);
                  return (
                    <li
                      key={p.id}
                      className={cn(
                        "py-2 flex items-start gap-3",
                        checked && "bg-primary/5",
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => togglePassageSel(p.id)}
                        disabled={bulkPassageBusy}
                        className="mt-1"
                      />
                      <div className="font-mono text-xs text-muted-foreground w-10 shrink-0 pt-0.5">
                        {String(p.passage_no).padStart(3, "0")}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-mono text-[10px] text-primary truncate">
                          {p.code}
                        </div>
                        <div className="text-xs text-foreground/80 line-clamp-2">
                          {p.english}
                        </div>
                        {p.korean && (
                          <div className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
                            {p.korean}
                          </div>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openEditPassage(p)}
                        title="본문 수정"
                        disabled={bulkPassageBusy}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPassagesUnit(null)}>
              닫기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 문장 합치기 확인 */}
      <AlertDialog open={mergeConfirmOpen} onOpenChange={setMergeConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>선택한 {passageSel.size}개 문장을 하나로 합칠까요?</AlertDialogTitle>
            <AlertDialogDescription>
              가장 앞 번호 문장에 이어붙이고, 나머지는 삭제됩니다. 분석/단어추출 캐시는 자동으로 정리되고,
              나머지 문장의 학생 학습 기록은 함께 사라집니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkPassageBusy}>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleMergeSelectedPassages();
              }}
              disabled={bulkPassageBusy}
            >
              {bulkPassageBusy && <Loader2 className="size-3.5 mr-1 animate-spin" />}합치기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 문장 일괄 삭제 확인 */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>선택한 {passageSel.size}개 문장을 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              해당 문장과 관련된 학생 학습 기록도 함께 사라집니다. 되돌릴 수 없어요.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkPassageBusy}>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleDeleteSelectedPassages();
              }}
              disabled={bulkPassageBusy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {bulkPassageBusy && <Loader2 className="size-3.5 mr-1 animate-spin" />}삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      {/* Edit a single passage */}
      <Dialog
        open={!!editPassage}
        onOpenChange={(o) => !o && !savingPassage && setEditPassage(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSignature className="size-4 text-primary" /> 본문 수정
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">
              <span className="font-mono text-foreground">{editPassage?.code}</span> 의 본문을
              직접 수정합니다. 본문이 바뀌면 단어추출/분석 답안은 다시 점검해 주세요.
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="passage-english" className="text-xs">
                영문 본문 *
              </Label>
              <Textarea
                id="passage-english"
                value={editPassageEnglish}
                onChange={(e) => setEditPassageEnglish(e.target.value)}
                rows={6}
                className="font-mono text-sm"
                disabled={savingPassage}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="passage-korean" className="text-xs">
                한글 해석 (선택)
              </Label>
              <Textarea
                id="passage-korean"
                value={editPassageKorean}
                onChange={(e) => setEditPassageKorean(e.target.value)}
                rows={4}
                className="text-sm"
                disabled={savingPassage}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditPassage(null)}
              disabled={savingPassage}
            >
              취소
            </Button>
            <Button onClick={handleSavePassage} disabled={savingPassage}>
              {savingPassage && <Loader2 className="size-3.5 mr-1 animate-spin" />}저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MoveItemsDialog
        open={moveOpen}
        onOpenChange={setMoveOpen}
        itemKindLabel="유닛"
        selectedIds={Array.from(selectedIds)}
        targets={moveTargets}
        onMove={handleMove}
        onDone={() => {
          clearSel();
          void reload();
        }}
      />

      <MergeUnitsDialog
        open={mergeOpen}
        onOpenChange={setMergeOpen}
        selectedUnits={units.filter((u) => selectedIds.has(u.id))}
        passageCountMap={passageCountMap}
        firstSentenceMap={firstSentenceMap}
        onDone={() => {
          clearSel();
          void reload();
        }}
      />

      {/* 다중 유닛 워크북 인쇄 다이얼로그 */}
      <Dialog open={printOpen} onOpenChange={(o) => !printing && setPrintOpen(o)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="size-5 text-primary" />
              여러 강(유닛) 워크북 통합 인쇄
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* 선택된 유닛 */}
            <div className="rounded-md border bg-muted/30 p-3">
              <div className="text-xs font-semibold text-muted-foreground mb-1.5">
                선택된 강 ({selectedIds.size}개) — 순서대로 한 권으로 인쇄됩니다
              </div>
              <div className="flex flex-wrap gap-1.5">
                {units
                  .filter((u) => selectedIds.has(u.id))
                  .map((u) => (
                    <Badge key={u.id} variant="outline" className="text-xs">
                      U{u.unit_no} {u.title}
                    </Badge>
                  ))}
              </div>
            </div>

            {/* 학생 선택 */}
            <div>
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-muted-foreground">학생 선택</Label>
                <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    className="size-3.5 accent-primary"
                    checked={printOnlyAssigned}
                    onChange={(e) => setPrintOnlyAssigned(e.target.checked)}
                    disabled={printing}
                  />
                  선택 유닛 배정 학생만
                </label>
              </div>
              <Select value={printStudentId} onValueChange={setPrintStudentId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="학생을 선택하세요" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {visiblePrintStudents.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} ({s.no})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {printOnlyAssigned && visiblePrintStudents.length === 0 && (
                <div className="mt-1 text-[11px] text-muted-foreground">
                  선택한 강을 배정/학습한 학생이 없습니다. 체크를 해제하면 전체 학생이 표시됩니다.
                </div>
              )}
            </div>


            {/* 모드 선택 */}
            <div>
              <Label className="text-xs font-semibold text-muted-foreground">워크북 종류</Label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {(["syntax_book", "syntax_unit", "syntax_passage", "word_unit", "word_passage"] as const).map((m) => {
                  const sel = printMode === m;

                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setPrintMode(m)}
                      disabled={printing}
                      className={cn(
                        "text-left rounded-md border p-2.5 text-sm transition-colors",
                        sel
                          ? "border-primary bg-primary/10 ring-1 ring-primary/30 font-semibold"
                          : "border-border bg-card hover:border-primary/50",
                      )}
                    >
                      <div className="flex items-center gap-1.5">
                        <span>{WORKBOOK_MODE_LABEL[m]}</span>
                        {m === "syntax_book" && (
                          <span className="rounded bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5">
                            권장
                          </span>
                        )}
                      </div>

                      <div className="text-[11px] font-normal text-muted-foreground mt-0.5 leading-snug">
                        {WORKBOOK_MODE_DESC[m]}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 답지 토글 (syntax_unit only) */}
            {printMode === "syntax_unit" && (
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={printAnswerKey}
                  onChange={(e) => setPrintAnswerKey(e.target.checked)}
                  disabled={printing}
                  className="size-4 accent-destructive"
                />
                <span>답지(정답) 모드로 인쇄</span>
              </label>
            )}

            <div className="text-[11px] text-muted-foreground">
              * 완료(단어시험·해석·분석 모두 통과) 지문만 포함됩니다. 완료 지문이 0인 강은 자동으로 건너뜁니다.
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPrintOpen(false)} disabled={printing}>
              취소
            </Button>
            <Button onClick={handleConfirmPrint} disabled={printing || !printStudentId}>
              {printing ? (
                <Loader2 className="size-4 mr-1.5 animate-spin" />
              ) : (
                <Printer className="size-4 mr-1.5" />
              )}
              {printing ? "인쇄 준비 중…" : "통합 인쇄 시작"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TeacherLayout>
  );
};

export default BookshelfVolume;

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
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
  type Series,
  type Textbook,
  type Unit,
  type Passage,
} from "@/lib/textbooks";
import { errMsg } from "@/lib/errMsg";
import { hydrateSentencesFromDb } from "@/lib/sentenceSource";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

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

  // edit passages (본문 수정)
  const [passagesUnit, setPassagesUnit] = useState<Unit | null>(null);
  const [unitPassages, setUnitPassages] = useState<Passage[]>([]);
  const [loadingPassages, setLoadingPassages] = useState(false);
  const [editPassage, setEditPassage] = useState<Passage | null>(null);
  const [editPassageEnglish, setEditPassageEnglish] = useState("");
  const [editPassageKorean, setEditPassageKorean] = useState("");
  const [savingPassage, setSavingPassage] = useState(false);

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
      const updated = await updatePassage(editPassage.id, {
        english: nextEnglish,
        korean: editPassageKorean.trim() ? editPassageKorean.trim() : null,
      });
      setUnitPassages((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      await hydrateSentencesFromDb(true);
      toast({ title: "본문이 수정되었습니다", description: updated.code });
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
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4 mr-1" /> 새 유닛
          </Button>
        </div>

        {units.length === 0 ? (
          <Card className="p-10 text-center text-sm text-muted-foreground">
            아직 유닛이 없습니다. <strong>새 유닛</strong>으로 시작하세요. (예: 2603모고)
          </Card>
        ) : (
          <div className="grid gap-3">
            {units.map((u) => (
              <Card key={u.id} className="p-4 hover:border-primary/30 transition-colors">
                <div className="flex items-start justify-between gap-3 flex-wrap">
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
            ))}
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
                {unitPassages.map((p) => (
                  <li key={p.id} className="py-2 flex items-start gap-3">
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
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => openEditPassage(p)}
                      title="본문 수정"
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                  </li>
                ))}
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
    </TeacherLayout>
  );
};

export default BookshelfVolume;

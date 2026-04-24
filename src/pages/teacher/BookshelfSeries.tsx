// ============================================================
// BookshelfSeries — 시리즈 안의 "권(교재)" 목록 (예: 모고 > 2026 / 2025)
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
  BookOpen,
  Pencil,
  Trash2,
  ChevronRight,
  ArrowRight,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { LEVEL_LABEL, type LevelCode } from "@/lib/levels";
import {
  fetchSeries,
  fetchTextbooksBySeries,
  createTextbook,
  updateTextbook,
  deleteTextbook,
  fetchAllSeries,
  moveTextbookToSeries,
  type Series,
  type Textbook,
} from "@/lib/textbooks";
import { useLevelLabels } from "@/hooks/useLevelLabels";
import { MoveItemsDialog, type MoveTarget } from "@/components/teacher/MoveItemsDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface VolumeStat {
  unitCount: number;
  passageCount: number;
}

const BookshelfSeries = () => {
  const { level, seriesNo } = useParams<{ level: LevelCode; seriesNo: string }>();
  const navigate = useNavigate();
  const { display: levelDisplay } = useLevelLabels();
  const [series, setSeries] = useState<Series | null>(null);
  const [textbooks, setTextbooks] = useState<Textbook[]>([]);
  const [stats, setStats] = useState<Record<string, VolumeStat>>({});
  const [loading, setLoading] = useState(true);

  // create
  const [createOpen, setCreateOpen] = useState(false);
  const [newVol, setNewVol] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);

  // edit
  const [editTarget, setEditTarget] = useState<Textbook | null>(null);
  const [editVol, setEditVol] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // delete
  const [deleteTarget, setDeleteTarget] = useState<Textbook | null>(null);
  const [deleting, setDeleting] = useState(false);

  // 다중 선택 + 이동
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [moveOpen, setMoveOpen] = useState(false);
  const [allSeries, setAllSeries] = useState<Series[]>([]);

  const toggleSel = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const clearSel = () => setSelectedIds(new Set());

  useEffect(() => {
    fetchAllSeries().then(setAllSeries).catch(() => undefined);
  }, []);

  const moveTargets: MoveTarget[] = allSeries
    .filter((s) => s.id !== series?.id)
    .map((s) => ({
      id: s.id,
      label: s.title,
      group: `${levelDisplay(s.level)} · S${s.series_no}`,
    }));

  const handleMove = async (textbookId: string, targetSeriesId: string) => {
    await moveTextbookToSeries(textbookId, targetSeriesId);
  };

  const reload = async () => {
    if (!level || !seriesNo) return;
    setLoading(true);
    try {
      const sNo = parseInt(seriesNo, 10);
      const s = await fetchSeries(level, sNo);
      setSeries(s);
      if (s) {
        const tbs = await fetchTextbooksBySeries(s.id);
        setTextbooks(tbs);
        const tbIds = tbs.map((t) => t.id);
        if (tbIds.length > 0) {
          const { data: us } = await supabase
            .from("textbook_units")
            .select("id, textbook_id")
            .in("textbook_id", tbIds);
          const unitsByTb = new Map<string, string[]>();
          ((us ?? []) as { id: string; textbook_id: string }[]).forEach((u) => {
            if (!unitsByTb.has(u.textbook_id)) unitsByTb.set(u.textbook_id, []);
            unitsByTb.get(u.textbook_id)!.push(u.id);
          });
          const allUnitIds = (us ?? []).map((u) => (u as { id: string }).id);
          const passagesByUnit = new Map<string, number>();
          if (allUnitIds.length > 0) {
            const { data: ps } = await supabase
              .from("textbook_passages")
              .select("unit_id")
              .in("unit_id", allUnitIds);
            ((ps ?? []) as { unit_id: string }[]).forEach((p) => {
              passagesByUnit.set(p.unit_id, (passagesByUnit.get(p.unit_id) ?? 0) + 1);
            });
          }
          const out: Record<string, VolumeStat> = {};
          for (const t of tbs) {
            const unitIds = unitsByTb.get(t.id) ?? [];
            const passages = unitIds.reduce(
              (acc, uid) => acc + (passagesByUnit.get(uid) ?? 0),
              0,
            );
            out[t.id] = { unitCount: unitIds.length, passageCount: passages };
          }
          setStats(out);
        } else {
          setStats({});
        }
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
    clearSel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level, seriesNo]);

  const handleCreate = async () => {
    if (!series || !level) return;
    const vol = parseInt(newVol, 10);
    if (!Number.isFinite(vol) || vol < 1) {
      toast({ title: "권 번호는 1 이상의 정수여야 합니다", variant: "destructive" });
      return;
    }
    if (!newTitle.trim()) {
      toast({ title: "권 제목을 입력하세요", variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      await createTextbook({
        series_id: series.id,
        level,
        volume_no: vol,
        title: newTitle.trim(),
      });
      toast({ title: "권이 추가되었습니다" });
      setCreateOpen(false);
      setNewVol("");
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

  const openEdit = (t: Textbook) => {
    setEditTarget(t);
    setEditVol(String(t.volume_no));
    setEditTitle(t.title);
    setEditDesc(t.description ?? "");
  };

  const handleSaveEdit = async () => {
    if (!editTarget) return;
    const vol = parseInt(editVol, 10);
    if (!Number.isFinite(vol) || vol < 1) {
      toast({ title: "권 번호는 1 이상의 정수여야 합니다", variant: "destructive" });
      return;
    }
    if (!editTitle.trim()) {
      toast({ title: "제목을 입력하세요", variant: "destructive" });
      return;
    }
    setSavingEdit(true);
    try {
      await updateTextbook(editTarget.id, {
        volume_no: vol,
        title: editTitle.trim(),
        description: editDesc.trim() || null,
      });
      toast({ title: "권 정보가 수정되었습니다" });
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
      await deleteTextbook(deleteTarget.id);
      toast({ title: `권 "${deleteTarget.title}" 삭제됨` });
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

  if (!series) {
    return (
      <TeacherLayout>
        <div className="p-6 max-w-3xl mx-auto">
          <Card className="p-10 text-center text-sm text-muted-foreground">
            시리즈를 찾을 수 없습니다.{" "}
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
              to={`/teacher/bookshelf/${level}`}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="size-3" /> {level && LEVEL_LABEL[level]} 시리즈
            </Link>
            <h1 className="text-2xl font-bold flex items-center gap-2 mt-1">
              <BookOpen className="size-6 text-primary" /> {series.title}
              <span className="text-xs font-mono text-muted-foreground">
                {level} · S{series.series_no}
              </span>
            </h1>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4 mr-1" /> 새 권
          </Button>
        </div>

        {textbooks.length === 0 ? (
          <Card className="p-10 text-center text-sm text-muted-foreground">
            아직 권이 없습니다. <strong>새 권</strong>으로 시작하세요. (예: 2026, 2025)
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {textbooks.map((t) => {
              const st = stats[t.id];
              return (
                <Card
                  key={t.id}
                  className="p-4 hover:border-primary/40 transition-colors group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        navigate(
                          `/teacher/bookshelf/${level}/${series.series_no}/${t.volume_no}`,
                        )
                      }
                      className="flex-1 min-w-0 text-left"
                    >
                      <div className="text-[10px] text-muted-foreground font-mono">
                        V{t.volume_no}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <h2 className="text-base font-bold">{t.title}</h2>
                        <ChevronRight className="size-4 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                      {t.description && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                          {t.description}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
                        <span>유닛 {st?.unitCount ?? 0}</span>
                        <span>지문 {st?.passageCount ?? 0}</span>
                      </div>
                    </button>
                    <div className="flex flex-col gap-1 shrink-0">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(t)}>
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteTarget(t)}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Create */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>새 권 — {series.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="vol">권 번호</Label>
              <Input
                id="vol"
                type="number"
                min={1}
                value={newVol}
                onChange={(e) => setNewVol(e.target.value)}
                placeholder="예: 1"
              />
            </div>
            <div>
              <Label htmlFor="vol-title">권 제목</Label>
              <Input
                id="vol-title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="예: 2026, 2025, 1권"
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

      {/* Edit */}
      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>권 수정 — {editTarget?.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="edit-vol">권 번호</Label>
              <Input
                id="edit-vol"
                type="number"
                min={1}
                value={editVol}
                onChange={(e) => setEditVol(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="edit-vol-title">제목</Label>
              <Input
                id="edit-vol-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="edit-vol-desc">설명 (선택)</Label>
              <Textarea
                id="edit-vol-desc"
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
            <AlertDialogTitle>권을 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-bold text-foreground">{deleteTarget?.title}</span>{" "}
              권과 그 안의 <b>모든 유닛 · 지문 · 분석</b>이 함께 삭제됩니다.
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
    </TeacherLayout>
  );
};

export default BookshelfSeries;

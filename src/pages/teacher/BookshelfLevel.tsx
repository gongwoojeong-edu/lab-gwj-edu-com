// ============================================================
// BookshelfLevel — 레벨 안의 "시리즈" 목록 (예: L08 > 모고 / 수능특강)
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
  Layers,
  Pencil,
  Trash2,
  ChevronRight,
  ArrowRight,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { LEVELS, LEVEL_LABEL, type LevelCode } from "@/lib/levels";
import {
  fetchSeriesByLevel,
  createSeries,
  updateSeries,
  deleteSeries,
  moveSeriesToLevel,
  type Series,
} from "@/lib/textbooks";
import { useLevelLabels } from "@/hooks/useLevelLabels";
import { MoveItemsDialog, type MoveTarget } from "@/components/teacher/MoveItemsDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface SeriesStat {
  textbookCount: number;
  unitCount: number;
  passageCount: number;
}

const BookshelfLevel = () => {
  const { level } = useParams<{ level: LevelCode }>();
  const navigate = useNavigate();
  const [seriesList, setSeriesList] = useState<Series[]>([]);
  const [stats, setStats] = useState<Record<string, SeriesStat>>({});
  const [loading, setLoading] = useState(true);

  // create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [newSeriesNo, setNewSeriesNo] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);

  // edit dialog
  const [editTarget, setEditTarget] = useState<Series | null>(null);
  const [editNo, setEditNo] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // delete dialog
  const [deleteTarget, setDeleteTarget] = useState<Series | null>(null);
  const [deleting, setDeleting] = useState(false);

  const reload = async () => {
    if (!level) return;
    setLoading(true);
    try {
      const series = await fetchSeriesByLevel(level);
      setSeriesList(series);
      const seriesIds = series.map((s) => s.id);
      if (seriesIds.length > 0) {
        const { data: tbs } = await supabase
          .from("textbooks")
          .select("id, series_id")
          .in("series_id", seriesIds);
        const tbBySeries = new Map<string, string[]>();
        ((tbs ?? []) as { id: string; series_id: string }[]).forEach((t) => {
          if (!tbBySeries.has(t.series_id)) tbBySeries.set(t.series_id, []);
          tbBySeries.get(t.series_id)!.push(t.id);
        });
        const allTbIds = (tbs ?? []).map((t) => (t as { id: string }).id);
        let unitsByTb = new Map<string, string[]>();
        let allUnitIds: string[] = [];
        if (allTbIds.length > 0) {
          const { data: us } = await supabase
            .from("textbook_units")
            .select("id, textbook_id")
            .in("textbook_id", allTbIds);
          ((us ?? []) as { id: string; textbook_id: string }[]).forEach((u) => {
            if (!unitsByTb.has(u.textbook_id)) unitsByTb.set(u.textbook_id, []);
            unitsByTb.get(u.textbook_id)!.push(u.id);
          });
          allUnitIds = (us ?? []).map((u) => (u as { id: string }).id);
        }
        let passagesByUnit = new Map<string, number>();
        if (allUnitIds.length > 0) {
          const { data: ps } = await supabase
            .from("textbook_passages")
            .select("unit_id")
            .in("unit_id", allUnitIds);
          ((ps ?? []) as { unit_id: string }[]).forEach((p) => {
            passagesByUnit.set(p.unit_id, (passagesByUnit.get(p.unit_id) ?? 0) + 1);
          });
        }
        const out: Record<string, SeriesStat> = {};
        for (const s of series) {
          const tbIds = tbBySeries.get(s.id) ?? [];
          const unitIds = tbIds.flatMap((tid) => unitsByTb.get(tid) ?? []);
          const passages = unitIds.reduce(
            (acc, uid) => acc + (passagesByUnit.get(uid) ?? 0),
            0,
          );
          out[s.id] = {
            textbookCount: tbIds.length,
            unitCount: unitIds.length,
            passageCount: passages,
          };
        }
        setStats(out);
      } else {
        setStats({});
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level]);

  const handleCreate = async () => {
    if (!level) return;
    const no = parseInt(newSeriesNo, 10);
    if (!Number.isFinite(no) || no < 1) {
      toast({ title: "시리즈 번호는 1 이상의 정수여야 합니다", variant: "destructive" });
      return;
    }
    if (!newTitle.trim()) {
      toast({ title: "시리즈 제목을 입력하세요", variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      await createSeries({ level, series_no: no, title: newTitle.trim() });
      toast({ title: "시리즈가 추가되었습니다" });
      setCreateOpen(false);
      setNewSeriesNo("");
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

  const openEdit = (s: Series) => {
    setEditTarget(s);
    setEditNo(String(s.series_no));
    setEditTitle(s.title);
    setEditDesc(s.description ?? "");
  };

  const handleSaveEdit = async () => {
    if (!editTarget) return;
    const no = parseInt(editNo, 10);
    if (!Number.isFinite(no) || no < 1) {
      toast({ title: "시리즈 번호는 1 이상의 정수여야 합니다", variant: "destructive" });
      return;
    }
    if (!editTitle.trim()) {
      toast({ title: "제목을 입력하세요", variant: "destructive" });
      return;
    }
    setSavingEdit(true);
    try {
      await updateSeries(editTarget.id, {
        series_no: no,
        title: editTitle.trim(),
        description: editDesc.trim() || null,
      });
      toast({ title: "시리즈 정보가 수정되었습니다" });
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
      await deleteSeries(deleteTarget.id);
      toast({ title: `시리즈 "${deleteTarget.title}" 삭제됨` });
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

  return (
    <TeacherLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <Link
              to="/teacher/bookshelf"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="size-3" /> 책장
            </Link>
            <h1 className="text-2xl font-bold flex items-center gap-2 mt-1">
              <Layers className="size-6 text-primary" />
              {level && LEVEL_LABEL[level]}
              <span className="text-sm font-mono text-muted-foreground">{level}</span>
              <span className="text-xs text-muted-foreground">· 시리즈</span>
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              시리즈 → 권(교재) → 유닛 → 지문 순서로 자료를 관리합니다.
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4 mr-1" /> 새 시리즈
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="animate-spin text-primary" />
          </div>
        ) : seriesList.length === 0 ? (
          <Card className="p-10 text-center text-sm text-muted-foreground">
            아직 시리즈가 없습니다. 우측 상단 <strong>새 시리즈</strong>로 시작하세요.
            <br />
            예: <em>모고</em>, <em>수능특강</em>, <em>학교교재</em>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {seriesList.map((s) => {
              const st = stats[s.id];
              return (
                <Card
                  key={s.id}
                  className="p-4 hover:border-primary/40 transition-colors group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        navigate(`/teacher/bookshelf/${level}/${s.series_no}`)
                      }
                      className="flex-1 min-w-0 text-left"
                    >
                      <div className="text-[10px] text-muted-foreground font-mono">
                        S{s.series_no}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <h2 className="text-lg font-bold">{s.title}</h2>
                        <ChevronRight className="size-4 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                      {s.description && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                          {s.description}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-3 text-[11px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <BookOpen className="size-3" /> 권 {st?.textbookCount ?? 0}
                        </span>
                        <span>유닛 {st?.unitCount ?? 0}</span>
                        <span>지문 {st?.passageCount ?? 0}</span>
                      </div>
                    </button>
                    <div className="flex flex-col gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(s)}
                        title="시리즈 수정"
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteTarget(s)}
                        title="시리즈 삭제"
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

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>새 시리즈 — {level && LEVEL_LABEL[level]}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="series-no">시리즈 번호</Label>
              <Input
                id="series-no"
                type="number"
                min={1}
                value={newSeriesNo}
                onChange={(e) => setNewSeriesNo(e.target.value)}
                placeholder="예: 1"
              />
            </div>
            <div>
              <Label htmlFor="series-title">시리즈 제목</Label>
              <Input
                id="series-title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="예: 모고 / 수능특강 / 학교교재"
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

      {/* Edit dialog */}
      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>시리즈 수정 — {editTarget?.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="edit-series-no">시리즈 번호</Label>
              <Input
                id="edit-series-no"
                type="number"
                min={1}
                value={editNo}
                onChange={(e) => setEditNo(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="edit-series-title">제목</Label>
              <Input
                id="edit-series-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="edit-series-desc">설명 (선택)</Label>
              <Textarea
                id="edit-series-desc"
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

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>시리즈를 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-bold text-foreground">{deleteTarget?.title}</span>{" "}
              시리즈와 그 안의 <b>모든 권/유닛/지문/분석 데이터</b>가 함께 삭제됩니다.
              되돌릴 수 없습니다.
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

export default BookshelfLevel;

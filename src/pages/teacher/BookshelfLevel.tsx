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
  ChevronLeft,
  Loader2,
  Plus,
  BookOpen,
  FileText,
  Sparkles,
  Pencil,
  Trash2,
} from "lucide-react";
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
import { LEVEL_LABEL, type LevelCode } from "@/lib/levels";
import {
  fetchTextbooksByLevel,
  createTextbook,
  updateTextbook,
  deleteTextbook,
  bulkInsertPassages,
  splitPassageText,
  type Textbook,
} from "@/lib/textbooks";
import { hydrateSentencesFromDb } from "@/lib/sentenceSource";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const BookshelfLevel = () => {
  const { level } = useParams<{ level: LevelCode }>();
  const navigate = useNavigate();
  const [textbooks, setTextbooks] = useState<Textbook[]>([]);
  const [firstSentenceMap, setFirstSentenceMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  // create textbook dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [newUnit, setNewUnit] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);

  // bulk-insert passages dialog
  const [insertOpen, setInsertOpen] = useState(false);
  const [insertTarget, setInsertTarget] = useState<Textbook | null>(null);
  const [bulkText, setBulkText] = useState("");
  const [splitMode, setSplitMode] = useState<"blank" | "line" | "sentence">("blank");
  const [inserting, setInserting] = useState(false);

  // edit textbook dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Textbook | null>(null);
  const [editUnit, setEditUnit] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // delete textbook dialog
  const [deleteTarget, setDeleteTarget] = useState<Textbook | null>(null);
  const [deleting, setDeleting] = useState(false);

  const reload = () => {
    if (!level) return;
    setLoading(true);
    fetchTextbooksByLevel(level)
      .then(async (tbs) => {
        setTextbooks(tbs);
        const ids = tbs.map((t) => t.id);
        if (ids.length > 0) {
          const { data } = await supabase
            .from("textbook_passages")
            .select("textbook_id, passage_no, english")
            .in("textbook_id", ids)
            .order("passage_no", { ascending: true });
          const map: Record<string, string> = {};
          (data ?? []).forEach((row) => {
            const tid = row.textbook_id as string;
            if (!map[tid] && row.english) {
              const first = String(row.english).split(/(?<=[.!?])\s+/)[0] ?? row.english;
              map[tid] = first;
            }
          });
          setFirstSentenceMap(map);
        } else {
          setFirstSentenceMap({});
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level]);

  const handleCreate = async () => {
    if (!level) return;
    const unitNo = parseInt(newUnit, 10);
    if (!Number.isFinite(unitNo) || unitNo < 1) {
      toast({ title: "유닛 번호는 1 이상의 정수여야 합니다", variant: "destructive" });
      return;
    }
    if (!newTitle.trim()) {
      toast({ title: "제목을 입력하세요", variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      await createTextbook({ level, unit_no: unitNo, title: newTitle.trim() });
      toast({ title: "교재가 추가되었습니다" });
      setCreateOpen(false);
      setNewUnit("");
      setNewTitle("");
      reload();
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

  const openInsert = (tb: Textbook) => {
    setInsertTarget(tb);
    setBulkText("");
    setSplitMode("blank");
    setInsertOpen(true);
  };

  const previewItems = bulkText ? splitPassageText(bulkText, splitMode) : [];

  const handleBulkInsert = async () => {
    if (!insertTarget) return;
    const items = splitPassageText(bulkText, splitMode);
    if (items.length === 0) {
      toast({ title: "본문을 입력하세요", variant: "destructive" });
      return;
    }
    setInserting(true);
    try {
      const inserted = await bulkInsertPassages(insertTarget, items);
      toast({ title: `${inserted.length}개 지문이 추가되었습니다` });
      setInsertOpen(false);
      navigate(`/teacher/bookshelf/${level}/${insertTarget.unit_no}`);
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

  const openEdit = (tb: Textbook) => {
    setEditTarget(tb);
    setEditUnit(String(tb.unit_no));
    setEditTitle(tb.title);
    setEditDesc(tb.description ?? "");
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editTarget) return;
    const unitNo = parseInt(editUnit, 10);
    if (!Number.isFinite(unitNo) || unitNo < 1) {
      toast({ title: "유닛 번호는 1 이상의 정수여야 합니다", variant: "destructive" });
      return;
    }
    if (!editTitle.trim()) {
      toast({ title: "제목을 입력하세요", variant: "destructive" });
      return;
    }
    setSavingEdit(true);
    try {
      await updateTextbook(editTarget.id, {
        unit_no: unitNo,
        title: editTitle.trim(),
        description: editDesc.trim() || null,
      });
      toast({ title: "교재 정보가 수정되었습니다" });
      setEditOpen(false);
      reload();
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
      // SENTENCES 캐시 무효화 — 다음 hydrate 때 새로 로드
      await hydrateSentencesFromDb(true);
      toast({ title: `"${deleteTarget.title}" 교재가 삭제되었습니다` });
      setDeleteTarget(null);
      reload();
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
              <BookOpen className="size-6 text-primary" />
              {level && LEVEL_LABEL[level]}
              <span className="text-sm font-mono text-muted-foreground">{level}</span>
            </h1>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4 mr-1" /> 새 교재 만들기
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="animate-spin text-primary" />
          </div>
        ) : textbooks.length === 0 ? (
          <Card className="p-10 text-center text-sm text-muted-foreground">
            아직 교재가 없습니다. 우측 상단의 <strong>새 교재 만들기</strong>로 시작하세요.
          </Card>
        ) : (
          <div className="grid gap-4">
            {textbooks.map((tb) => (
              <Card key={tb.id} className="p-5 hover:border-primary/30 transition-colors">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-muted-foreground font-mono">
                      U{tb.unit_no}
                    </div>
                    <h2 className="text-lg font-bold mt-0.5">{tb.title}</h2>
                    {tb.description && (
                      <p className="text-xs text-muted-foreground mt-1">{tb.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEdit(tb)}
                      title="교재 정보 수정"
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteTarget(tb)}
                      title="교재 삭제"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => openInsert(tb)}>
                      <Sparkles className="size-3.5 mr-1" /> 교재 만들기
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => navigate(`/teacher/bookshelf/${level}/${tb.unit_no}`)}
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

      {/* Create textbook dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>새 교재 만들기 — {level && LEVEL_LABEL[level]}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="unit">유닛 번호</Label>
              <Input
                id="unit"
                type="number"
                min={1}
                value={newUnit}
                onChange={(e) => setNewUnit(e.target.value)}
                placeholder="예: 1"
              />
            </div>
            <div>
              <Label htmlFor="title">제목</Label>
              <Input
                id="title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="예: 고1 S1"
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

      {/* Bulk insert dialog */}
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
              <Select value={splitMode} onValueChange={(v) => setSplitMode(v as typeof splitMode)}>
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
                placeholder={"여러 지문을 빈 줄로 구분해 붙여넣으세요.\n\n예) Radio provided the driving force...\n\nWho knew that sportscaster..."}
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
            <Button onClick={handleBulkInsert} disabled={inserting || previewItems.length === 0}>
              {inserting && <Loader2 className="size-3.5 mr-1 animate-spin" />}
              {previewItems.length}개 추가
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit textbook dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>교재 정보 수정 — {editTarget?.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="edit-unit">유닛 번호</Label>
              <Input
                id="edit-unit"
                type="number"
                min={1}
                value={editUnit}
                onChange={(e) => setEditUnit(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="edit-title">제목</Label>
              <Input
                id="edit-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="edit-desc">설명 (선택)</Label>
              <Textarea
                id="edit-desc"
                rows={2}
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                placeholder="교재에 대한 간단한 메모"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditOpen(false)}>
              취소
            </Button>
            <Button onClick={handleSaveEdit} disabled={savingEdit}>
              {savingEdit && <Loader2 className="size-3.5 mr-1 animate-spin" />}저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete textbook confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>교재를 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-bold text-foreground">
                {deleteTarget?.title} (U{deleteTarget?.unit_no})
              </span>{" "}
              교재와 그 안의 <b>모든 지문 · 분석 데이터</b>가 함께 삭제됩니다. 이 작업은
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

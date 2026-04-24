import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { TeacherLayout } from "@/components/teacher/TeacherLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, BookOpen, FileCheck, FileEdit, Pencil } from "lucide-react";
import { LEVELS, LEVEL_LABEL, type LevelCode } from "@/lib/levels";
import {
  fetchLevelStats,
  upsertLevelLabel,
  type LevelStats,
} from "@/lib/textbooks";
import { useLevelLabels, invalidateLevelLabels } from "@/hooks/useLevelLabels";
import { toast } from "@/hooks/use-toast";
import { errMsg } from "@/lib/errMsg";

const Bookshelf = () => {
  const [stats, setStats] = useState<Map<LevelCode, LevelStats>>(new Map());
  const [loading, setLoading] = useState(true);
  const { display } = useLevelLabels();

  // 라벨 편집
  const [editLevel, setEditLevel] = useState<LevelCode | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchLevelStats()
      .then(setStats)
      .finally(() => setLoading(false));
  }, []);

  const openEdit = (lvl: LevelCode) => {
    setEditLevel(lvl);
    setEditLabel(display(lvl));
  };

  const handleSave = async () => {
    if (!editLevel) return;
    const next = editLabel.trim();
    if (!next) {
      toast({ title: "라벨을 입력하세요", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await upsertLevelLabel(editLevel, next);
      invalidateLevelLabels();
      toast({ title: "레벨 이름이 저장되었습니다" });
      setEditLevel(null);
    } catch (e) {
      toast({ title: "저장 실패", description: errMsg(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <TeacherLayout>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookOpen className="size-6 text-primary" /> 책장
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            레벨별로 교재(유닛)를 관리합니다. 카드를 클릭해 해당 레벨로 이동하세요.
            연필 아이콘으로 표시 이름을 바꿀 수 있습니다.
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {LEVELS.map((l) => {
              const s = stats.get(l.code);
              const tb = s?.textbook_count ?? 0;
              const passages = s?.passage_count ?? 0;
              const ready = s?.ready_count ?? 0;
              const draft = passages - ready;
              return (
                <Card
                  key={l.code}
                  className="p-5 hover:border-primary/50 hover:shadow-md transition-all h-full relative group"
                >
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition h-7 w-7 p-0"
                    onClick={(e) => {
                      e.preventDefault();
                      openEdit(l.code);
                    }}
                    title="레벨 이름 변경"
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Link to={`/teacher/bookshelf/${l.code}`} className="block">
                    <div className="flex items-baseline justify-between mb-2 pr-8">
                      <div className="font-mono text-xs text-muted-foreground">
                        {l.code}
                      </div>
                      <div className="text-xs font-bold text-primary">
                        {display(l.code)}
                      </div>
                    </div>
                    <div className="text-3xl font-extrabold mb-3">{tb}</div>
                    <div className="text-xs text-muted-foreground">교재 수</div>
                    <div className="mt-4 flex items-center gap-3 text-xs">
                      <span className="inline-flex items-center gap-1 text-[hsl(var(--success-foreground,142_71%_29%))]">
                        <FileCheck className="size-3.5" /> {ready}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[hsl(var(--warning-foreground,38_92%_40%))]">
                        <FileEdit className="size-3.5" /> {draft}
                      </span>
                      <span className="ml-auto text-muted-foreground">
                        지문 {passages}개
                      </span>
                    </div>
                  </Link>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* 라벨 편집 */}
      <Dialog open={!!editLevel} onOpenChange={(o) => !o && setEditLevel(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>레벨 이름 변경</DialogTitle>
            <DialogDescription>
              <span className="font-mono">{editLevel}</span> 의 표시 이름만 변경합니다.
              코드는 그대로 유지됩니다.
              <br />
              기본값:{" "}
              <span className="font-bold text-foreground">
                {editLevel && LEVEL_LABEL[editLevel]}
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="level-label">표시 이름</Label>
            <Input
              id="level-label"
              value={editLabel}
              onChange={(e) => setEditLabel(e.target.value)}
              placeholder="예: 초등3학년"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditLevel(null)} disabled={saving}>
              취소
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="size-3.5 mr-1 animate-spin" />}저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TeacherLayout>
  );
};

export default Bookshelf;

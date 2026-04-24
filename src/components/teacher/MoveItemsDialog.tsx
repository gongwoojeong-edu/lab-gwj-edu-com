// ============================================================
// MoveItemsDialog — 책장 항목(시리즈/권/유닛/지문)을 다른 부모로 이동.
// 다중 선택된 N개를 한 번에 옮긴다. 진행률을 보여준다.
// ============================================================
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, ArrowRight } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { errMsg } from "@/lib/errMsg";

export interface MoveTarget {
  id: string;
  label: string;
  /** 그룹화용 보조 텍스트 (예: "L08 · 모고") */
  group?: string;
  disabled?: boolean;
  disabledReason?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** 이동 대상이 될 항목들의 갯수와 라벨 (예: "선택한 3개 시리즈") */
  itemKindLabel: string;
  selectedIds: string[];
  /** 옮길 수 있는 후보 목록 */
  targets: MoveTarget[];
  /** 옮기는 작업 — id 단위로 한 건씩 호출됨 */
  onMove: (itemId: string, targetId: string) => Promise<void>;
  /** 완료 후 부모에서 reload 등 후처리 */
  onDone: () => void;
}

export const MoveItemsDialog = ({
  open,
  onOpenChange,
  itemKindLabel,
  selectedIds,
  targets,
  onMove,
  onDone,
}: Props) => {
  const [targetId, setTargetId] = useState<string>("");
  const [moving, setMoving] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(
    null,
  );

  const handleConfirm = async () => {
    if (!targetId) {
      toast({ title: "이동할 위치를 선택하세요", variant: "destructive" });
      return;
    }
    setMoving(true);
    setProgress({ done: 0, total: selectedIds.length });
    let okCount = 0;
    let failCount = 0;
    try {
      for (const id of selectedIds) {
        try {
          await onMove(id, targetId);
          okCount += 1;
        } catch (e) {
          console.error("move failed", id, e);
          failCount += 1;
        }
        setProgress((p) => (p ? { ...p, done: p.done + 1 } : null));
      }
      toast({
        title: `${okCount}개 이동 완료`,
        description: failCount > 0 ? `실패 ${failCount}개` : undefined,
        variant: failCount > 0 ? "destructive" : undefined,
      });
      onOpenChange(false);
      setTargetId("");
      setProgress(null);
      onDone();
    } catch (e) {
      toast({ title: "이동 실패", description: errMsg(e), variant: "destructive" });
    } finally {
      setMoving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !moving && onOpenChange(o)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRight className="size-4 text-primary" />
            {itemKindLabel} 이동
          </DialogTitle>
          <DialogDescription>
            선택한 <b>{selectedIds.length}개</b>를 아래 위치로 이동합니다.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Select value={targetId} onValueChange={setTargetId} disabled={moving}>
            <SelectTrigger>
              <SelectValue placeholder="이동할 위치 선택…" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {targets.length === 0 ? (
                <div className="py-6 text-center text-xs text-muted-foreground">
                  이동 가능한 위치가 없어요
                </div>
              ) : (
                targets.map((t) => (
                  <SelectItem
                    key={t.id}
                    value={t.id}
                    disabled={t.disabled}
                    title={t.disabledReason}
                  >
                    <div className="flex flex-col">
                      <span className="text-sm">{t.label}</span>
                      {t.group && (
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {t.group}
                        </span>
                      )}
                    </div>
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          {progress && (
            <div className="text-xs text-muted-foreground">
              진행: {progress.done} / {progress.total}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={moving}>
            취소
          </Button>
          <Button onClick={handleConfirm} disabled={moving || !targetId}>
            {moving && <Loader2 className="size-3.5 mr-1 animate-spin" />}이동
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

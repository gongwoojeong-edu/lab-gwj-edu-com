// ============================================================
// MergeUnitsDialog — 선택된 복수 유닛을 한 유닛으로 합치기
// - 대상 유닛(target) 1개 선택, 나머지는 소스(source). 소스의 모든 지문을
//   대상 유닛 끝에 이어 붙이고(passage_no 재배정), 비워진 소스 유닛은 삭제.
// - passage.code 는 그대로 유지(학생 데이터 sentence_id 호환 보존).
// ============================================================
import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Combine, ArrowRight, AlertTriangle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { errMsg } from "@/lib/errMsg";
import {
  deleteUnit,
  fetchPassagesByUnit,
  movePassageToUnit,
  type Unit,
} from "@/lib/textbooks";

export interface MergeUnitsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 합칠 대상 유닛들(2개 이상) */
  selectedUnits: Unit[];
  /** 미리 조회된 지문 갯수 맵 (unit_id → count) — 미리보기용 */
  passageCountMap: Record<string, number>;
  /** 미리 조회된 첫 문장 맵 (unit_id → 첫 문장) — 원문 정보 표시용 */
  firstSentenceMap: Record<string, string>;
  /** 합치기 완료 후 호출 (목록 새로고침 등) */
  onDone: () => void;
}

export const MergeUnitsDialog = ({
  open,
  onOpenChange,
  selectedUnits,
  passageCountMap,
  firstSentenceMap,
  onDone,
}: MergeUnitsDialogProps) => {
  // 기본 대상은 unit_no 가 가장 작은(=가장 앞) 유닛
  const sorted = useMemo(
    () => [...selectedUnits].sort((a, b) => a.unit_no - b.unit_no),
    [selectedUnits],
  );
  const [targetId, setTargetId] = useState<string>("");
  const [merging, setMerging] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(
    null,
  );

  useEffect(() => {
    if (open && sorted.length > 0) {
      setTargetId(sorted[0].id);
      setProgress(null);
    }
  }, [open, sorted]);

  const target = sorted.find((u) => u.id === targetId);
  const sources = sorted.filter((u) => u.id !== targetId);
  const totalSourcePassages = sources.reduce(
    (n, u) => n + (passageCountMap[u.id] ?? 0),
    0,
  );

  const handleConfirm = async () => {
    if (!target) {
      toast({ title: "대상 유닛을 선택하세요", variant: "destructive" });
      return;
    }
    if (sources.length === 0) {
      toast({ title: "합칠 다른 유닛이 없습니다", variant: "destructive" });
      return;
    }
    setMerging(true);
    let movedTotal = 0;
    let movedFail = 0;
    let unitsDeleted = 0;
    let unitDeleteFail = 0;

    // 전체 진행률 = 모든 소스 지문 + 소스 유닛 삭제
    const totalSteps = totalSourcePassages + sources.length;
    setProgress({ done: 0, total: totalSteps });

    try {
      for (const src of sources) {
        let passages;
        try {
          passages = await fetchPassagesByUnit(src.id);
        } catch (e) {
          console.error("fetchPassagesByUnit failed", src.id, e);
          continue;
        }
        for (const p of passages) {
          try {
            await movePassageToUnit(p.id, target.id);
            movedTotal += 1;
          } catch (e) {
            console.error("movePassageToUnit failed", p.id, e);
            movedFail += 1;
          }
          setProgress((prev) =>
            prev ? { ...prev, done: prev.done + 1 } : null,
          );
        }
        // 소스 유닛이 비었으면 삭제
        try {
          await deleteUnit(src.id);
          unitsDeleted += 1;
        } catch (e) {
          console.error("deleteUnit failed", src.id, e);
          unitDeleteFail += 1;
        }
        setProgress((prev) =>
          prev ? { ...prev, done: prev.done + 1 } : null,
        );
      }
      toast({
        title: `합치기 완료 — "${target.title}"`,
        description: [
          `지문 ${movedTotal}개 이동`,
          movedFail > 0 ? `이동 실패 ${movedFail}개` : null,
          `유닛 ${unitsDeleted}개 삭제`,
          unitDeleteFail > 0 ? `삭제 실패 ${unitDeleteFail}개` : null,
        ]
          .filter(Boolean)
          .join(" · "),
        variant: movedFail > 0 || unitDeleteFail > 0 ? "destructive" : undefined,
      });
      onOpenChange(false);
      onDone();
    } catch (e) {
      toast({ title: "합치기 실패", description: errMsg(e), variant: "destructive" });
    } finally {
      setMerging(false);
      setProgress(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !merging && onOpenChange(o)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Combine className="size-5 text-primary" />
            유닛 합치기 — {sorted.length}개 선택됨
          </DialogTitle>
          <DialogDescription>
            아래에서 <b>대상 유닛</b>을 고르면, 나머지 유닛의 모든 지문이 대상
            유닛 끝에 이어 붙고, 비워진 유닛은 자동 삭제됩니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="text-xs font-semibold text-muted-foreground">
            대상 유닛 선택 (지문이 모이는 곳)
          </div>
          <ScrollArea className="max-h-[50vh] rounded-md border">
            <RadioGroup
              value={targetId}
              onValueChange={setTargetId}
              className="p-2 space-y-1.5"
              disabled={merging}
            >
              {sorted.map((u) => {
                const isTarget = u.id === targetId;
                const cnt = passageCountMap[u.id] ?? 0;
                const first = firstSentenceMap[u.id];
                return (
                  <Label
                    key={u.id}
                    htmlFor={`merge-tgt-${u.id}`}
                    className={`flex items-start gap-3 rounded-md border p-3 cursor-pointer transition-colors ${
                      isTarget
                        ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                        : "border-border hover:bg-muted/40"
                    }`}
                  >
                    <RadioGroupItem
                      id={`merge-tgt-${u.id}`}
                      value={u.id}
                      className="mt-1 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-[10px] font-mono text-muted-foreground">
                          U{u.unit_no}
                        </span>
                        <span className="text-sm font-bold">{u.title}</span>
                        {isTarget ? (
                          <Badge className="text-[10px] h-4">대상</Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-[10px] h-4 border-amber-500/50 text-amber-600 dark:text-amber-400"
                          >
                            합쳐짐 → 삭제
                          </Badge>
                        )}
                        <span className="text-[11px] text-muted-foreground">
                          지문 {cnt}개
                        </span>
                      </div>
                      {u.description && (
                        <div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
                          {u.description}
                        </div>
                      )}
                      {first && (
                        <div className="text-xs text-muted-foreground italic mt-1 line-clamp-2">
                          “{first}”
                        </div>
                      )}
                    </div>
                  </Label>
                );
              })}
            </RadioGroup>
          </ScrollArea>

          <div className="rounded-md bg-primary/5 border border-primary/20 px-3 py-2 text-sm flex items-center gap-2">
            <ArrowRight className="size-4 text-primary shrink-0" />
            <div className="flex-1">
              {target ? (
                <>
                  <b>{sources.length}개 유닛</b>의 지문{" "}
                  <b>{totalSourcePassages}개</b>를{" "}
                  <span className="font-semibold text-primary">
                    {target.title} (U{target.unit_no})
                  </span>{" "}
                  뒤에 이어 붙입니다.
                </>
              ) : (
                <span className="text-muted-foreground">대상 유닛을 선택하세요.</span>
              )}
            </div>
          </div>

          <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-300 flex gap-2">
            <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
            <div>
              지문 코드(예: <span className="font-mono">V3U2-001</span>)는 학생
              학습 데이터 보존을 위해 <b>원래 값을 유지</b>합니다. 합쳐진 뒤에도
              코드의 U번호가 원본 유닛과 다를 수 있어요.
            </div>
          </div>

          {progress && (
            <div className="text-xs text-muted-foreground">
              진행: {progress.done} / {progress.total}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={merging}
          >
            취소
          </Button>
          <Button onClick={handleConfirm} disabled={merging || !target}>
            {merging && <Loader2 className="size-3.5 mr-1 animate-spin" />}
            합치기 실행
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

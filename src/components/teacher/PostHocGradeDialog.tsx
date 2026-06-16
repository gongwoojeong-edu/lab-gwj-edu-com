// ============================================================
// PostHocGradeDialog — 과거(이미 통과된) 문장에 대해 선생님이 사후 평가/메모만 입력
//   - sentence_progress.last_grade / last_memo 만 갱신 (status/passed_at 등 진도 데이터는 건드리지 않음)
//   - sentence_approvals 행은 생성하지 않음 (A+C 정책)
// ============================================================
import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import {
  GRADE_BADGE_CLASS,
  GRADE_LABEL,
  GRADE_ORDER,
  type ApprovalGrade,
} from "@/lib/sentenceApprovals";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentUserId: string;
  sentenceId: string;
  initialGrade: ApprovalGrade | null;
  initialMemo: string | null;
  onSaved: (grade: ApprovalGrade, memo: string | null) => void;
}

export const PostHocGradeDialog = ({
  open,
  onOpenChange,
  studentUserId,
  sentenceId,
  initialGrade,
  initialMemo,
  onSaved,
}: Props) => {
  const [grade, setGrade] = useState<ApprovalGrade | null>(initialGrade);
  const [memo, setMemo] = useState(initialMemo ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setGrade(initialGrade);
      setMemo(initialMemo ?? "");
    }
  }, [open, initialGrade, initialMemo]);

  const save = async () => {
    if (!grade) {
      toast({ title: "평가 등급을 선택하세요", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const trimmed = memo.trim() || null;
      const { error } = await supabase
        .from("sentence_progress")
        .update({
          last_grade: grade,
          last_memo: trimmed,
        })
        .eq("user_id", studentUserId)
        .eq("sentence_id", sentenceId);
      if (error) throw error;
      toast({ title: `사후 평가 저장 — ${GRADE_LABEL[grade]}` });
      onSaved(grade, trimmed);
      onOpenChange(false);
    } catch (e: any) {
      toast({
        title: "저장 실패",
        description: e?.message ?? String(e),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="w-5 h-5 text-primary" />
            사후 평가 입력
          </DialogTitle>
          <DialogDescription>
            이미 통과된 문장에 평가/메모만 추가합니다. 학생의 진도 상태는 변경되지 않습니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <div className="text-xs font-semibold text-muted-foreground">평가 등급</div>
          <div className="grid grid-cols-5 gap-1.5">
            {GRADE_ORDER.map((g) => {
              const selected = grade === g;
              return (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGrade(g)}
                  className={cn(
                    "px-2 py-2 rounded-md border text-xs font-bold transition-all",
                    selected
                      ? GRADE_BADGE_CLASS[g] + " scale-105 shadow-md"
                      : "bg-card hover:bg-muted border-border text-foreground",
                  )}
                >
                  {GRADE_LABEL[g]}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-semibold text-muted-foreground">
            메모 <span className="font-normal">(선택)</span>
          </div>
          <Textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="짧은 피드백을 남겨주세요"
            rows={3}
            maxLength={300}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            취소
          </Button>
          <Button onClick={save} disabled={saving || !grade}>
            {saving ? "저장 중..." : "저장"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

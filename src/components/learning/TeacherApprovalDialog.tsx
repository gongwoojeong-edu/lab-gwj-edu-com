import { useEffect, useState } from "react";
import { Lock, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { fetchTeacherPin } from "@/lib/teacherPin";
import {
  approveSentenceRequest,
  GRADE_LABEL,
  GRADE_BADGE_CLASS,
  GRADE_ORDER,
  type ApprovalGrade,
} from "@/lib/sentenceApprovals";

interface Props {
  approvalId: string;
  sentenceId: string;
  /** 학생 한글해석 (참고용 표시) */
  studentTranslation?: string | null;
  englishSentence?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApproved: (grade: ApprovalGrade) => void;
}

/**
 * 한글해석 제출 직후 선생님이 즉시 승인하는 다이얼로그.
 * 선생님 PIN + 5단계 등급(매우잘함/잘함/보통/미흡/재학습) + 메모.
 * 학원 공용 PC 트래픽 패턴 — 학생 세션 그대로 사용, PIN 으로 게이트.
 */
export const TeacherApprovalDialog = ({
  approvalId,
  sentenceId,
  studentTranslation,
  englishSentence,
  open,
  onOpenChange,
  onApproved,
}: Props) => {
  const [pin, setPin] = useState("");
  const [storedPin, setStoredPin] = useState<string | null | undefined>(undefined);
  const [grade, setGrade] = useState<ApprovalGrade | null>(null);
  const [memo, setMemo] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPin("");
    setGrade(null);
    setMemo("");
    let mounted = true;
    fetchTeacherPin()
      .then((p) => mounted && setStoredPin(p))
      .catch(() => mounted && setStoredPin(null));
    return () => {
      mounted = false;
    };
  }, [open]);

  const submit = async () => {
    if (saving) return;
    if (!grade) {
      toast({ title: "평가 등급을 선택하세요", variant: "destructive" });
      return;
    }
    let pinToCheck = storedPin;
    if (!pinToCheck) {
      pinToCheck = await fetchTeacherPin().catch(() => null);
      setStoredPin(pinToCheck);
    }
    if (!pinToCheck) {
      toast({
        title: "PIN이 설정되지 않았어요",
        description: "선생님께 패스키 설정을 요청하세요.",
        variant: "destructive",
      });
      return;
    }
    if (pin.trim() !== pinToCheck.trim()) {
      toast({ title: "PIN이 일치하지 않습니다", variant: "destructive" });
      setPin("");
      return;
    }

    setSaving(true);
    try {
      await approveSentenceRequest({ approvalId, sentenceId, grade, memo });
      toast({
        title: `승인 완료 — ${GRADE_LABEL[grade]}`,
        description: grade === "redo" ? "재학습으로 분류됐어요" : "다음 문장으로 진행합니다",
      });
      onOpenChange(false);
      onApproved(grade);
    } catch (e: any) {
      toast({
        title: "승인 저장 실패",
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
            <ShieldCheck className="w-5 h-5 text-primary" />
            선생님 승인 — 평가
          </DialogTitle>
          <DialogDescription>
            한글해석을 확인하고 평가 등급과 메모를 입력해 주세요.
          </DialogDescription>
        </DialogHeader>

        {(englishSentence || studentTranslation) && (
          <div className="space-y-2 text-sm border rounded-md p-3 bg-muted/30">
            {englishSentence && (
              <div>
                <div className="text-[11px] text-muted-foreground">원문</div>
                <div className="font-medium leading-snug">{englishSentence}</div>
              </div>
            )}
            {studentTranslation && (
              <div>
                <div className="text-[11px] text-muted-foreground">학생 한글해석</div>
                <div className="whitespace-pre-wrap">{studentTranslation}</div>
              </div>
            )}
          </div>
        )}

        <div className="space-y-2">
          <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
            <Lock className="w-3 h-3" /> 선생님 PIN
          </div>
          <Input
            inputMode="numeric"
            maxLength={6}
            placeholder="••••"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="text-center text-xl tracking-[0.5em] font-mono"
            autoFocus
          />
        </div>

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
            placeholder="피드백을 짧게 남겨주세요"
            rows={2}
            maxLength={300}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            취소
          </Button>
          <Button onClick={submit} disabled={saving || pin.length < 4 || !grade}>
            {saving ? "저장 중..." : "승인하고 다음 문장으로"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

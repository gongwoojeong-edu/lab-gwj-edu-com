import { useState } from "react";
import { Hourglass, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TeacherApprovalDialog } from "@/components/learning/TeacherApprovalDialog";
import type { ApprovalGrade } from "@/lib/sentenceApprovals";

interface Props {
  approvalId: string;
  sentenceId: string;
  englishSentence?: string;
  studentTranslation?: string | null;
  onApproved: (grade: ApprovalGrade) => void;
}

/**
 * 한글해석 제출 후 학생이 보는 대기 화면.
 * 선생님이 같은 화면에서 [선생님 승인] 버튼을 눌러 PIN + 평가 등급 + 메모 입력.
 */
export const ApprovalWaitingPanel = ({
  approvalId,
  sentenceId,
  englishSentence,
  studentTranslation,
  onApproved,
}: Props) => {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      <Card className="p-6 border-2 border-amber-500/50 bg-amber-50/40 dark:bg-amber-500/5 space-y-4 text-center">
        <div className="flex flex-col items-center gap-2">
          <div className="relative w-14 h-14 flex items-center justify-center">
            <span className="absolute inset-0 rounded-full bg-amber-500/20 animate-ping" />
            <Hourglass className="relative w-8 h-8 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="text-lg font-bold text-foreground">선생님 승인을 기다리고 있어요</div>
          <p className="text-sm text-muted-foreground max-w-md">
            한글해석을 제출했어요. 선생님이 검토 후 <b>평가 등급</b>을 입력하면 다음 문장으로 진행됩니다.
          </p>
        </div>

        {studentTranslation && (
          <div className="text-left text-sm border rounded-md p-3 bg-card/60">
            <div className="text-[11px] text-muted-foreground mb-1">제출한 한글해석</div>
            <div className="whitespace-pre-wrap leading-relaxed">{studentTranslation}</div>
          </div>
        )}

        <Button
          size="lg"
          onClick={() => setDialogOpen(true)}
          className="bg-primary hover:bg-primary/90"
        >
          <ShieldCheck className="w-4 h-4 mr-2" />
          선생님 승인
        </Button>

        <p className="text-[11px] text-muted-foreground">
          선생님 PIN을 입력하고 5단계 평가(매우잘함/잘함/보통/미흡/재학습) 후 다음 문장으로 진행됩니다.
        </p>
      </Card>

      <TeacherApprovalDialog
        approvalId={approvalId}
        sentenceId={sentenceId}
        englishSentence={englishSentence}
        studentTranslation={studentTranslation}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onApproved={onApproved}
      />
    </>
  );
};

import { Hourglass } from "lucide-react";
import { Card } from "@/components/ui/card";

interface Props {
  studentTranslation?: string | null;
}

/**
 * 한글해석 제출 후 학생이 보는 대기 화면.
 * 승인은 선생님 화면(/teacher/approvals)에서 진행되며,
 * 승인 즉시 실시간 구독을 통해 학생 화면이 자동으로 다음 단계로 넘어간다.
 */
export const ApprovalWaitingPanel = ({ studentTranslation }: Props) => {
  return (
    <Card className="p-6 border-2 border-amber-500/50 bg-amber-50/40 dark:bg-amber-500/5 space-y-4 text-center">
      <div className="flex flex-col items-center gap-2">
        <div className="relative w-14 h-14 flex items-center justify-center">
          <span className="absolute inset-0 rounded-full bg-amber-500/20 animate-ping" />
          <Hourglass className="relative w-8 h-8 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="text-lg font-bold text-foreground">선생님 승인을 기다리고 있어요</div>
        <p className="text-sm text-muted-foreground max-w-md">
          한글해석을 제출했어요. 선생님이 <b>승인 대기 목록</b>에서 확인 후 평가 등급을 입력하면
          자동으로 다음 문장으로 진행됩니다.
        </p>
      </div>

      {studentTranslation && (
        <div className="text-left text-sm border rounded-md p-3 bg-card/60">
          <div className="text-[11px] text-muted-foreground mb-1">제출한 한글해석</div>
          <div className="whitespace-pre-wrap leading-relaxed">{studentTranslation}</div>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        선생님 화면 · 학습관리 → <b>승인 대기</b> 메뉴에서 평가를 진행합니다.
      </p>
    </Card>
  );
};

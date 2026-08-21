import { Hourglass, PenLine } from "lucide-react";
import { Card } from "@/components/ui/card";
import { stripKoreanFromEnglishSource } from "@/lib/sentenceSource";
import { StructuredMemoView } from "@/components/learning/StructuredMemoView";

interface Props {
  englishSentence?: string | null;
  studentTranslation?: string | null;
  /** 'held' 이면 상세 첨삭 준비중 안내로 표시 */
  status?: "pending" | "held";
  heldMemo?: string | null;
}

/**
 * 한글해석 제출 후 학생이 보는 대기 화면.
 * 승인은 선생님 화면(/teacher/approvals)에서 진행되며,
 * 승인 즉시 실시간 구독을 통해 학생 화면이 자동으로 다음 단계로 넘어간다.
 */
export const ApprovalWaitingPanel = ({ englishSentence, studentTranslation, status = "pending", heldMemo }: Props) => {
  const isHeld = status === "held";
  const safeEnglish = englishSentence
    ? stripKoreanFromEnglishSource(englishSentence)
    : null;

  return (
    <Card className="p-6 border-2 border-amber-500/50 bg-amber-50/40 dark:bg-amber-500/5 space-y-4 text-center">
      <div className="flex flex-col items-center gap-2">
        <div className="relative w-14 h-14 flex items-center justify-center">
          <span className="absolute inset-0 rounded-full bg-amber-500/20 animate-ping" />
          {isHeld ? (
            <PenLine className="relative w-8 h-8 text-amber-600 dark:text-amber-400" />
          ) : (
            <Hourglass className="relative w-8 h-8 text-amber-600 dark:text-amber-400" />
          )}
        </div>
        <div className="text-lg font-bold text-foreground">
          {isHeld ? "선생님이 자세한 첨삭을 준비 중이에요" : "선생님 승인을 기다리고 있어요"}
        </div>
        <p className="text-sm text-muted-foreground max-w-md">
          {isHeld
            ? "선생님이 제출한 해석을 보류해두었어요. 곧 상세한 첨삭 피드백이 도착합니다."
            : (<>한글해석을 제출했어요. 선생님이 <b>승인 대기 목록</b>에서 확인 후 평가 등급을 입력하면 자동으로 다음 문장으로 진행됩니다.</>)}
        </p>
        {isHeld && heldMemo && (
          <div className="mt-1 text-left text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-md px-3 py-2 max-w-md">
            <div className="text-[11px] font-semibold mb-1">선생님 임시 메모</div>
            <StructuredMemoView memo={heldMemo} />
          </div>
        )}
      </div>

      {(safeEnglish || studentTranslation) && (
        <div className="text-left space-y-3">
          {safeEnglish && (
            <div className="text-sm border rounded-md p-3 bg-card/60">
              <div className="text-[11px] text-muted-foreground mb-1">영어 원문</div>
              <div className="text-base font-medium leading-relaxed">{safeEnglish}</div>
            </div>
          )}
          {studentTranslation && (
            <div className="text-sm border rounded-md p-3 bg-card/60">
              <div className="text-[11px] text-muted-foreground mb-1">제출한 한글해석</div>
              <div className="whitespace-pre-wrap leading-relaxed">{studentTranslation}</div>
            </div>
          )}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        선생님 화면 · 학습관리 → <b>승인 대기</b> 메뉴에서 평가를 진행합니다.
      </p>
    </Card>
  );
};

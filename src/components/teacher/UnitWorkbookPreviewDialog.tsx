// ============================================================
// UnitWorkbookPreviewDialog — 워크북 인쇄 전 미리보기 + 4종 모드 선택
//
// 4종 워크북:
//   1. 구문 · 유닛 통합  (syntax_unit)
//   2. 구문 · 문장별     (syntax_passage)
//   3. 단어 · 유닛 통합  (word_unit)
//   4. 단어 · 문장별     (word_passage)
//
// 단어와 구문은 같은 PDF에 절대 섞지 않음 — 둘 다 필요하면 두 번 인쇄.
// ============================================================
import { useState, useEffect } from "react";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Printer,
  Loader2,
  Check,
  X as XIcon,
  FileText,
  Files,
  ListChecks,
  ScrollText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  WORKBOOK_MODE_LABEL,
  WORKBOOK_MODE_DESC,
  type WorkbookMode,
} from "@/lib/unitWorkbook";

export type { WorkbookMode };

export interface WorkbookSiblingUnit {
  unitId: string;
  unit_no: number;
  title: string;
}

export interface UnitWorkbookPreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentName: string;
  studentNo: string;
  unitTitle: string;
  unitCode: string;
  /** 초기 선택 모드 — 기본 syntax_unit */
  defaultMode?: WorkbookMode;
  completedCodes: string[];
  pendingCodes: string[];
  printing: boolean;
  /** 같은 책의 다른 유닛 — 한꺼번에 워크북 구성용 */
  siblingUnits?: WorkbookSiblingUnit[];
  /** 사용자가 선택한 모드를 받아 인쇄 실행 (extraUnitIds = 함께 인쇄할 다른 유닛) */
  onConfirmPrint: (
    mode: WorkbookMode,
    opts: { answerKey: boolean; extraUnitIds: string[] },
  ) => void;
}


interface ModeCard {
  key: WorkbookMode;
  Icon: typeof FileText;
  category: "구문" | "단어";
}

const MODE_CARDS: ModeCard[] = [
  { key: "syntax_unit", Icon: ScrollText, category: "구문" },
  { key: "syntax_passage", Icon: FileText, category: "구문" },
  { key: "word_unit", Icon: Files, category: "단어" },
  { key: "word_passage", Icon: ListChecks, category: "단어" },
];

export const UnitWorkbookPreviewDialog = ({
  open,
  onOpenChange,
  studentName,
  studentNo,
  unitTitle,
  unitCode,
  defaultMode = "syntax_unit",
  completedCodes,
  pendingCodes,
  printing,
  onConfirmPrint,
}: UnitWorkbookPreviewProps) => {
  const [mode, setMode] = useState<WorkbookMode>(defaultMode);
  const [answerKey, setAnswerKey] = useState(false);

  // 다이얼로그가 열릴 때마다 기본 모드로 리셋
  useEffect(() => {
    if (open) {
      setMode(defaultMode);
      setAnswerKey(false);
    }
  }, [open, defaultMode]);

  // 예상 페이지 추정
  const estimatedPages = (() => {
    const n = completedCodes.length + pendingCodes.length;
    switch (mode) {
      case "syntax_unit":
        return Math.max(1, Math.ceil(n / 2)) + 1; // 통합본 (앞=본문, 뒤=구조)
      case "syntax_passage":
        return completedCodes.length * 2; // 지문당 2장 (본문+구조)
      case "word_unit":
        return 1; // 통합 시험지 1장
      case "word_passage":
        return n; // 지문당 1장
    }
  })();
  const printableCount = mode === "syntax_passage" ? completedCodes.length : completedCodes.length + pendingCodes.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="size-5 text-primary" />
            워크북 인쇄
          </DialogTitle>
          <DialogDescription>
            인쇄할 워크북 종류를 선택하세요. 단어와 구문은 같은 PDF에 섞이지 않으며,
            둘 다 필요하면 두 번 인쇄합니다.
          </DialogDescription>
        </DialogHeader>

        {/* 메타 */}
        <div className="rounded-md border bg-muted/30 p-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
          <div className="flex gap-2">
            <span className="text-muted-foreground w-16 shrink-0">학생</span>
            <span className="font-semibold">
              {studentName}{" "}
              <span className="text-xs font-normal text-muted-foreground">
                ({studentNo})
              </span>
            </span>
          </div>
          <div className="flex gap-2">
            <span className="text-muted-foreground w-16 shrink-0">유닛</span>
            <span className="font-medium truncate" title={unitTitle}>
              {unitTitle}
            </span>
          </div>
          <div className="flex gap-2 col-span-2">
            <span className="text-muted-foreground w-16 shrink-0">코드</span>
            <span className="text-xs text-muted-foreground">{unitCode}</span>
          </div>
        </div>

        {/* 4종 워크북 카드 */}
        <div>
          <div className="text-xs font-semibold text-muted-foreground mb-2">
            워크북 종류 선택
          </div>
          <div className="grid grid-cols-2 gap-2">
            {MODE_CARDS.map((card) => {
              const selected = mode === card.key;
              const Icon = card.Icon;
              return (
                <button
                  key={card.key}
                  type="button"
                  onClick={() => setMode(card.key)}
                  disabled={printing}
                  className={cn(
                    "text-left rounded-md border p-3 transition-all",
                    "hover:border-primary/60 hover:bg-primary/5",
                    selected
                      ? "border-primary bg-primary/10 ring-2 ring-primary/30"
                      : "border-border bg-card",
                    printing && "opacity-50 cursor-not-allowed",
                  )}
                >
                  <div className="flex items-start gap-2">
                    <div
                      className={cn(
                        "rounded-md p-1.5 shrink-0",
                        selected
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      <Icon className="size-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Badge
                          variant="outline"
                          className="text-[10px] h-4 px-1.5"
                        >
                          {card.category}
                        </Badge>
                        <span className="text-sm font-semibold">
                          {WORKBOOK_MODE_LABEL[card.key].split(" · ")[1]}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 leading-snug">
                        {WORKBOOK_MODE_DESC[card.key]}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 지문 목록 */}
        <div>
          <div className="flex items-baseline justify-between mb-2">
            <div className="text-xs font-semibold text-muted-foreground">
              포함 지문
            </div>
            <div className="text-xs text-muted-foreground">
              유닛 전체 <b className="text-foreground">{completedCodes.length + pendingCodes.length}</b> · 완료 {completedCodes.length} ·
              미완료 <span className="text-foreground">{pendingCodes.length}</span>
            </div>
          </div>
          <ScrollArea className="h-32 rounded-md border">
            <div className="p-2 space-y-1">
              {completedCodes.length === 0 && pendingCodes.length === 0 && (
                <div className="text-xs text-muted-foreground p-3 text-center">
                  지문이 없습니다.
                </div>
              )}
              {completedCodes.map((c, i) => (
                <div
                  key={`c-${c}`}
                  className="flex items-center gap-2 text-xs px-2 py-1.5 rounded bg-primary/5"
                >
                  <span className="text-muted-foreground w-5 text-right">
                    {i + 1}.
                  </span>
                  <Check className="size-3 text-primary shrink-0" />
                  <span className="font-mono truncate flex-1">{c}</span>
                </div>
              ))}
              {pendingCodes.map((c) => (
                <div
                  key={`p-${c}`}
                  className="flex items-center gap-2 text-xs px-2 py-1.5 rounded text-muted-foreground"
                >
                  <span className="w-5" />
                  <XIcon className="size-3 shrink-0" />
                  <span className="font-mono truncate flex-1 line-through">
                    {c}
                  </span>
                  <Badge variant="outline" className="text-[10px] h-4">
                    미완료
                  </Badge>
                </div>
              ))}
            </div>
          </ScrollArea>
          <div className="mt-1.5 text-[11px] text-muted-foreground">
            * 유닛 통합 워크북은 미완료 지문까지 포함해 유닛 전체를 인쇄합니다. 문장별 구문만 완료 지문 기준입니다.
          </div>
        </div>

        {/* 답지 토글 — 구문 · 유닛 통합에서만 의미 있음 */}
        {mode === "syntax_unit" && (
          <label
            className={cn(
              "flex items-start gap-2.5 rounded-md border p-3 cursor-pointer transition-colors",
              answerKey
                ? "border-destructive bg-destructive/5"
                : "border-border bg-card hover:bg-muted/40",
            )}
          >
            <input
              type="checkbox"
              checked={answerKey}
              onChange={(e) => setAnswerKey(e.target.checked)}
              disabled={printing}
              className="mt-0.5 size-4 accent-destructive"
            />
            <div className="flex-1">
              <div className="text-sm font-semibold flex items-center gap-1.5">
                답지(정답) 모드
                {answerKey && (
                  <Badge className="bg-destructive text-destructive-foreground text-[10px] h-4 px-1.5">
                    ANSWER KEY
                  </Badge>
                )}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5 leading-snug">
                앞면 ②는 모범 한글해석, 뒷면 ③영작 · ⑤재영작 칸을 정답으로 채워 인쇄합니다.
                구조도/지스트/어법·어휘는 DB에 정답이 없어 빈칸으로 유지됩니다.
              </div>
            </div>
          </label>
        )}

        {/* 요약 */}
        <div className="rounded-md bg-primary/5 border border-primary/20 px-3 py-2 flex items-center justify-between text-sm">
          <div>
            <span className="font-semibold">{WORKBOOK_MODE_LABEL[mode]}</span>
            <span className="text-muted-foreground"> · </span>
            <span>{printableCount}개 지문</span>
            {mode === "syntax_unit" && answerKey && (
              <span className="ml-2 text-destructive font-bold">· 답지</span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            예상 페이지 ≈ <b className="text-foreground">{estimatedPages}</b>p
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={printing}
          >
            취소
          </Button>
          <Button
            onClick={() => onConfirmPrint(mode, { answerKey: mode === "syntax_unit" && answerKey })}
            disabled={printing || printableCount === 0}
          >
            {printing ? (
              <Loader2 className="size-4 mr-1.5 animate-spin" />
            ) : (
              <Printer className="size-4 mr-1.5" />
            )}
            {printing ? "인쇄 준비 중…" : "인쇄 시작"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

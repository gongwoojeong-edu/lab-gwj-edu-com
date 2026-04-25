// ============================================================
// UnitWorkbookPreviewDialog — 유닛 워크북 인쇄 전 미리보기 모달
//
// 인쇄 버튼을 누르기 전에:
//  · 어떤 학생/유닛인지
//  · 워크북 모드 (유닛만 / 유닛+문장)
//  · 어떤 섹션이 포함될지 (분석 채점본 / 단어 시험지 / 한글해석 HO)
//  · 어떤 지문이 포함/제외 되는지 (완료/미완료)
// 를 한눈에 확인하고 [인쇄 시작] 으로 진행한다.
// ============================================================
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
  FileCheck,
  ListChecks,
  Languages,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type WorkbookMode = "unit_only" | "both";

export interface UnitWorkbookPreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentName: string;
  studentNo: string;
  unitTitle: string;
  unitCode: string;
  mode: WorkbookMode;
  completedCodes: string[];
  pendingCodes: string[];
  printing: boolean;
  onConfirmPrint: () => void;
}

interface SectionRow {
  key: string;
  icon: typeof FileCheck;
  title: string;
  desc: string;
  included: boolean;
}

export const UnitWorkbookPreviewDialog = ({
  open,
  onOpenChange,
  studentName,
  studentNo,
  unitTitle,
  unitCode,
  mode,
  completedCodes,
  pendingCodes,
  printing,
  onConfirmPrint,
}: UnitWorkbookPreviewProps) => {
  const isUnitOnly = mode === "unit_only";

  const sections: SectionRow[] = [
    {
      key: "analysis",
      icon: FileCheck,
      title: "분석 채점본",
      desc: "학생 분석 결과 + 채점 표시",
      included: true,
    },
    {
      key: "word",
      icon: ListChecks,
      title: "단어 시험지",
      desc: "오답 위주 (없으면 전체 추출 단어)",
      included: !isUnitOnly,
    },
    {
      key: "handout",
      icon: Languages,
      title: "한글해석 HO",
      desc: "학생 제출 한글해석 + 영문 본문",
      included: true,
    },
  ];

  const includedCount = sections.filter((s) => s.included).length;
  const estimatedPages =
    1 /* 표지 */ + completedCodes.length * includedCount;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="size-5 text-primary" />
            유닛 워크북 인쇄 미리보기
          </DialogTitle>
          <DialogDescription>
            인쇄 시작 전에 포함될 섹션과 지문을 확인하세요.
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
          <div className="flex gap-2 col-span-2 items-center">
            <span className="text-muted-foreground w-16 shrink-0">모드</span>
            <Badge
              variant={isUnitOnly ? "secondary" : "default"}
              className="text-xs"
            >
              {isUnitOnly ? "유닛만 (분석 + 해석)" : "유닛 + 문장 (전체)"}
            </Badge>
            {isUnitOnly && (
              <span className="text-xs text-muted-foreground">
                · 단어 시험지 제외
              </span>
            )}
          </div>
        </div>

        {/* 포함 섹션 */}
        <div>
          <div className="text-xs font-semibold text-muted-foreground mb-2">
            지문당 포함 섹션
          </div>
          <div className="space-y-1.5">
            {sections.map((s) => {
              const Icon = s.icon;
              return (
                <div
                  key={s.key}
                  className={cn(
                    "flex items-start gap-3 rounded-md border p-2.5 transition-colors",
                    s.included
                      ? "bg-card"
                      : "bg-muted/40 opacity-60",
                  )}
                >
                  <div
                    className={cn(
                      "rounded-md p-1.5",
                      s.included
                        ? "bg-primary/10 text-primary"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    <Icon className="size-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "text-sm font-medium",
                          !s.included && "line-through",
                        )}
                      >
                        {s.title}
                      </span>
                      {s.included ? (
                        <Badge
                          variant="outline"
                          className="text-[10px] h-4 border-primary/40 text-primary"
                        >
                          <Check className="size-2.5 mr-0.5" /> 포함
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="text-[10px] h-4 text-muted-foreground"
                        >
                          <XIcon className="size-2.5 mr-0.5" /> 제외
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {s.desc}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 지문 목록 */}
        <div>
          <div className="flex items-baseline justify-between mb-2">
            <div className="text-xs font-semibold text-muted-foreground">
              수록 지문
            </div>
            <div className="text-xs text-muted-foreground">
              완료 <b className="text-foreground">{completedCodes.length}</b> ·
              미완료 <span className="text-foreground">{pendingCodes.length}</span>
            </div>
          </div>
          <ScrollArea className="h-44 rounded-md border">
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
                  <Badge
                    variant="outline"
                    className="text-[10px] h-4 border-primary/40 text-primary"
                  >
                    포함
                  </Badge>
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
            * 포함 기준: 단어시험 통과 + 한글해석 제출 + 분석 통과 — 셋 모두 완료된
            지문만 인쇄됩니다.
          </div>
        </div>

        {/* 요약 */}
        <div className="rounded-md bg-primary/5 border border-primary/20 px-3 py-2 flex items-center justify-between text-sm">
          <div>
            <span className="font-semibold">
              {completedCodes.length}개 지문
            </span>
            <span className="text-muted-foreground"> · </span>
            <span>지문당 {includedCount}개 섹션</span>
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
            onClick={onConfirmPrint}
            disabled={printing || completedCodes.length === 0}
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

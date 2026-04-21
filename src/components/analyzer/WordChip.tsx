import { cn } from "@/lib/utils";

export type ElementType = "S" | "V" | "O" | "C" | "M";

export type ChipState = "locked" | "active" | "selected" | "completed";

interface WordChipProps {
  word: string;
  /** 정답 확정 후에만 표시되는 한국어 라벨 */
  koreanLabel?: string;
  /** 정답 확정 후에만 표시되는 element 배지 */
  element?: ElementType;
  state: ChipState;
  /** 드래그로 선택된 청크의 일부 — 연한 보라 배경 */
  inDragRange?: boolean;
  /** 분석 불가 토큰(구두점 등) — 모든 인터랙션 무시 */
  disabled?: boolean;
  onMouseDown?: (e: React.MouseEvent) => void;
  onMouseEnter?: (e: React.MouseEvent) => void;
  onMouseUp?: (e: React.MouseEvent) => void;
  onClick?: () => void;
}

const elementBadgeClass: Record<ElementType, string> = {
  S: "badge-s",
  V: "badge-v",
  O: "badge-o",
  C: "badge-c",
  M: "badge-m",
};

export const WordChip = ({
  word,
  koreanLabel,
  element,
  state,
  inDragRange,
  disabled,
  onMouseDown,
  onMouseEnter,
  onMouseUp,
  onClick,
}: WordChipProps) => {
  const completed = state === "completed";
  const selected = state === "selected";
  const highlighted = selected || inDragRange;

  return (
    <span
      role={disabled ? undefined : "button"}
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled || undefined}
      onMouseDown={disabled ? undefined : onMouseDown}
      onMouseEnter={disabled ? undefined : onMouseEnter}
      onMouseUp={disabled ? undefined : onMouseUp}
      onClick={disabled ? undefined : onClick}
      onKeyDown={
        disabled
          ? undefined
          : (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
      }
      className={cn(
        "group relative inline-flex flex-col items-center focus:outline-none leading-none select-none",
        disabled ? "cursor-default" : "cursor-pointer",
      )}
      aria-pressed={disabled ? undefined : selected}
    >
      {completed && koreanLabel && (
        <span className="absolute -top-3.5 text-[9px] font-semibold font-kr text-primary whitespace-nowrap tracking-tight leading-none pointer-events-none">
          {koreanLabel}
        </span>
      )}

      <span
        className={cn(
          "px-1 py-0.5 rounded-sm text-[16px] font-medium tracking-tight transition-colors duration-150 leading-tight text-foreground",
          // 항상 진하게 보이는 본문 텍스트 — opacity 100 유지
          highlighted && "bg-primary/15",
          completed && !highlighted && "bg-primary/15 border-b border-primary/30",
        )}
      >
        {word}
      </span>

      {completed && element && (
        <span
          className={cn(
            "absolute -bottom-3 px-1 py-0 rounded text-[9px] font-bold leading-none tracking-tight pointer-events-none",
            elementBadgeClass[element],
          )}
        >
          {element}
        </span>
      )}
    </span>
  );
};

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
  onClick?: () => void;
}

const elementBadgeClass: Record<ElementType, string> = {
  S: "badge-s",
  V: "badge-v",
  O: "badge-o",
  C: "badge-c",
  M: "badge-m",
};

export const WordChip = ({ word, koreanLabel, element, state, onClick }: WordChipProps) => {
  const interactive = state !== "locked";
  const completed = state === "completed";
  const selected = state === "selected";

  return (
    <button
      type="button"
      onClick={interactive ? onClick : undefined}
      disabled={!interactive}
      className="group relative inline-flex flex-col items-center focus:outline-none disabled:cursor-not-allowed leading-none"
      aria-pressed={selected}
    >
      {completed && koreanLabel && (
        <span className="absolute -top-3.5 text-[9px] font-semibold font-kr text-primary whitespace-nowrap tracking-tight leading-none">
          {koreanLabel}
        </span>
      )}

      <span
        className={cn(
          "px-1.5 py-0.5 rounded-md text-[15px] font-semibold tracking-tight transition-all duration-200 leading-tight",
          selected &&
            "word-chip-active text-primary-foreground ring-2 ring-primary/20",
          completed &&
            !selected &&
            "bg-primary/10 text-primary ring-1 ring-primary/30",
          state === "active" &&
            "bg-card shadow-sm ring-1 ring-border hover:ring-primary/40 text-foreground",
          state === "locked" &&
            "bg-muted/40 text-muted-foreground/50 ring-1 ring-transparent"
        )}
      >
        {word}
      </span>

      {completed && element && (
        <span
          className={cn(
            "absolute -bottom-3 px-1 py-0 rounded text-[9px] font-bold leading-none tracking-tight",
            elementBadgeClass[element],
          )}
        >
          {element}
        </span>
      )}
    </button>
  );
};

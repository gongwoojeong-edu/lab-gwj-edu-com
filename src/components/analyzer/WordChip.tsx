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
      className="group relative flex flex-col items-center focus:outline-none disabled:cursor-not-allowed"
      aria-pressed={selected}
    >
      {completed && koreanLabel && (
        <span className="absolute -top-7 text-[11px] font-bold font-kr text-primary whitespace-nowrap">
          {koreanLabel}
        </span>
      )}

      <span
        className={cn(
          "px-4 py-2.5 rounded-2xl text-xl font-semibold transition-all duration-200",
          selected &&
            "word-chip-active text-primary-foreground scale-105 ring-4 ring-primary/15",
          completed &&
            !selected &&
            "bg-primary/10 text-primary ring-1 ring-primary/30",
          state === "active" &&
            "bg-card shadow-sm ring-1 ring-border hover:scale-105 hover:ring-primary/40 text-foreground",
          state === "locked" &&
            "bg-muted/40 text-muted-foreground/50 ring-1 ring-transparent"
        )}
      >
        {word}
      </span>

      {completed && element && (
        <span className={cn("badge-element absolute -bottom-6", elementBadgeClass[element])}>
          {element}
        </span>
      )}
    </button>
  );
};

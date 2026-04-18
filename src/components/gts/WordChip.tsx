import { cn } from "@/lib/utils";

export type ElementType = "S" | "V" | "O" | "C" | "M";

interface WordChipProps {
  word: string;
  koreanLabel: string;
  element: ElementType;
  active?: boolean;
  onClick?: () => void;
}

const elementBadgeClass: Record<ElementType, string> = {
  S: "badge-s",
  V: "badge-v",
  O: "badge-o",
  C: "badge-c",
  M: "badge-m",
};

export const WordChip = ({ word, koreanLabel, element, active, onClick }: WordChipProps) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex flex-col items-center focus:outline-none"
      aria-pressed={active}
    >
      <span
        className={cn(
          "absolute -top-7 text-[11px] font-bold font-kr transition-colors whitespace-nowrap",
          active ? "text-primary" : "text-muted-foreground group-hover:text-primary"
        )}
      >
        {koreanLabel}
      </span>

      <span
        className={cn(
          "px-4 py-2.5 rounded-2xl text-xl font-semibold transition-all duration-200",
          active
            ? "word-chip-active text-primary-foreground scale-105 ring-4 ring-primary/15"
            : "bg-card shadow-sm ring-1 ring-border hover:scale-105 hover:ring-primary/30 text-foreground"
        )}
      >
        {word}
      </span>

      <span className={cn("badge-element absolute -bottom-6", elementBadgeClass[element])}>
        {element}
      </span>
    </button>
  );
};

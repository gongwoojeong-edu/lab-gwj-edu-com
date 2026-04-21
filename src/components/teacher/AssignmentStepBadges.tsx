import { cn } from "@/lib/utils";

interface AssignmentStepBadgesProps {
  includePre?: boolean;
  includeAnalysis: boolean;
  includeTranslation: boolean;
  includeWordtest: boolean;
  className?: string;
  size?: "sm" | "xs";
}

const STEPS: Array<{ key: "pre" | "analysis" | "translation" | "wordtest"; label: string }> = [
  { key: "pre", label: "단어학습" },
  { key: "analysis", label: "구문분석" },
  { key: "translation", label: "한글해석" },
  { key: "wordtest", label: "단어시험" },
];

export const AssignmentStepBadges = ({
  includePre = true,
  includeAnalysis,
  includeTranslation,
  includeWordtest,
  className,
  size = "sm",
}: AssignmentStepBadgesProps) => {
  const map = {
    pre: includePre,
    analysis: includeAnalysis,
    translation: includeTranslation,
    wordtest: includeWordtest,
  };
  const sizeCls = size === "xs" ? "text-[10px] px-1.5 py-0" : "text-[11px] px-2 py-0.5";
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1", className)}>
      {STEPS.map((s) => {
        const on = map[s.key];
        return (
          <span
            key={s.key}
            className={cn(
              "rounded font-bold border",
              sizeCls,
              on
                ? "bg-primary/15 text-primary border-primary/30"
                : "bg-muted/50 text-muted-foreground/60 border-transparent line-through",
            )}
          >
            {s.label}
          </span>
        );
      })}
    </span>
  );
};

export default AssignmentStepBadges;

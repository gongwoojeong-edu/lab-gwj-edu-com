import { Check, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

export type LearningStep = "pre" | "analysis" | "translation" | "wordtest" | "pass";

interface Props {
  current: LearningStep;
  preDone?: boolean;
  analysisDone: boolean;
  translationDone: boolean;
  wordTestDone: boolean;
  onJump?: (step: LearningStep) => void;
}

const STEPS: { key: LearningStep; label: string }[] = [
  { key: "pre", label: "1. 단어 학습" },
  { key: "wordtest", label: "2. 단어 테스트" },
  { key: "analysis", label: "3. 구문 분석" },
  { key: "translation", label: "4. 한글 해석" },
];

export const StepProgressBar = ({
  current,
  preDone = false,
  analysisDone,
  translationDone,
  wordTestDone,
  onJump,
}: Props) => {
  const passed = preDone && wordTestDone && analysisDone && translationDone;
  const isDone = (k: LearningStep) =>
    k === "pre"
      ? preDone
      : k === "wordtest"
        ? wordTestDone
        : k === "analysis"
          ? analysisDone
          : translationDone;
  const isLocked = (k: LearningStep) =>
    k === "wordtest"
      ? !preDone
      : k === "analysis"
        ? !preDone || !wordTestDone
        : k === "translation"
          ? !analysisDone
          : false;

  return (
    <div className="flex items-center gap-2 text-sm flex-wrap">
      {STEPS.map((s, i) => {
        const done = isDone(s.key);
        const locked = isLocked(s.key);
        const active = current === s.key;
        return (
          <div key={s.key} className="flex items-center gap-2">
            <button
              type="button"
              disabled={locked}
              onClick={() => onJump?.(s.key)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-colors",
                done && "bg-primary/10 border-primary/40 text-primary",
                !done && active && "bg-accent border-accent-foreground/30",
                !done && !active && !locked && "border-border hover:bg-accent/40",
                locked && "opacity-40 cursor-not-allowed border-dashed",
              )}
            >
              {done ? <Check className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
              <span className="font-medium">{s.label}</span>
            </button>
            {i < STEPS.length - 1 && <span className="text-muted-foreground">→</span>}
          </div>
        );
      })}
      {passed && (
        <span className="ml-2 px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-xs font-semibold">
          ✅ Pass
        </span>
      )}
    </div>
  );
};

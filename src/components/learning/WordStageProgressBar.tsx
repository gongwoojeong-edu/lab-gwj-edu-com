import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type StageKey = "syllable" | "speak" | "spell" | "meaning";

interface Props {
  totalWords: number;
  currentStage: StageKey;
  currentWord: string;
  wordIndex: number; // 0-based within current stage round
  passedPerStage: Record<StageKey, number>;
}

const STAGE_LABELS: Record<StageKey, string> = {
  syllable: "① 음절각인",
  speak: "② 발화",
  spell: "③ 스펠링",
  meaning: "④ 의미인출",
};

const STAGE_ORDER: StageKey[] = ["syllable", "speak", "spell", "meaning"];

const Bar = ({
  label,
  passed,
  total,
  state,
}: {
  label: string;
  passed: number;
  total: number;
  state: "done" | "active" | "todo";
}) => {
  const pct = total ? (passed / total) * 100 : 0;
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <div className="flex items-center gap-1.5 w-28 shrink-0">
        {state === "active" && (
          <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" aria-hidden />
        )}
        <span
          className={cn(
            "text-sm font-semibold tracking-tight truncate",
            state === "active" ? "text-primary" : state === "done" ? "text-emerald-600" : "text-foreground/60",
          )}
        >
          {label}
        </span>
      </div>
      <div className="relative flex-1 h-4 rounded-full bg-muted overflow-hidden">
        <div
          className={cn(
            "absolute inset-y-0 left-0 rounded-full transition-all duration-300",
            state === "done" ? "bg-emerald-500" : "bg-primary",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div
        className={cn(
          "w-16 text-right text-sm font-mono font-semibold shrink-0 flex items-center justify-end gap-0.5",
          state === "done" ? "text-emerald-600" : "text-muted-foreground",
        )}
      >
        {passed}/{total}
        {state === "done" && <Check className="w-3.5 h-3.5" />}
      </div>
    </div>
  );
};

export const WordStageProgressBar = ({
  totalWords,
  currentStage,
  currentWord,
  wordIndex,
  passedPerStage,
}: Props) => {
  const safePassed: Record<StageKey, number> = {
    syllable: passedPerStage?.syllable ?? 0,
    speak: passedPerStage?.speak ?? 0,
    spell: passedPerStage?.spell ?? 0,
    meaning: passedPerStage?.meaning ?? 0,
  };
  const currentStageIdx = STAGE_ORDER.indexOf(currentStage);
  const overall = totalWords
    ? (STAGE_ORDER.reduce((sum, k) => sum + safePassed[k], 0) / (totalWords * 4)) * 100
    : 0;

  return (
    <div className="fixed bottom-0 inset-x-0 z-30 border-t border-border/60 bg-background/95 backdrop-blur-sm">
      <div className="max-w-3xl mx-auto px-4 py-4 space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold text-foreground">
            {currentStageIdx + 1}단계 {STAGE_LABELS[currentStage].replace(/^[①②③④]\s*/, "")} · 단어 {Math.min(wordIndex + 1, totalWords)} / {totalWords}
          </span>
          <span className="font-mono font-bold text-primary truncate ml-2">
            {currentWord}
          </span>
        </div>

        <div className="flex flex-col gap-2">
          {STAGE_ORDER.map((k, i) => {
            const state: "done" | "active" | "todo" =
              i < currentStageIdx ? "done" : i === currentStageIdx ? "active" : "todo";
            return (
              <Bar
                key={k}
                label={STAGE_LABELS[k]}
                passed={passedPerStage[k]}
                total={totalWords}
                state={state}
              />
            );
          })}
        </div>

        <div className="flex items-center gap-2.5 pt-1">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground w-28 shrink-0">
            전체 진척
          </span>
          <div className="relative flex-1 h-2.5 rounded-full bg-muted overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary to-emerald-500 transition-all duration-300"
              style={{ width: `${overall}%` }}
            />
          </div>
          <span className="w-16 text-right text-xs font-mono font-semibold text-muted-foreground shrink-0">
            {Math.round(overall)}%
          </span>
        </div>
      </div>
    </div>
  );
};

export const PASS_THRESHOLD = 90;
export type StageScores = Record<StageKey, number>;

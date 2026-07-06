import { Check, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MemStep } from "@/lib/memorizationProgress";

const STEPS: { key: MemStep; label: string }[] = [
  { key: "listen", label: "A. 듣기·딕테이션" },
  { key: "scramble", label: "B. 어순배열" },
  { key: "cloze", label: "C. 빈칸채우기" },
];

interface Props {
  current: MemStep;
  listenDone: boolean;
  scrambleDone: boolean;
  clozeDone: boolean;
}

export const MemStepProgressBar = ({
  current,
  listenDone,
  scrambleDone,
  clozeDone,
}: Props) => {
  const isDone = (k: MemStep) =>
    k === "listen" ? listenDone : k === "scramble" ? scrambleDone : clozeDone;
  const passed = listenDone && scrambleDone && clozeDone;

  return (
    <div className="flex items-center gap-2 text-sm flex-wrap">
      {STEPS.map((s, i) => {
        const done = isDone(s.key);
        const active = current === s.key;
        return (
          <div key={s.key} className="flex items-center gap-2">
            <span
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-colors",
                done && "bg-violet-500/10 border-violet-500/40 text-violet-700 dark:text-violet-300",
                !done && active && "bg-accent border-accent-foreground/30",
                !done && !active && "border-border text-muted-foreground",
              )}
            >
              {done ? <Check className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
              <span className="font-medium text-xs">{s.label}</span>
            </span>
            {i < STEPS.length - 1 && <span className="text-muted-foreground">→</span>}
          </div>
        );
      })}
      {passed && (
        <span className="ml-2 px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-xs font-semibold">
          암기 Pass
        </span>
      )}
    </div>
  );
};

import { Check, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MemStep } from "@/lib/memorizationProgress";

const ALL_STEPS: { key: MemStep; label: string }[] = [
  { key: "listen", label: "A. 듣기" },
  { key: "scramble", label: "B. 어순" },
  { key: "cloze", label: "C. 빈칸" },
  { key: "dictation", label: "D. 받아쓰기" },
  { key: "interpret", label: "G. 동시통역" },
  { key: "translate", label: "H. 번역" },
  { key: "speech", label: "E. 발화" },
  { key: "record", label: "F. 녹음" },
];

interface Props {
  current: MemStep;
  listenDone: boolean;
  scrambleDone: boolean;
  clozeDone: boolean;
  dictationDone: boolean;
  interpretDone: boolean;
  translateDone: boolean;
  speechDone: boolean;
  recordDone: boolean;
  requireRecord: boolean;
  includeInterpret: boolean;
  includeTranslate: boolean;
}

export const MemStepProgressBar = ({
  current,
  listenDone,
  scrambleDone,
  clozeDone,
  dictationDone,
  interpretDone,
  translateDone,
  speechDone,
  recordDone,
  requireRecord,
  includeInterpret,
  includeTranslate,
}: Props) => {
  const steps = ALL_STEPS.filter((s) => {
    if (s.key === "record") return requireRecord;
    if (s.key === "interpret") return includeInterpret;
    if (s.key === "translate") return includeTranslate;
    return true;
  });
  const isDone = (k: MemStep) => {
    if (k === "listen") return listenDone;
    if (k === "scramble") return scrambleDone;
    if (k === "cloze") return clozeDone;
    if (k === "dictation") return dictationDone;
    if (k === "interpret") return interpretDone;
    if (k === "translate") return translateDone;
    if (k === "speech") return speechDone;
    return recordDone;
  };
  const passed = steps.every((s) => isDone(s.key));

  return (
    <div className="flex items-center gap-1.5 text-sm flex-wrap">
      {steps.map((s, i) => {
        const done = isDone(s.key);
        const active = current === s.key;
        return (
          <div key={s.key} className="flex items-center gap-1.5">
            <span
              className={cn(
                "flex items-center gap-1 px-2 py-1 rounded-full border text-[10px]",
                done && "bg-violet-500/10 border-violet-500/40 text-violet-700 dark:text-violet-300",
                !done && active && "bg-accent border-accent-foreground/30",
                !done && !active && "border-border text-muted-foreground",
              )}
            >
              {done ? <Check className="w-3 h-3" /> : <Circle className="w-3 h-3" />}
              <span className="font-medium">{s.label}</span>
            </span>
            {i < steps.length - 1 && <span className="text-muted-foreground text-[10px]">→</span>}
          </div>
        );
      })}
      {passed && (
        <span className="ml-1 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[10px] font-semibold">
          Pass
        </span>
      )}
    </div>
  );
};

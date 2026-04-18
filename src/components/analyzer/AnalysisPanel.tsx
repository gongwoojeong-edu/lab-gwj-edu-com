import { cn } from "@/lib/utils";
import { Check, X, Lock, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { WordAnswer, ElementAnswer, POSAnswer, FormAnswer } from "@/data/sentences";

export type StepStatus = "idle" | "correct" | "wrong";

interface AnalysisPanelProps {
  selectedWord: string | null;
  answer: WordAnswer | null;

  element: ElementAnswer | null;
  partOfSpeech: POSAnswer | null;
  form: FormAnswer | null;

  elementStatus: StepStatus;
  posStatus: StepStatus;
  formStatus: StepStatus;

  onElementChange: (e: ElementAnswer) => void;
  onPartOfSpeechChange: (p: POSAnswer) => void;
  onFormChange: (f: FormAnswer) => void;
}

const ELEMENTS: { key: ElementAnswer; label: string; abbr: string }[] = [
  { key: "S", label: "Subject", abbr: "S" },
  { key: "V", label: "Verb", abbr: "V" },
  { key: "O", label: "Object", abbr: "O" },
  { key: "C", label: "Complement", abbr: "C" },
  { key: "M", label: "Modifier", abbr: "M" },
];

const POS_LIST: POSAnswer[] = ["Noun", "Adjective", "Adverb", "Verb", "Etc"];

const FORM_BY_POS: Record<POSAnswer, { key: FormAnswer; desc: string }[]> = {
  Noun: [
    { key: "N", desc: "Noun / Noun phrase" },
    { key: "to v", desc: "To-infinitive" },
    { key: "v-ing", desc: "Gerund" },
    { key: "[SV] clause", desc: "Noun clause" },
  ],
  Adjective: [
    { key: "N", desc: "Adjective" },
    { key: "to v", desc: "To-infinitive" },
    { key: "v-ing", desc: "Participle (v-ing/p.p)" },
    { key: "[SV] clause", desc: "Adjective clause" },
    { key: "Preposition+N", desc: "Prep. phrase" },
  ],
  Adverb: [
    { key: "N", desc: "Adverb" },
    { key: "to v", desc: "To-infinitive" },
    { key: "v-ing", desc: "Participle" },
    { key: "[SV] clause", desc: "Adverb clause" },
    { key: "Preposition+N", desc: "Prep. phrase" },
  ],
  Verb: [
    { key: "v-ed", desc: "V-ed (Past)" },
    { key: "to v", desc: "Infinitive form" },
    { key: "v-ing", desc: "Progressive" },
  ],
  Etc: [{ key: "N", desc: "Comparison / Parallelism / Inversion / Omission" }],
};

const elementChipColor: Record<ElementAnswer, string> = {
  S: "data-[active=true]:bg-element-s-bg data-[active=true]:text-element-s data-[active=true]:border-element-s/40",
  V: "data-[active=true]:bg-element-v-bg data-[active=true]:text-element-v data-[active=true]:border-element-v/40",
  O: "data-[active=true]:bg-element-o-bg data-[active=true]:text-element-o data-[active=true]:border-element-o/40",
  C: "data-[active=true]:bg-element-c-bg data-[active=true]:text-element-c data-[active=true]:border-element-c/40",
  M: "data-[active=true]:bg-element-m-bg data-[active=true]:text-element-m data-[active=true]:border-element-m/40",
};

const StatusPill = ({ status, label }: { status: StepStatus; label: string }) => {
  if (status === "correct")
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-element-o uppercase tracking-wider">
        <Check className="size-3" /> {label}
      </span>
    );
  if (status === "wrong")
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-destructive uppercase tracking-wider">
        <X className="size-3" /> Try again
      </span>
    );
  return null;
};

export const AnalysisPanel = ({
  selectedWord,
  answer,
  element,
  partOfSpeech,
  form,
  elementStatus,
  posStatus,
  formStatus,
  onElementChange,
  onPartOfSpeechChange,
  onFormChange,
}: AnalysisPanelProps) => {
  if (!selectedWord || !answer) {
    return (
      <aside className="glass-panel rounded-xl px-3 py-1.5 flex items-center justify-center text-center h-11">
        <p className="text-[11px] text-muted-foreground font-kr">
          단어를 선택하면 분석 메뉴가 활성화됩니다.
        </p>
      </aside>
    );
  }

  const posUnlocked = elementStatus === "correct";
  const formUnlocked = posStatus === "correct";
  const formOptions = partOfSpeech ? FORM_BY_POS[partOfSpeech] : [];

  return (
    <aside className="glass-panel rounded-2xl px-4 py-3">
      <div className="flex items-center gap-3 flex-wrap justify-between">
        {/* Selected word */}
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-[10px] font-bold text-primary-glow uppercase tracking-widest">
            Selected
          </span>
          <span className="text-sm font-bold text-foreground truncate max-w-[220px]">
            "{selectedWord}"
          </span>
        </div>

        {/* Horizontal Element row */}
        <div className="flex items-center gap-1.5">
          {ELEMENTS.map(({ key, label, abbr }) => {
            const isSelected = element === key;
            const isCorrect = isSelected && elementStatus === "correct";
            const isWrong = isSelected && elementStatus === "wrong";
            const lockedOther = elementStatus === "correct" && !isSelected;

            const trigger = (
              <button
                type="button"
                data-active={isCorrect}
                onClick={() => {
                  if (lockedOther) return;
                  onElementChange(key);
                }}
                disabled={lockedOther}
                title={label}
                className={cn(
                  "inline-flex items-center gap-1 h-9 px-3 rounded-xl border text-xs font-bold transition-all",
                  "border-border bg-card text-foreground hover:border-primary/40 hover:bg-secondary",
                  elementChipColor[key],
                  isWrong && "border-destructive bg-destructive/10 text-destructive animate-pulse",
                  lockedOther && "opacity-30 cursor-not-allowed",
                )}
              >
                <span className="font-mono">{abbr}</span>
                {isCorrect && <ChevronDown className="size-3 opacity-70" />}
              </button>
            );

            // 정답 맞춘 element만 Popover로 Level 2/3 노출
            if (isCorrect) {
              return (
                <Popover key={key} defaultOpen>
                  <PopoverTrigger asChild>{trigger}</PopoverTrigger>
                  <PopoverContent
                    align="end"
                    sideOffset={8}
                    className="w-72 p-4 space-y-4"
                  >
                    {/* Level 2 */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                          Level 02 · Part of Speech
                        </p>
                        <StatusPill status={posStatus} label="OK" />
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {POS_LIST.map((p) => {
                          const sel = partOfSpeech === p;
                          const ok = sel && posStatus === "correct";
                          const ng = sel && posStatus === "wrong";
                          return (
                            <button
                              key={p}
                              type="button"
                              onClick={() => onPartOfSpeechChange(p)}
                              disabled={posStatus === "correct" && !sel}
                              className={cn(
                                "px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all disabled:opacity-30",
                                ok && "bg-element-o text-primary-foreground",
                                ng && "bg-destructive text-destructive-foreground animate-pulse",
                                !sel && "bg-secondary text-muted-foreground hover:bg-secondary/70 hover:text-foreground",
                              )}
                            >
                              {p}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Level 3 */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p
                          className={cn(
                            "text-[10px] font-bold uppercase tracking-widest flex items-center gap-1",
                            formUnlocked ? "text-muted-foreground" : "text-muted-foreground/40",
                          )}
                        >
                          {!formUnlocked && <Lock className="size-2.5" />}
                          Level 03 · Functional Form
                        </p>
                        <StatusPill status={formStatus} label="OK" />
                      </div>
                      {!formUnlocked ? (
                        <p className="text-[11px] text-muted-foreground/60 italic font-kr px-1">
                          Level 02 정답을 맞추면 열립니다.
                        </p>
                      ) : (
                        <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                          {formOptions.map(({ key: fkey, desc }) => {
                            const sel = form === fkey;
                            const ok = sel && formStatus === "correct";
                            const ng = sel && formStatus === "wrong";
                            return (
                              <button
                                key={fkey}
                                type="button"
                                onClick={() => onFormChange(fkey)}
                                disabled={formStatus === "correct" && !sel}
                                className={cn(
                                  "w-full p-2 rounded-lg border text-left transition-colors disabled:opacity-30",
                                  ok && "border-element-o bg-element-o-bg",
                                  ng && "border-destructive bg-destructive/10 animate-pulse",
                                  !sel && "border-border hover:border-primary/30 bg-card",
                                )}
                              >
                                <div className="flex items-center justify-between">
                                  <span
                                    className={cn(
                                      "text-[11px] font-bold font-mono",
                                      ok && "text-element-o",
                                      ng && "text-destructive",
                                      !sel && "text-foreground",
                                    )}
                                  >
                                    {fkey}
                                  </span>
                                </div>
                                <p className="text-[10px] text-muted-foreground leading-tight">
                                  {desc}
                                </p>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {formStatus === "correct" && (
                      <div className="rounded-xl bg-element-o-bg border border-element-o/30 p-2.5 text-center">
                        <p className="text-[10px] font-bold text-element-o uppercase tracking-widest mb-0.5">
                          Analysis Complete
                        </p>
                        <p className="text-xs font-bold text-foreground font-kr">
                          {answer.koreanLabel}
                        </p>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              );
            }

            return <div key={key}>{trigger}</div>;
          })}
        </div>

        {/* Element status hint (compact) */}
        <div className="ml-auto">
          <StatusPill status={elementStatus} label="Correct" />
        </div>
      </div>
    </aside>
  );
};

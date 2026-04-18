import { cn } from "@/lib/utils";
import { Check, X, Lock } from "lucide-react";
import type { WordAnswer, ElementAnswer, POSAnswer, FormAnswer } from "@/data/sentences";

export type PartOfSpeech = POSAnswer;
export type FormType = FormAnswer;

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

const ELEMENTS: { key: ElementAnswer; label: string }[] = [
  { key: "S", label: "Subject" },
  { key: "V", label: "Verb" },
  { key: "O", label: "Object" },
  { key: "C", label: "Complement" },
  { key: "M", label: "Modifier" },
];

const POS: POSAnswer[] = ["Noun", "Adjective", "Adverb", "Verb", "Etc"];

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

const StatusIcon = ({ status }: { status: StepStatus }) => {
  if (status === "correct")
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-element-o uppercase tracking-wider">
        <Check className="size-3" /> Correct
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
      <aside className="glass-panel rounded-3xl p-8 flex flex-col items-center justify-center text-center min-h-[400px]">
        <div className="size-16 rounded-2xl bg-secondary flex items-center justify-center mb-4">
          <span className="text-2xl text-primary font-bold">?</span>
        </div>
        <h3 className="text-lg font-bold tracking-tight mb-2">단어를 선택하세요</h3>
        <p className="text-sm text-muted-foreground font-kr leading-relaxed">
          활성화된 단어를 클릭하면<br />3-Level 구조 분석이 시작됩니다.
        </p>
      </aside>
    );
  }

  const posUnlocked = elementStatus === "correct";
  const formUnlocked = posStatus === "correct";
  const formOptions = partOfSpeech ? FORM_BY_POS[partOfSpeech] : [];

  return (
    <aside className="glass-panel rounded-3xl p-6 flex flex-col gap-7">
      <div className="space-y-1">
        <p className="text-xs font-medium text-primary-glow tracking-wide uppercase">
          Selected
        </p>
        <h3 className="text-2xl font-bold tracking-tight text-foreground">
          "{selectedWord}"
        </h3>
      </div>

      {/* Level 1: Element */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
            Level 01 · Element
          </label>
          <StatusIcon status={elementStatus} />
        </div>
        <div className="grid grid-cols-5 gap-2">
          {ELEMENTS.map(({ key, label }) => {
            const isSelected = element === key;
            const isCorrect = isSelected && elementStatus === "correct";
            const isWrong = isSelected && elementStatus === "wrong";
            return (
              <button
                key={key}
                onClick={() => onElementChange(key)}
                disabled={elementStatus === "correct" && !isSelected}
                title={label}
                className={cn(
                  "h-14 rounded-2xl border-2 flex items-center justify-center transition-all disabled:opacity-30 disabled:cursor-not-allowed",
                  isCorrect && "border-element-o bg-element-o-bg",
                  isWrong && "border-destructive bg-destructive/10 animate-pulse",
                  !isSelected &&
                    "border-border bg-secondary/40 hover:border-primary/40 hover:bg-secondary"
                )}
              >
                <span
                  className={cn(
                    "text-xs font-black",
                    isCorrect && "text-element-o",
                    isWrong && "text-destructive",
                    !isSelected && "text-foreground"
                  )}
                >
                  {key}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Level 2: Part of Speech */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label
            className={cn(
              "text-[11px] font-bold uppercase tracking-widest flex items-center gap-1.5",
              posUnlocked ? "text-muted-foreground" : "text-muted-foreground/40"
            )}
          >
            {!posUnlocked && <Lock className="size-3" />}
            Level 02 · Part of Speech
          </label>
          <StatusIcon status={posStatus} />
        </div>
        {!posUnlocked ? (
          <p className="text-xs text-muted-foreground/60 italic px-1 font-kr">
            Level 01 정답을 먼저 맞춰주세요.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {POS.map((p) => {
              const isSelected = partOfSpeech === p;
              const isCorrect = isSelected && posStatus === "correct";
              const isWrong = isSelected && posStatus === "wrong";
              return (
                <button
                  key={p}
                  onClick={() => onPartOfSpeechChange(p)}
                  disabled={posStatus === "correct" && !isSelected}
                  className={cn(
                    "px-4 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed",
                    isCorrect && "bg-element-o text-primary-foreground",
                    isWrong && "bg-destructive text-destructive-foreground animate-pulse",
                    !isSelected &&
                      "bg-secondary text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
                  )}
                >
                  {p}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Level 3: Form */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label
            className={cn(
              "text-[11px] font-bold uppercase tracking-widest flex items-center gap-1.5",
              formUnlocked ? "text-muted-foreground" : "text-muted-foreground/40"
            )}
          >
            {!formUnlocked && <Lock className="size-3" />}
            Level 03 · Functional Form
          </label>
          <StatusIcon status={formStatus} />
        </div>
        {!formUnlocked ? (
          <p className="text-xs text-muted-foreground/60 italic px-1 font-kr">
            Level 02 정답을 먼저 맞춰주세요.
          </p>
        ) : (
          <div className="space-y-2">
            {formOptions.map(({ key, desc }) => {
              const isSelected = form === key;
              const isCorrect = isSelected && formStatus === "correct";
              const isWrong = isSelected && formStatus === "wrong";
              return (
                <button
                  key={key}
                  onClick={() => onFormChange(key)}
                  disabled={formStatus === "correct" && !isSelected}
                  className={cn(
                    "w-full p-3 rounded-xl border text-left transition-colors disabled:opacity-30 disabled:cursor-not-allowed",
                    isCorrect && "border-element-o bg-element-o-bg",
                    isWrong && "border-destructive bg-destructive/10 animate-pulse",
                    !isSelected && "border-border hover:border-primary/30 bg-card"
                  )}
                >
                  <div className="flex justify-between items-center mb-0.5">
                    <span
                      className={cn(
                        "text-xs font-bold font-mono",
                        isCorrect && "text-element-o",
                        isWrong && "text-destructive",
                        !isSelected && "text-foreground"
                      )}
                    >
                      {key}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{desc}</p>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {formStatus === "correct" && (
        <div className="rounded-2xl bg-element-o-bg border border-element-o/30 p-4 text-center">
          <p className="text-xs font-bold text-element-o uppercase tracking-widest mb-1">
            Analysis Complete
          </p>
          <p className="text-sm font-bold text-foreground font-kr">
            {answer.koreanLabel}
          </p>
          <p className="text-[11px] text-muted-foreground mt-1 font-kr">
            다음 활성 단어를 클릭하세요.
          </p>
        </div>
      )}
    </aside>
  );
};

import { cn } from "@/lib/utils";
import type { ElementType } from "./WordChip";

export type PartOfSpeech = "Noun" | "Adjective" | "Adverb" | "Verb" | "Etc";
export type FormType = "N" | "to v" | "v-ing" | "[SV] clause" | "Preposition+N" | "v-ed";

interface AnalysisPanelProps {
  selectedWord: string | null;
  element: ElementType | null;
  partOfSpeech: PartOfSpeech | null;
  form: FormType | null;
  onElementChange: (e: ElementType) => void;
  onPartOfSpeechChange: (p: PartOfSpeech) => void;
  onFormChange: (f: FormType) => void;
}

const ELEMENTS: { key: ElementType; label: string }[] = [
  { key: "S", label: "Subject" },
  { key: "V", label: "Verb" },
  { key: "O", label: "Object" },
  { key: "C", label: "Complement" },
  { key: "M", label: "Modifier" },
];

const POS: PartOfSpeech[] = ["Noun", "Adjective", "Adverb", "Verb", "Etc"];

const FORM_BY_POS: Record<PartOfSpeech, { key: FormType; desc: string }[]> = {
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
  Etc: [
    { key: "N", desc: "Comparison / Parallelism / Inversion / Omission" },
  ],
};

export const AnalysisPanel = ({
  selectedWord,
  element,
  partOfSpeech,
  form,
  onElementChange,
  onPartOfSpeechChange,
  onFormChange,
}: AnalysisPanelProps) => {
  if (!selectedWord) {
    return (
      <aside className="glass-panel rounded-3xl p-8 flex flex-col items-center justify-center text-center min-h-[400px]">
        <div className="size-16 rounded-2xl bg-secondary flex items-center justify-center mb-4">
          <span className="text-2xl text-primary font-bold">?</span>
        </div>
        <h3 className="text-lg font-bold tracking-tight mb-2">단어를 선택하세요</h3>
        <p className="text-sm text-muted-foreground font-kr leading-relaxed">
          문장에서 단어를 클릭하면<br />3-Level 구조 분석이 시작됩니다.
        </p>
      </aside>
    );
  }

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
        <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
          Level 01 · Element
        </label>
        <div className="grid grid-cols-5 gap-2">
          {ELEMENTS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => onElementChange(key)}
              title={label}
              className={cn(
                "h-14 rounded-2xl border-2 flex flex-col items-center justify-center transition-all",
                element === key
                  ? "border-primary bg-primary/5 shadow-sm scale-105"
                  : "border-border bg-secondary/40 opacity-60 hover:opacity-100 hover:border-primary/40"
              )}
            >
              <span
                className={cn(
                  "text-xs font-black",
                  element === key ? "text-primary" : "text-foreground"
                )}
              >
                {key}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Level 2: Part of Speech */}
      <div className="space-y-3">
        <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
          Level 02 · Part of Speech
        </label>
        <div className="flex flex-wrap gap-2">
          {POS.map((p) => (
            <button
              key={p}
              onClick={() => onPartOfSpeechChange(p)}
              className={cn(
                "px-4 py-2 rounded-xl text-xs font-bold transition-all",
                partOfSpeech === p
                  ? "bg-primary text-primary-foreground ring-4 ring-primary/15"
                  : "bg-secondary text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Level 3: Form */}
      <div className="space-y-3">
        <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
          Level 03 · Functional Form
        </label>
        {!partOfSpeech ? (
          <p className="text-xs text-muted-foreground italic px-1">
            Level 02를 먼저 선택하세요.
          </p>
        ) : (
          <div className="space-y-2">
            {formOptions.map(({ key, desc }) => (
              <button
                key={key}
                onClick={() => onFormChange(key)}
                className={cn(
                  "w-full p-3 rounded-xl border text-left transition-colors",
                  form === key
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/30 bg-card"
                )}
              >
                <div className="flex justify-between items-center mb-0.5">
                  <span
                    className={cn(
                      "text-xs font-bold font-mono",
                      form === key ? "text-primary" : "text-foreground"
                    )}
                  >
                    {key}
                  </span>
                  {form === key && <div className="size-2 rounded-full bg-primary" />}
                </div>
                <p className="text-[11px] text-muted-foreground">{desc}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        disabled={!element || !partOfSpeech || !form}
        className="mt-2 w-full py-3.5 rounded-2xl bg-gradient-to-r from-primary to-primary-glow text-primary-foreground font-bold text-sm tracking-wide shadow-lg shadow-primary/20 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed font-kr"
      >
        분석 확정 및 다음 단어
      </button>
    </aside>
  );
};

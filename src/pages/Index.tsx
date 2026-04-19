import { useMemo, useState } from "react";
import { WordChip } from "@/components/analyzer/WordChip";
import {
  AnalysisPanel,
  type NounProgress,
  type VerbProgress,
  type StepStatus,
} from "@/components/analyzer/AnalysisPanel";
import { KoreanHintButton } from "@/components/analyzer/KoreanHintButton";
import { AdminHintToggle } from "@/components/analyzer/AdminHintToggle";
import {
  SENTENCES,
  type POS,
  type NounForm,
  type SentenceElement,
  type VerbNumber,
  type VerbTense,
  type VerbAspect,
  type NounAnswer,
  type VerbAnswer,
} from "@/data/sentences";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";

type WordProgress = {
  pos: POS | null;
  posStatus: StepStatus;
  noun: NounProgress;
  verb: VerbProgress;
  completed: boolean;
};

const emptyNoun = (): NounProgress => ({
  form: null,
  element: null,
  role: null,
  formStatus: "idle",
  elementStatus: "idle",
  roleStatus: "idle",
});

const emptyVerb = (): VerbProgress => ({
  number: null,
  tense: null,
  aspect: [],
  voice: false,
  proVerb: false,
  confirmStatus: "idle",
});

const emptyProgress = (): WordProgress => ({
  pos: null,
  posStatus: "idle",
  noun: emptyNoun(),
  verb: emptyVerb(),
  completed: false,
});

const arraysEqualSet = <T,>(a: T[], b: T[]) =>
  a.length === b.length && a.every((x) => b.includes(x));

const Index = () => {
  const [sentenceIdx, setSentenceIdx] = useState(0);
  const sentence = SENTENCES[sentenceIdx];

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [progressMap, setProgressMap] = useState<Record<string, WordProgress>>({});

  const analyzableIds = useMemo(
    () =>
      sentence.tokens
        .filter((t): t is Extract<typeof sentence.tokens[number], { type: "analyzable" }> => t.type === "analyzable")
        .map((t) => t.id),
    [sentence],
  );

  const completedCount = analyzableIds.filter((id) => progressMap[id]?.completed).length;
  const sentenceComplete = completedCount === analyzableIds.length && analyzableIds.length > 0;

  const selectedToken = sentence.tokens.find(
    (t): t is Extract<typeof sentence.tokens[number], { type: "analyzable" }> =>
      t.type === "analyzable" && t.id === selectedId,
  );
  const progress = selectedId ? progressMap[selectedId] ?? emptyProgress() : emptyProgress();

  const updateProgress = (id: string, updater: (prev: WordProgress) => WordProgress) => {
    setProgressMap((prev) => ({
      ...prev,
      [id]: updater(prev[id] ?? emptyProgress()),
    }));
  };

  const handleSelect = (id: string) => {
    setSelectedId(id);
    if (!progressMap[id]) {
      setProgressMap((prev) => ({ ...prev, [id]: emptyProgress() }));
    }
  };

  // ===== LAYER 01: 품사 =====
  const handlePos = (p: POS) => {
    if (!selectedId || !selectedToken) return;
    const correct = selectedToken.answer.pos === p;
    updateProgress(selectedId, (prev) => ({
      ...prev,
      pos: p,
      posStatus: correct ? "correct" : "wrong",
      noun: correct ? prev.noun : emptyNoun(),
      verb: correct ? prev.verb : emptyVerb(),
      completed: false,
    }));
  };

  // ===== 명사 라인 =====
  const handleNounForm = (f: NounForm) => {
    if (!selectedId || !selectedToken || selectedToken.answer.pos !== "명사") return;
    const ans = selectedToken.answer as NounAnswer;
    const correct = ans.form === f;
    updateProgress(selectedId, (prev) => ({
      ...prev,
      noun: {
        ...prev.noun,
        form: f,
        formStatus: correct ? "correct" : "wrong",
        // 다음 단계 리셋
        element: correct ? prev.noun.element : null,
        elementStatus: "idle",
        role: correct ? prev.noun.role : null,
        roleStatus: "idle",
      },
      completed: false,
    }));
  };

  const handleNounElement = (e: SentenceElement) => {
    if (!selectedId || !selectedToken || selectedToken.answer.pos !== "명사") return;
    const ans = selectedToken.answer as NounAnswer;
    const correct = ans.element === e;
    updateProgress(selectedId, (prev) => ({
      ...prev,
      noun: {
        ...prev.noun,
        element: e,
        elementStatus: correct ? "correct" : "wrong",
        role: correct ? prev.noun.role : null,
        roleStatus: "idle",
      },
      completed: false,
    }));
  };

  const handleNounRole = (r: string) => {
    if (!selectedId || !selectedToken || selectedToken.answer.pos !== "명사") return;
    const ans = selectedToken.answer as NounAnswer;
    const correct = ans.role === r;
    updateProgress(selectedId, (prev) => ({
      ...prev,
      noun: {
        ...prev.noun,
        role: r,
        roleStatus: correct ? "correct" : "wrong",
      },
      completed: correct,
    }));
  };

  // ===== 동사 라인 =====
  const toggleVerb = (mut: (v: VerbProgress) => VerbProgress) => {
    if (!selectedId || !selectedToken || selectedToken.answer.pos !== "동사") return;
    updateProgress(selectedId, (prev) => ({
      ...prev,
      verb: { ...mut(prev.verb), confirmStatus: "idle" },
      completed: false,
    }));
  };

  const handleVerbNumber = (n: VerbNumber) =>
    toggleVerb((v) => ({ ...v, number: v.number === n ? null : n }));
  const handleVerbTense = (t: VerbTense) =>
    toggleVerb((v) => ({ ...v, tense: v.tense === t ? null : t }));
  const handleVerbAspect = (a: VerbAspect) =>
    toggleVerb((v) => ({
      ...v,
      aspect: v.aspect.includes(a) ? v.aspect.filter((x) => x !== a) : [...v.aspect, a],
    }));
  const handleVerbVoice = () => toggleVerb((v) => ({ ...v, voice: !v.voice }));
  const handleVerbProVerb = () => toggleVerb((v) => ({ ...v, proVerb: !v.proVerb }));

  const handleVerbConfirm = () => {
    if (!selectedId || !selectedToken || selectedToken.answer.pos !== "동사") return;
    const ans = selectedToken.answer as VerbAnswer;
    const v = progress.verb;
    const correct =
      (ans.number ?? null) === v.number &&
      (ans.tense ?? null) === v.tense &&
      arraysEqualSet(ans.aspect ?? [], v.aspect) &&
      (ans.voice === "수동") === v.voice &&
      (ans.proVerb ?? false) === v.proVerb;

    updateProgress(selectedId, (prev) => ({
      ...prev,
      verb: { ...prev.verb, confirmStatus: correct ? "correct" : "wrong" },
      completed: correct,
    }));
  };

  const goToSentence = (next: number) => {
    if (next < 0 || next >= SENTENCES.length) return;
    setSentenceIdx(next);
    setSelectedId(null);
    setProgressMap({});
  };

  const panelProps = {
    selectedWord: selectedToken?.text ?? null,
    answer: selectedToken?.answer ?? null,
    pos: progress.pos,
    posStatus: progress.posStatus,
    onPosChange: handlePos,
    noun: progress.noun,
    onNounFormChange: handleNounForm,
    onNounElementChange: handleNounElement,
    onNounRoleChange: handleNounRole,
    verb: progress.verb,
    onVerbToggleNumber: handleVerbNumber,
    onVerbToggleTense: handleVerbTense,
    onVerbToggleAspect: handleVerbAspect,
    onVerbToggleVoice: handleVerbVoice,
    onVerbToggleProVerb: handleVerbProVerb,
    onVerbConfirm: handleVerbConfirm,
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <nav className="glass-panel sticky top-0 z-50 border-b px-6 lg:px-8 py-3">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4 lg:gap-6">
            <div className="flex flex-col">
              <h1 className="font-kr font-bold text-base lg:text-lg text-primary leading-tight">
                공우정바른학원
              </h1>
              <span className="text-[10px] font-bold tracking-[0.2em] text-primary-glow uppercase">
                GWJ Syntax Master
              </span>
            </div>
            <div className="hidden md:block h-7 w-px bg-border" />
            <div className="hidden md:flex flex-col gap-0.5 font-kr">
              <p className="text-[11px] text-muted-foreground">태도가 실력이 될 때까지</p>
              <p className="text-[11px] font-semibold text-foreground">
                설명할 수 있어야 진짜 아는 것이다
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <AdminHintToggle />
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-card border border-border shadow-sm">
              <div className="size-2 rounded-full bg-element-o animate-pulse" />
              <span className="text-[11px] font-medium text-muted-foreground font-kr">
                {completedCount} / {analyzableIds.length} 완료
              </span>
            </div>
          </div>
        </div>
      </nav>

      <div className="lg:hidden px-4 pt-2 pb-1">
        <div className="max-w-7xl mx-auto">
          <AnalysisPanel {...panelProps} />
        </div>
      </div>

      <div className="hidden lg:block fixed top-[76px] right-4 z-40 w-[min(34vw,460px)]">
        <AnalysisPanel {...panelProps} />
      </div>

      <main className="max-w-7xl mx-auto p-4 lg:p-8 pt-4 lg:pt-24 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div>
            <p className="text-[10px] font-bold text-primary-glow tracking-widest uppercase font-kr">
              문장 분석 · No. {String(sentence.no).padStart(3, "0")}
            </p>
            <KoreanHintButton korean={sentence.korean} />
          </div>
          <div className="flex items-center gap-1.5 ml-2">
            <button
              onClick={() => goToSentence(sentenceIdx - 1)}
              disabled={sentenceIdx === 0}
              className="size-8 rounded-lg bg-secondary text-foreground hover:bg-primary/10 hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
              aria-label="이전 문장"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="text-[11px] font-bold tabular-nums text-muted-foreground px-1">
              {sentenceIdx + 1} / {SENTENCES.length}
            </span>
            <button
              onClick={() => goToSentence(sentenceIdx + 1)}
              disabled={sentenceIdx === SENTENCES.length - 1}
              className="size-8 rounded-lg bg-secondary text-foreground hover:bg-primary/10 hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
              aria-label="다음 문장"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>

        <section className="glass-panel rounded-2xl p-4 lg:p-6 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-0.5 bg-secondary">
            <div
              className="h-full bg-gradient-to-r from-primary to-primary-glow transition-all"
              style={{
                width: `${analyzableIds.length ? (completedCount / analyzableIds.length) * 100 : 0}%`,
              }}
            />
          </div>

          <div className="flex flex-wrap items-end gap-x-1.5 gap-y-7 pt-2 pb-1">
            {sentence.tokens.map((token, idx) => {
              if (token.type === "static") {
                if (token.role === "bracket") {
                  return (
                    <span
                      key={idx}
                      className="text-lg font-light text-primary/30 self-center select-none leading-none"
                      aria-hidden
                    >
                      {token.text}
                    </span>
                  );
                }
                if (token.role === "punct") {
                  return (
                    <span
                      key={idx}
                      className="text-sm font-light text-muted-foreground self-center leading-none"
                      aria-hidden
                    >
                      {token.text}
                    </span>
                  );
                }
                return (
                  <span
                    key={idx}
                    className="px-1 py-0.5 text-[15px] font-medium text-muted-foreground/50 select-none tracking-tight leading-tight"
                  >
                    {token.text}
                  </span>
                );
              }

              const wp = progressMap[token.id];
              const isSelected = selectedId === token.id;
              const isCompleted = wp?.completed;
              const state = isSelected ? "selected" : isCompleted ? "completed" : "active";

              // 완료 시 element 배지: 명사면 element, 동사면 "V"
              const completedElement = isCompleted
                ? token.answer.pos === "동사"
                  ? "V"
                  : (token.answer as NounAnswer).element
                : undefined;

              return (
                <WordChip
                  key={token.id}
                  word={token.text}
                  koreanLabel={isCompleted ? token.answer.koreanLabel : undefined}
                  element={completedElement}
                  state={state}
                  onClick={() => handleSelect(token.id)}
                />
              );
            })}
          </div>

          <div
            className="absolute -bottom-10 -right-10 size-64 rounded-full blur-3xl opacity-40 pointer-events-none"
            style={{ background: "hsl(var(--primary-glow) / 0.2)" }}
          />
        </section>

        <div className="glass-panel rounded-2xl p-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "size-8 rounded-lg flex items-center justify-center text-xs font-bold transition-colors",
                sentenceComplete ? "bg-element-o-bg text-element-o" : "bg-secondary text-primary",
              )}
            >
              {sentenceComplete ? "✓" : "i"}
            </div>
            <div>
              <p className="text-xs font-semibold">
                {sentenceComplete ? "Sentence Complete" : "Structural Context"}
              </p>
              <p className="text-[11px] text-muted-foreground font-kr">
                {sentenceComplete
                  ? "모든 단어 분석 완료 — 다음 문장으로 이동하세요"
                  : `${analyzableIds.length}개 분석 대상 단어 · 단계별 잠금 채점`}
              </p>
            </div>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {sentence.structureTags.map((tag) => (
              <span
                key={tag}
                className="px-2.5 py-1 bg-secondary text-[10px] font-bold rounded-md text-secondary-foreground tracking-tight"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </main>

      <footer className="max-w-7xl mx-auto px-6 lg:px-8 pb-10 pt-4">
        <div className="flex justify-between items-center border-t border-border pt-6 text-[11px] text-muted-foreground font-kr">
          <span className="font-bold tracking-widest font-kr">
            공우정바른학원 · GWJ Syntax Master · v0.4
          </span>
          <span className="italic">설명할 수 있어야 진짜 아는 것이다</span>
        </div>
      </footer>
    </div>
  );
};

export default Index;

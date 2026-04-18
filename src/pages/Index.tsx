import { useMemo, useState } from "react";
import { WordChip } from "@/components/analyzer/WordChip";
import { AnalysisPanel } from "@/components/analyzer/AnalysisPanel";
import { SENTENCES, type ElementAnswer, type POSAnswer, type FormAnswer } from "@/data/sentences";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";

type StepStatus = "idle" | "correct" | "wrong";
type WordProgress = {
  element: ElementAnswer | null;
  pos: POSAnswer | null;
  form: FormAnswer | null;
  elementStatus: StepStatus;
  posStatus: StepStatus;
  formStatus: StepStatus;
  completed: boolean;
};

const emptyProgress = (): WordProgress => ({
  element: null,
  pos: null,
  form: null,
  elementStatus: "idle",
  posStatus: "idle",
  formStatus: "idle",
  completed: false,
});

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
    [sentence]
  );

  const completedCount = analyzableIds.filter((id) => progressMap[id]?.completed).length;
  const sentenceComplete = completedCount === analyzableIds.length && analyzableIds.length > 0;

  const selectedToken = sentence.tokens.find(
    (t): t is Extract<typeof sentence.tokens[number], { type: "analyzable" }> =>
      t.type === "analyzable" && t.id === selectedId
  );
  const progress = selectedId ? progressMap[selectedId] ?? emptyProgress() : emptyProgress();

  const updateProgress = (id: string, patch: Partial<WordProgress>) => {
    setProgressMap((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? emptyProgress()), ...patch },
    }));
  };

  const handleSelect = (id: string) => {
    setSelectedId(id);
    if (!progressMap[id]) {
      setProgressMap((prev) => ({ ...prev, [id]: emptyProgress() }));
    }
  };

  const handleElement = (e: ElementAnswer) => {
    if (!selectedId || !selectedToken) return;
    const correct = selectedToken.answer.element === e;
    updateProgress(selectedId, {
      element: e,
      elementStatus: correct ? "correct" : "wrong",
      // 오답이면 하위 잠금
      pos: correct ? progress.pos : null,
      form: correct ? progress.form : null,
      posStatus: correct ? progress.posStatus : "idle",
      formStatus: correct ? progress.formStatus : "idle",
    });
  };

  const handlePOS = (p: POSAnswer) => {
    if (!selectedId || !selectedToken) return;
    const correct = selectedToken.answer.pos === p;
    updateProgress(selectedId, {
      pos: p,
      posStatus: correct ? "correct" : "wrong",
      form: correct ? progress.form : null,
      formStatus: correct ? progress.formStatus : "idle",
    });
  };

  const handleForm = (f: FormAnswer) => {
    if (!selectedId || !selectedToken) return;
    const correct = selectedToken.answer.form === f;
    const done = correct;
    updateProgress(selectedId, {
      form: f,
      formStatus: correct ? "correct" : "wrong",
      completed: done,
    });
  };

  const goToSentence = (next: number) => {
    if (next < 0 || next >= SENTENCES.length) return;
    setSentenceIdx(next);
    setSelectedId(null);
    setProgressMap({});
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <nav className="glass-panel sticky top-0 z-50 border-b px-6 lg:px-8 py-4">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4 lg:gap-6">
            <div className="flex flex-col">
              <h1 className="font-kr font-bold text-lg lg:text-xl text-primary leading-tight">
                공우정바른학원
              </h1>
              <span className="text-[10px] font-bold tracking-[0.2em] text-primary-glow uppercase">
                GWJ Syntax Master
              </span>
            </div>
            <div className="hidden md:block h-8 w-px bg-border" />
            <div className="hidden md:flex flex-col gap-0.5 font-kr">
              <p className="text-xs text-muted-foreground">태도가 실력이 될 때까지</p>
              <p className="text-xs font-semibold text-foreground">
                설명할 수 있어야 진짜 아는 것이다
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-card border border-border shadow-sm">
              <div className="size-2 rounded-full bg-element-o animate-pulse" />
              <span className="text-xs font-medium text-muted-foreground font-kr">
                {completedCount} / {analyzableIds.length} 분석 완료
              </span>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto p-4 lg:p-8 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
        {/* Sentence Canvas */}
        <section className="lg:col-span-8 flex flex-col gap-6">
          <div className="glass-panel rounded-3xl p-6 lg:p-10 relative overflow-hidden min-h-[420px]">
            <div className="absolute top-0 left-0 w-full h-1 bg-secondary">
              <div
                className="h-full bg-gradient-to-r from-primary to-primary-glow transition-all"
                style={{
                  width: `${analyzableIds.length ? (completedCount / analyzableIds.length) * 100 : 0}%`,
                }}
              />
            </div>

            <header className="mb-10 flex items-start justify-between gap-4 flex-wrap">
              <div>
                <p className="text-xs font-bold text-primary-glow tracking-tighter uppercase mb-2 font-kr">
                  문장 분석 · No. {String(sentence.no).padStart(3, "0")}
                </p>
                <p className="text-sm text-muted-foreground font-medium font-kr">
                  {sentence.korean}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => goToSentence(sentenceIdx - 1)}
                  disabled={sentenceIdx === 0}
                  className="size-9 rounded-xl bg-secondary text-foreground hover:bg-primary/10 hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                  aria-label="이전 문장"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <span className="text-xs font-bold tabular-nums text-muted-foreground px-2">
                  {sentenceIdx + 1} / {SENTENCES.length}
                </span>
                <button
                  onClick={() => goToSentence(sentenceIdx + 1)}
                  disabled={sentenceIdx === SENTENCES.length - 1}
                  className="size-9 rounded-xl bg-secondary text-foreground hover:bg-primary/10 hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                  aria-label="다음 문장"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>
            </header>

            <div className="flex flex-wrap items-end gap-x-3 gap-y-14 pb-4">
              {sentence.tokens.map((token, idx) => {
                if (token.type === "static") {
                  if (token.role === "bracket") {
                    return (
                      <span
                        key={idx}
                        className="text-4xl font-light text-primary/30 self-center pb-2 select-none"
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
                        className="text-2xl font-light text-muted-foreground self-center pb-1"
                        aria-hidden
                      >
                        {token.text}
                      </span>
                    );
                  }
                  // 분석 대상 아닌 일반 단어 → 비활성 표시
                  return (
                    <span
                      key={idx}
                      className="px-3 py-2 text-xl font-medium text-muted-foreground/50 select-none"
                    >
                      {token.text}
                    </span>
                  );
                }

                const wp = progressMap[token.id];
                const isSelected = selectedId === token.id;
                const isCompleted = wp?.completed;
                const state = isSelected
                  ? "selected"
                  : isCompleted
                    ? "completed"
                    : "active";

                return (
                  <WordChip
                    key={token.id}
                    word={token.text}
                    koreanLabel={isCompleted ? token.answer.koreanLabel : undefined}
                    element={isCompleted ? token.answer.element : undefined}
                    state={state}
                    onClick={() => handleSelect(token.id)}
                  />
                );
              })}
            </div>

            {/* Decorative glows */}
            <div
              className="absolute -bottom-10 -right-10 size-64 rounded-full blur-3xl opacity-40 pointer-events-none"
              style={{ background: "hsl(var(--primary-glow) / 0.2)" }}
            />
            <div
              className="absolute top-1/2 left-1/4 size-32 rounded-full blur-3xl opacity-30 pointer-events-none"
              style={{ background: "hsl(var(--element-s) / 0.2)" }}
            />
          </div>

          {/* Context strip */}
          <div className="glass-panel rounded-2xl p-4 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "size-10 rounded-xl flex items-center justify-center font-bold transition-colors",
                  sentenceComplete
                    ? "bg-element-o-bg text-element-o"
                    : "bg-secondary text-primary"
                )}
              >
                {sentenceComplete ? "✓" : "i"}
              </div>
              <div>
                <p className="text-sm font-semibold">
                  {sentenceComplete ? "Sentence Complete" : "Structural Context"}
                </p>
                <p className="text-xs text-muted-foreground font-kr">
                  {sentenceComplete
                    ? "모든 단어 분석 완료 — 다음 문장으로 이동하세요"
                    : `${analyzableIds.length}개 분석 대상 단어 · 단계별 잠금 채점`}
                </p>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              {sentence.structureTags.map((tag) => (
                <span
                  key={tag}
                  className="px-3 py-1 bg-secondary text-[10px] font-bold rounded-lg text-secondary-foreground"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Analysis Panel */}
        <div className="lg:col-span-4">
          <AnalysisPanel
            selectedWord={selectedToken?.text ?? null}
            answer={selectedToken?.answer ?? null}
            element={progress.element}
            partOfSpeech={progress.pos}
            form={progress.form}
            elementStatus={progress.elementStatus}
            posStatus={progress.posStatus}
            formStatus={progress.formStatus}
            onElementChange={handleElement}
            onPartOfSpeechChange={handlePOS}
            onFormChange={handleForm}
          />
        </div>
      </main>

      <footer className="max-w-7xl mx-auto px-6 lg:px-8 pb-10 pt-4">
        <div className="flex justify-between items-center border-t border-border pt-6 text-xs text-muted-foreground font-kr">
          <span className="font-bold tracking-widest font-kr">
            공우정바른학원 · GWJ Syntax Master · v0.2
          </span>
          <span className="italic">설명할 수 있어야 진짜 아는 것이다</span>
        </div>
      </footer>
    </div>
  );
};

export default Index;

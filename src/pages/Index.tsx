import { useState } from "react";
import { WordChip, type ElementType } from "@/components/gts/WordChip";
import { AnalysisPanel, type PartOfSpeech, type FormType } from "@/components/gts/AnalysisPanel";

// Demo sentence — placeholder until 원장님 정답 데이터 제공
// "She wanted to improve her English."
type Token =
  | { type: "word"; id: string; word: string; koreanLabel: string; element: ElementType }
  | { type: "bracket"; char: "[" | "]" }
  | { type: "punct"; char: string };

const DEMO_TOKENS: Token[] = [
  { type: "bracket", char: "[" },
  { type: "word", id: "w1", word: "She", koreanLabel: "대명사", element: "S" },
  { type: "word", id: "w2", word: "wanted", koreanLabel: "과거동사", element: "V" },
  { type: "word", id: "w3", word: "to improve", koreanLabel: "to부정사", element: "O" },
  { type: "word", id: "w4", word: "her", koreanLabel: "소유격", element: "M" },
  { type: "word", id: "w5", word: "English", koreanLabel: "명사", element: "O" },
  { type: "bracket", char: "]" },
  { type: "punct", char: "." },
];

const Index = () => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [element, setElement] = useState<ElementType | null>(null);
  const [pos, setPos] = useState<PartOfSpeech | null>(null);
  const [form, setForm] = useState<FormType | null>(null);

  const selectedWord =
    DEMO_TOKENS.find((t): t is Extract<Token, { type: "word" }> => t.type === "word" && t.id === selectedId)
      ?.word ?? null;

  const handleSelect = (id: string) => {
    setSelectedId(id);
    setElement(null);
    setPos(null);
    setForm(null);
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
                GTS Analyzer Pro
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
                분석 세션 진행 중
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
              <div className="h-full bg-gradient-to-r from-primary to-primary-glow w-1/3" />
            </div>

            <header className="mb-10">
              <p className="text-xs font-bold text-primary-glow tracking-tighter uppercase mb-2">
                Sentence Analysis · Demo No. 001
              </p>
              <p className="text-sm text-muted-foreground font-medium font-kr">
                활성화된 단어를 클릭해 3-Level 구조 분석을 시작하세요.
              </p>
            </header>

            <div className="flex flex-wrap items-end gap-x-3 gap-y-14 pb-4">
              {DEMO_TOKENS.map((token, idx) => {
                if (token.type === "bracket") {
                  return (
                    <span
                      key={idx}
                      className="text-4xl font-light text-primary/30 self-center pb-2 select-none"
                      aria-hidden
                    >
                      {token.char}
                    </span>
                  );
                }
                if (token.type === "punct") {
                  return (
                    <span
                      key={idx}
                      className="text-2xl font-light text-muted-foreground self-center pb-1"
                      aria-hidden
                    >
                      {token.char}
                    </span>
                  );
                }
                return (
                  <WordChip
                    key={token.id}
                    word={token.word}
                    koreanLabel={token.koreanLabel}
                    element={token.element}
                    active={selectedId === token.id}
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
              <div className="size-10 rounded-xl bg-secondary flex items-center justify-center">
                <span className="font-bold text-primary">i</span>
              </div>
              <div>
                <p className="text-sm font-semibold">Structural Context</p>
                <p className="text-xs text-muted-foreground font-kr">
                  단문 · 능동태 · S+V+O 구조
                </p>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <span className="px-3 py-1 bg-secondary text-[10px] font-bold rounded-lg text-secondary-foreground">
                SIMPLE SENTENCE
              </span>
              <span className="px-3 py-1 bg-secondary text-[10px] font-bold rounded-lg text-secondary-foreground">
                ACTIVE VOICE
              </span>
            </div>
          </div>
        </section>

        {/* Analysis Panel */}
        <div className="lg:col-span-4">
          <AnalysisPanel
            selectedWord={selectedWord}
            element={element}
            partOfSpeech={pos}
            form={form}
            onElementChange={setElement}
            onPartOfSpeechChange={(p) => {
              setPos(p);
              setForm(null);
            }}
            onFormChange={setForm}
          />
        </div>
      </main>

      <footer className="max-w-7xl mx-auto px-6 lg:px-8 pb-10 pt-4">
        <div className="flex justify-between items-center border-t border-border pt-6 text-xs text-muted-foreground font-kr">
          <span className="font-bold tracking-widest">GTS ANALYZER · v0.1</span>
          <span className="italic">설명할 수 있어야 진짜 아는 것이다</span>
        </div>
      </footer>
    </div>
  );
};

export default Index;

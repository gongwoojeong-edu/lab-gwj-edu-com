import { useEffect, useMemo, useState } from "react";
import { WordChip } from "@/components/analyzer/WordChip";
import {
  AnalysisPanel,
  type NounProgress,
  type AdjProgress,
  type AdvProgress,
  type EtcProgress,
  type VerbProgress,
  type StepStatus,
} from "@/components/analyzer/AnalysisPanel";
import { KoreanHintButton } from "@/components/analyzer/KoreanHintButton";
import { AdminHintToggle } from "@/components/analyzer/AdminHintToggle";
import {
  SENTENCES,
  INTERNAL_OBJECT_ROLES,
  type POS,
  type NounForm,
  type AdjForm,
  type AdvForm,
  type AdvSubtype,
  type EtcKind,
  type SentenceElement,
  type VerbNumber,
  type VerbTense,
  type VerbAspect,
  type NounAnswer,
  type VerbAnswer,
  type AdjAnswer,
  type AdvAnswer,
  type EtcAnswer,
} from "@/data/sentences";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";

type WordProgress = {
  pos: POS | null;
  posStatus: StepStatus;
  noun: NounProgress;
  adj: AdjProgress;
  adv: AdvProgress;
  etc: EtcProgress;
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

const emptyAdj = (): AdjProgress => ({
  form: null,
  element: null,
  role: null,
  formStatus: "idle",
  elementStatus: "idle",
  roleStatus: "idle",
});

const emptyAdv = (): AdvProgress => ({
  form: null,
  subtype: null,
  role: null,
  formStatus: "idle",
  subtypeStatus: "idle",
  roleStatus: "idle",
});

const emptyEtc = (): EtcProgress => ({
  kind: null,
  role: null,
  kindStatus: "idle",
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
  adj: emptyAdj(),
  adv: emptyAdv(),
  etc: emptyEtc(),
  verb: emptyVerb(),
  completed: false,
});

const arraysEqualSet = <T,>(a: T[], b: T[]) =>
  a.length === b.length && a.every((x) => b.includes(x));

const Index = () => {
  const isMobile = useIsMobile();
  const [sentenceIdx, setSentenceIdx] = useState(0);
  const sentence = SENTENCES[sentenceIdx];

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [progressMap, setProgressMap] = useState<Record<string, WordProgress>>({});
  const [drawerOpen, setDrawerOpen] = useState(false);

  // ===== 단어 단위 다중 선택 =====
  // 문장을 공백 기준으로 분리 — 절대 단어를 그룹화하지 않는다.
  const wordUnits = useMemo(() => {
    // analyzable 토큰의 text도 공백으로 쪼개서 평탄화
    const out: { word: string; tokenId?: string; tokenLocalIdx?: number; totalInToken?: number }[] = [];
    sentence.tokens.forEach((t) => {
      if (t.type === "static" && (t.role === "bracket" || t.role === "punct")) {
        // 구두점/괄호는 직전 단어에 붙이지 않고 별도 unit (선택 불가)
        out.push({ word: t.text });
        return;
      }
      const text = t.text;
      const parts = text.split(/\s+/).filter(Boolean);
      parts.forEach((p, i) => {
        if (t.type === "analyzable") {
          out.push({ word: p, tokenId: t.id, tokenLocalIdx: i, totalInToken: parts.length });
        } else {
          out.push({ word: p });
        }
      });
    });
    return out;
  }, [sentence]);

  const isPunct = (w: string) => /^[\.,;:!?"'()\[\]{}]+$/.test(w);

  const [selectedWordIndices, setSelectedWordIndices] = useState<number[]>([]);
  const [dragStart, setDragStart] = useState<number | null>(null);
  const isDragging = dragStart !== null;

  // 모바일에서 단어 선택 시 Drawer open
  useEffect(() => {
    if (isMobile && selectedId) setDrawerOpen(true);
  }, [isMobile, selectedId]);

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

  // ===== 단어 인덱스 → analyzable token 매칭 =====
  const resolveTokenFromIndices = (indices: number[]): string | null => {
    if (indices.length === 0) return null;
    const sorted = [...indices].sort((a, b) => a - b);
    const tokenIdCounts: Record<string, number> = {};
    for (const i of sorted) {
      const u = wordUnits[i];
      if (u?.tokenId) tokenIdCounts[u.tokenId] = (tokenIdCounts[u.tokenId] ?? 0) + 1;
    }
    const tokenIds = Object.keys(tokenIdCounts);
    if (tokenIds.length === 0) return null;
    // 가장 많은 단어가 속한 토큰 선택
    return tokenIds.sort((a, b) => tokenIdCounts[b] - tokenIdCounts[a])[0];
  };

  // ===== 단어 단위 드래그 선택 =====
  const handleWordMouseDown = (idx: number) => {
    if (isPunct(wordUnits[idx].word)) return;
    setDragStart(idx);
    setSelectedWordIndices([idx]);
  };
  const handleWordMouseEnter = (idx: number) => {
    if (dragStart === null) return;
    const lo = Math.min(dragStart, idx);
    const hi = Math.max(dragStart, idx);
    const range: number[] = [];
    for (let i = lo; i <= hi; i++) {
      if (!isPunct(wordUnits[i].word)) range.push(i);
    }
    setSelectedWordIndices(range);
  };
  const finalizeSelection = (indices: number[]) => {
    setDragStart(null);
    const tid = resolveTokenFromIndices(indices);
    if (tid) handleSelect(tid);
    else setSelectedId(null);
  };
  const handleWordMouseUp = () => {
    if (dragStart === null) return;
    finalizeSelection(selectedWordIndices);
  };

  useEffect(() => {
    if (!isDragging) return;
    const onUp = () => finalizeSelection(selectedWordIndices);
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDragging, selectedWordIndices]);

  // ===== LAYER 01: 품사 =====
  const handlePos = (p: POS) => {
    if (!selectedId || !selectedToken) return;
    const correct = selectedToken.answer.pos === p;
    updateProgress(selectedId, (prev) => ({
      ...prev,
      pos: p,
      posStatus: correct ? "correct" : "wrong",
      noun: correct ? prev.noun : emptyNoun(),
      adj: correct ? prev.adj : emptyAdj(),
      adv: correct ? prev.adv : emptyAdv(),
      etc: correct ? prev.etc : emptyEtc(),
      verb: correct ? prev.verb : emptyVerb(),
      completed: false,
    }));
  };

  // ===== 명사 =====
  const handleNounForm = (f: NounForm) => {
    if (!selectedToken || selectedToken.answer.pos !== "명사") return;
    const ans = selectedToken.answer as NounAnswer;
    const correct = ans.form === f;
    updateProgress(selectedToken.id, (prev) => ({
      ...prev,
      noun: {
        ...prev.noun,
        form: f,
        formStatus: correct ? "correct" : "wrong",
        element: correct ? prev.noun.element : null,
        elementStatus: "idle",
        role: correct ? prev.noun.role : null,
        roleStatus: "idle",
      },
      completed: false,
    }));
  };

  const handleNounElement = (e: SentenceElement) => {
    if (!selectedToken || selectedToken.answer.pos !== "명사") return;
    const ans = selectedToken.answer as NounAnswer;
    const correct = ans.element === e;
    updateProgress(selectedToken.id, (prev) => ({
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
    if (!selectedToken || selectedToken.answer.pos !== "명사") return;
    const ans = selectedToken.answer as NounAnswer;
    const correct = ans.role === r;
    updateProgress(selectedToken.id, (prev) => ({
      ...prev,
      noun: { ...prev.noun, role: r, roleStatus: correct ? "correct" : "wrong" },
      completed: correct,
    }));
  };

  // ===== 형용사 =====
  const handleAdjForm = (f: AdjForm) => {
    if (!selectedToken || selectedToken.answer.pos !== "형용사") return;
    const ans = selectedToken.answer as AdjAnswer;
    const correct = ans.form === f;
    updateProgress(selectedToken.id, (prev) => ({
      ...prev,
      adj: {
        ...prev.adj,
        form: f,
        formStatus: correct ? "correct" : "wrong",
        element: correct ? prev.adj.element : null,
        elementStatus: "idle",
        role: correct ? prev.adj.role : null,
        roleStatus: "idle",
      },
      completed: false,
    }));
  };

  const handleAdjElement = (e: "C" | "M") => {
    if (!selectedToken || selectedToken.answer.pos !== "형용사") return;
    const ans = selectedToken.answer as AdjAnswer;
    const correct = ans.element === e;
    updateProgress(selectedToken.id, (prev) => ({
      ...prev,
      adj: {
        ...prev.adj,
        element: e,
        elementStatus: correct ? "correct" : "wrong",
        role: correct ? prev.adj.role : null,
        roleStatus: "idle",
      },
      completed: false,
    }));
  };

  const handleAdjRole = (r: string) => {
    if (!selectedToken || selectedToken.answer.pos !== "형용사") return;
    const ans = selectedToken.answer as AdjAnswer;
    const correct = ans.role === r;
    updateProgress(selectedToken.id, (prev) => ({
      ...prev,
      adj: { ...prev.adj, role: r, roleStatus: correct ? "correct" : "wrong" },
      completed: correct,
    }));
  };

  // ===== 부사 =====
  const handleAdvForm = (f: AdvForm) => {
    if (!selectedToken || selectedToken.answer.pos !== "부사") return;
    const ans = selectedToken.answer as AdvAnswer;
    const correct = ans.form === f;
    updateProgress(selectedToken.id, (prev) => ({
      ...prev,
      adv: {
        ...prev.adv,
        form: f,
        formStatus: correct ? "correct" : "wrong",
        subtype: correct ? prev.adv.subtype : null,
        subtypeStatus: "idle",
        role: correct ? prev.adv.role : null,
        roleStatus: "idle",
      },
      completed: false,
    }));
  };

  const handleAdvSubtype = (s: AdvSubtype) => {
    if (!selectedToken || selectedToken.answer.pos !== "부사") return;
    const ans = selectedToken.answer as AdvAnswer;
    const correct = ans.subtype === s;
    updateProgress(selectedToken.id, (prev) => ({
      ...prev,
      adv: {
        ...prev.adv,
        subtype: s,
        subtypeStatus: correct ? "correct" : "wrong",
        role: correct ? prev.adv.role : null,
        roleStatus: "idle",
      },
      completed: false,
    }));
  };

  const handleAdvRole = (r: string) => {
    if (!selectedToken || selectedToken.answer.pos !== "부사") return;
    const ans = selectedToken.answer as AdvAnswer;
    const correct = ans.role === r;
    updateProgress(selectedToken.id, (prev) => ({
      ...prev,
      adv: { ...prev.adv, role: r, roleStatus: correct ? "correct" : "wrong" },
      completed: correct,
    }));
  };

  // ===== 기타 =====
  const handleEtcKind = (k: EtcKind) => {
    if (!selectedToken || selectedToken.answer.pos !== "기타") return;
    const ans = selectedToken.answer as EtcAnswer;
    const correct = ans.kind === k;
    updateProgress(selectedToken.id, (prev) => ({
      ...prev,
      etc: {
        ...prev.etc,
        kind: k,
        kindStatus: correct ? "correct" : "wrong",
        role: correct ? prev.etc.role : null,
        roleStatus: "idle",
      },
      completed: false,
    }));
  };

  const handleEtcRole = (r: string) => {
    if (!selectedToken || selectedToken.answer.pos !== "기타") return;
    const ans = selectedToken.answer as EtcAnswer;
    const correct = ans.role === r;
    updateProgress(selectedToken.id, (prev) => ({
      ...prev,
      etc: { ...prev.etc, role: r, roleStatus: correct ? "correct" : "wrong" },
      completed: correct,
    }));
  };

  // ===== 동사 =====
  const toggleVerb = (mut: (v: VerbProgress) => VerbProgress) => {
    if (!selectedToken || selectedToken.answer.pos !== "동사") return;
    updateProgress(selectedToken.id, (prev) => ({
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
    if (!selectedToken || selectedToken.answer.pos !== "동사") return;
    const ans = selectedToken.answer as VerbAnswer;
    const v = progress.verb;
    const correct =
      (ans.number ?? null) === v.number &&
      (ans.tense ?? null) === v.tense &&
      arraysEqualSet(ans.aspect ?? [], v.aspect) &&
      (ans.voice === "수동") === v.voice &&
      (ans.proVerb ?? false) === v.proVerb;

    updateProgress(selectedToken.id, (prev) => ({
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
    setDrawerOpen(false);
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
    adj: progress.adj,
    onAdjFormChange: handleAdjForm,
    onAdjElementChange: handleAdjElement,
    onAdjRoleChange: handleAdjRole,
    adv: progress.adv,
    onAdvFormChange: handleAdvForm,
    onAdvSubtypeChange: handleAdvSubtype,
    onAdvRoleChange: handleAdvRole,
    etc: progress.etc,
    onEtcKindChange: handleEtcKind,
    onEtcRoleChange: handleEtcRole,
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

      {/* Desktop: fixed top-right panel */}
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

          <div
            className="flex flex-wrap items-end gap-x-1 gap-y-7 pt-2 pb-1 select-none"
            onMouseLeave={() => isDragging && finalizeSelection(selectedWordIndices)}
          >
            {wordUnits.map((u, idx) => {
              const word = u.word;
              const punct = isPunct(word);

              // 구두점/괄호: 비대화형
              if (punct) {
                return (
                  <span
                    key={idx}
                    className="text-base font-medium text-foreground self-end leading-tight"
                    aria-hidden
                  >
                    {word}
                  </span>
                );
              }

              const isSelected = selectedWordIndices.includes(idx);
              const tokenId = u.tokenId;
              const token = tokenId
                ? sentence.tokens.find(
                    (t): t is Extract<typeof sentence.tokens[number], { type: "analyzable" }> =>
                      t.type === "analyzable" && t.id === tokenId,
                  )
                : undefined;
              const wp = tokenId ? progressMap[tokenId] : undefined;
              const isCompleted = !!wp?.completed;
              const isFirstOfToken = u.tokenLocalIdx === 0;

              // 완료 시 element 배지 — 첫 단어에만 표시
              let completedElement: "S" | "V" | "O" | "C" | "M" | undefined;
              if (isCompleted && isFirstOfToken && token) {
                const a = token.answer;
                if (a.pos === "동사") completedElement = "V";
                else if (a.pos === "명사") {
                  if (!INTERNAL_OBJECT_ROLES.has(a.role)) completedElement = a.element;
                } else if (a.pos === "형용사") completedElement = a.element;
                else if (a.pos === "부사" && a.subtype === "접속부사") completedElement = "M";
                else if (a.pos === "기타" && (a.kind === "삽입" || a.kind === "부연")) completedElement = "M";
              }
              const koreanLabel =
                isCompleted && isFirstOfToken && token ? token.answer.koreanLabel : undefined;

              return (
                <span
                  key={idx}
                  role="button"
                  tabIndex={0}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleWordMouseDown(idx);
                  }}
                  onMouseEnter={() => handleWordMouseEnter(idx)}
                  onMouseUp={handleWordMouseUp}
                  className="relative inline-flex flex-col items-center cursor-pointer leading-none"
                >
                  {koreanLabel && (
                    <span className="absolute -top-3.5 text-[9px] font-semibold font-kr text-primary whitespace-nowrap tracking-tight leading-none pointer-events-none">
                      {koreanLabel}
                    </span>
                  )}
                  <span
                    className={cn(
                      "px-1 py-0.5 rounded-sm text-[16px] font-medium tracking-tight leading-tight text-foreground transition-colors",
                      // 각 단어가 분리된 단위라는 시각 신호: 옅은 회색 배경
                      "bg-muted/40",
                      // 완료된 토큰의 단어들은 옅은 보라 배경
                      isCompleted && !isSelected && "bg-primary/[0.08]",
                      // 선택된 인덱스는 진한 보라 하이라이트
                      isSelected && "bg-primary/20",
                    )}
                  >
                    {word}
                  </span>
                  {completedElement && (
                    <span
                      className={cn(
                        "absolute -bottom-3 px-1 py-0 rounded text-[9px] font-bold leading-none tracking-tight pointer-events-none",
                        completedElement === "S" && "badge-s",
                        completedElement === "V" && "badge-v",
                        completedElement === "O" && "badge-o",
                        completedElement === "C" && "badge-c",
                        completedElement === "M" && "badge-m",
                      )}
                    >
                      {completedElement}
                    </span>
                  )}
                </span>
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

      {/* Mobile: bottom-sheet drawer */}
      {isMobile && (
        <Drawer
          open={drawerOpen}
          onOpenChange={(open) => {
            setDrawerOpen(open);
            if (!open) setSelectedId(null);
          }}
        >
          <DrawerContent className="max-h-[75vh]">
            <DrawerTitle className="sr-only">단어 분석</DrawerTitle>
            <div className="px-3 pb-4 pt-2 overflow-y-auto">
              <AnalysisPanel {...panelProps} />
            </div>
          </DrawerContent>
        </Drawer>
      )}

      <footer className="max-w-7xl mx-auto px-6 lg:px-8 pb-10 pt-4">
        <div className="flex justify-between items-center border-t border-border pt-6 text-[11px] text-muted-foreground font-kr">
          <span className="font-bold tracking-widest font-kr">
            공우정바른학원 · GWJ Syntax Master · v0.5
          </span>
          <span className="italic">설명할 수 있어야 진짜 아는 것이다</span>
        </div>
      </footer>
    </div>
  );
};

export default Index;

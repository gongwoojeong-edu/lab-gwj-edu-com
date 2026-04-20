import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, ImageIcon, RotateCcw, Volume2, X, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WordTestEntry } from "@/lib/wordTestBuilder";
import { fetchLatestWordPre, insertWordPreResult } from "@/lib/wordPre";
import { speakChunk, speakWord, splitIntoSyllables } from "@/lib/syllables";
import { toast } from "@/hooks/use-toast";

interface Props {
  sentenceId: string;
  entries: WordTestEntry[];
  onCompleted: () => void;
}

type Phase = "listen" | "spell" | "passed";

const isSpellingMatch = (given: string, expected: string) =>
  given.trim().toLowerCase() === expected.trim().toLowerCase();

export const WordPreStep = ({ sentenceId, entries, onCompleted }: Props) => {
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>("listen");
  const [input, setInput] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [completedWords, setCompletedWords] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const total = entries.length;
  const current = entries[idx];
  const syllables = useMemo(
    () => (current ? splitIntoSyllables(current.word) : []),
    [current],
  );

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    fetchLatestWordPre(sentenceId).then((r) => {
      if (!mounted) return;
      if (r?.completed) {
        setCompletedWords(r.known_words ?? []);
        setDone(true);
      } else {
        setCompletedWords([]);
        setDone(false);
        setIdx(0);
        setPhase("listen");
        setInput("");
        setAttempts(0);
        setRevealed(false);
      }
      setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [sentenceId]);

  // voice 사전 워밍업 (브라우저가 voice 목록을 비동기로 채움)
  useEffect(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.getVoices();
    }
  }, []);

  // 단어 전환 시 입력 포커스
  useEffect(() => {
    if (phase === "spell") {
      const t = setTimeout(() => inputRef.current?.focus(), 120);
      return () => clearTimeout(t);
    }
  }, [phase, idx]);

  const goToNext = (justPassedWord: string) => {
    const nextCompleted = [...completedWords, justPassedWord];
    setCompletedWords(nextCompleted);
    if (idx + 1 >= total) {
      setPhase("passed");
      void saveResults(nextCompleted);
    } else {
      setIdx(idx + 1);
      setPhase("listen");
      setInput("");
      setAttempts(0);
      setRevealed(false);
    }
  };

  const saveResults = async (knownWords: string[]) => {
    setSaving(true);
    try {
      await insertWordPreResult(sentenceId, knownWords, []);
      setDone(true);
      toast({ title: "단어 학습 완료", description: `${knownWords.length}개 단어 통과` });
      onCompleted();
    } catch (e) {
      toast({ title: "저장 실패", description: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = () => {
    if (!current) return;
    const ok = isSpellingMatch(input, current.word);
    if (ok) {
      toast({ title: "정답!", description: current.word });
      goToNext(current.word);
      return;
    }
    const next = attempts + 1;
    setAttempts(next);
    if (next >= 2) {
      setRevealed(true);
      toast({
        title: "정답을 확인하세요",
        description: `정답: ${current.word}`,
        variant: "destructive",
      });
    } else {
      toast({
        title: "다시 시도",
        description: "스펠링이 정확하지 않아요.",
        variant: "destructive",
      });
    }
    setInput("");
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleRestart = () => {
    setCompletedWords([]);
    setIdx(0);
    setPhase("listen");
    setInput("");
    setAttempts(0);
    setRevealed(false);
    setDone(false);
  };

  if (loading) {
    return <Card className="p-6 text-sm text-muted-foreground">불러오는 중…</Card>;
  }
  if (total === 0) {
    return (
      <Card className="p-6 text-sm text-muted-foreground">
        학습할 단어가 없습니다. 분석 단계에서 단어 의미를 먼저 입력해야 합니다.
      </Card>
    );
  }

  if (done || phase === "passed") {
    return (
      <Card className="p-6 sm:p-8 space-y-5 border-primary/30 bg-gradient-to-br from-primary/5 to-accent/5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center">
            <Check className="w-5 h-5 text-primary" />
          </div>
          <div>
            <div className="text-lg font-extrabold text-primary">단어 학습 통과</div>
            <div className="text-xs text-muted-foreground">
              {completedWords.length} / {total} 단어 완료 — 다음 단계로 이동할 수 있어요.
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
          {entries.map((e) => (
            <div
              key={e.word}
              className="p-2 rounded-md border border-primary/20 bg-card flex flex-col gap-0.5"
            >
              <span className="font-semibold text-foreground">{e.word}</span>
              <span className="text-xs text-muted-foreground">{e.expected}</span>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={handleRestart} disabled={saving}>
            <RotateCcw className="w-4 h-4 mr-1" /> 다시 학습
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 sm:p-8 space-y-6 border-primary/20">
      {/* Progress */}
      <div className="flex items-center justify-between text-xs font-semibold">
        <span className="text-primary">단어 학습 (PRE) · {idx + 1} / {total}</span>
        <span className="text-muted-foreground">
          단계: {phase === "listen" ? "듣기 → 따라하기" : "스펠링 입력"}
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-primary to-accent transition-all"
          style={{ width: `${((idx + (phase === "spell" ? 0.5 : 0)) / total) * 100}%` }}
        />
      </div>

      {/* Image placeholder */}
      <div className="rounded-2xl bg-gradient-to-br from-secondary to-muted aspect-[16/8] sm:aspect-[16/6] flex flex-col items-center justify-center gap-2 border border-border">
        <ImageIcon className="w-10 h-10 text-muted-foreground/60" />
        <span className="text-[11px] uppercase tracking-widest text-muted-foreground">
          단어 이미지
        </span>
      </div>

      {/* Korean meaning hint (PRE이므로 노출 — 학습용) */}
      <div className="text-center">
        <div className="text-xs text-muted-foreground mb-1">뜻</div>
        <div className="text-lg font-bold text-foreground">{current.expected}</div>
      </div>

      {phase === "listen" ? (
        <ListenPanel
          word={current.word}
          syllables={syllables}
          onContinue={() => setPhase("spell")}
        />
      ) : (
        <SpellPanel
          inputRef={inputRef}
          input={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          attempts={attempts}
          revealed={revealed}
          answer={current.word}
          onListenAgain={() => setPhase("listen")}
        />
      )}
    </Card>
  );
};

// ───────────────────────── 듣기 / 따라하기 ─────────────────────────

const ListenPanel = ({
  word,
  syllables,
  onContinue,
}: {
  word: string;
  syllables: string[];
  onContinue: () => void;
}) => {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [listenedAll, setListenedAll] = useState(false);

  const playOne = (i: number) => {
    setActiveIdx(i);
    speakChunk(syllables[i], { rate: 0.7 });
  };

  const playAll = async () => {
    for (let i = 0; i < syllables.length; i++) {
      setActiveIdx(i);
      speakChunk(syllables[i], { rate: 0.7 });
      // 음성 길이만큼 대기 (대략적)
      await new Promise((r) => setTimeout(r, Math.max(450, syllables[i].length * 110)));
    }
    setActiveIdx(null);
    speakWord(word);
    setListenedAll(true);
  };

  return (
    <div className="space-y-5">
      <div className="text-center">
        <div className="text-xs text-muted-foreground mb-2">단어</div>
        <div className="text-4xl sm:text-5xl font-extrabold tracking-tight text-foreground">
          {word}
        </div>
      </div>

      <div>
        <div className="text-xs text-muted-foreground mb-2 text-center">
          음절을 하나씩 눌러 들어보세요
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {syllables.map((s, i) => (
            <button
              key={`${s}-${i}`}
              type="button"
              onClick={() => playOne(i)}
              className={cn(
                "group relative px-4 py-3 rounded-xl border-2 font-bold text-lg transition-all",
                "hover:border-primary hover:bg-primary/5",
                activeIdx === i
                  ? "border-primary bg-primary text-primary-foreground scale-105 shadow-lg"
                  : "border-border bg-card text-foreground",
              )}
            >
              <Volume2 className="w-3 h-3 absolute top-1.5 right-1.5 opacity-60" />
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 justify-center">
        <Button variant="outline" onClick={playAll} className="min-w-40">
          <Volume2 className="w-4 h-4 mr-1" /> 전체 듣기 (따라하기)
        </Button>
        <Button onClick={onContinue} disabled={!listenedAll} className="min-w-40">
          스펠링 입력으로 →
        </Button>
      </div>
      {!listenedAll && (
        <p className="text-center text-xs text-muted-foreground">
          전체 듣기를 한 번 들어야 다음으로 넘어갈 수 있어요.
        </p>
      )}
    </div>
  );
};

// ───────────────────────── 스펠링 입력 ─────────────────────────

const SpellPanel = ({
  inputRef,
  input,
  onChange,
  onSubmit,
  attempts,
  revealed,
  answer,
  onListenAgain,
}: {
  inputRef: React.RefObject<HTMLInputElement>;
  input: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  attempts: number;
  revealed: boolean;
  answer: string;
  onListenAgain: () => void;
}) => {
  return (
    <div className="space-y-4">
      <div className="text-center text-xs text-muted-foreground">
        들은 단어를 정확하게 입력하세요 (대소문자 무시)
      </div>
      <div className="flex gap-2 max-w-md mx-auto">
        <Input
          ref={inputRef}
          value={input}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onSubmit();
            }
          }}
          placeholder="spelling…"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          maxLength={50}
          className="text-lg font-mono"
        />
        <Button onClick={onSubmit} disabled={!input.trim()}>
          제출
        </Button>
      </div>

      <div className="flex items-center justify-center gap-2 text-xs">
        <Button variant="ghost" size="sm" onClick={onListenAgain}>
          <Volume2 className="w-3 h-3 mr-1" /> 다시 듣기
        </Button>
        <span className="text-muted-foreground">시도 {attempts} / 2</span>
        {attempts >= 1 && !revealed && (
          <span className="inline-flex items-center text-destructive">
            <X className="w-3 h-3 mr-0.5" /> 다시 시도
          </span>
        )}
      </div>

      {revealed && (
        <div className="rounded-lg border-2 border-primary/40 bg-primary/5 p-3 text-center space-y-1.5">
          <div className="flex items-center justify-center gap-1 text-xs font-bold text-primary">
            <Eye className="w-3.5 h-3.5" /> 정답 공개
          </div>
          <div className="text-2xl font-extrabold text-primary tracking-wide font-mono">
            {answer}
          </div>
          <div className="text-xs text-muted-foreground">
            정답을 그대로 한 번 더 입력하면 통과합니다.
          </div>
        </div>
      )}
    </div>
  );
};

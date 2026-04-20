import { useEffect, useMemo, useRef, useState } from "react";
import { Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { speakChunk, speakWord, splitIntoSyllables } from "@/lib/syllables";

interface Props {
  word: string;
  onFinish: (score: number) => void;
}

/** 1단계 — 음절 각인. 모든 음절을 1번 이상 클릭 → 전체 발음 자동 → onFinish */
export const SyllablePanel = ({ word, onFinish }: Props) => {
  const syllables = useMemo(() => splitIntoSyllables(word), [word]);
  const [clicked, setClicked] = useState<Set<number>>(new Set());
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const finishedRef = useRef(false);

  useEffect(() => {
    finishedRef.current = false;
    setClicked(new Set());
    setActiveIdx(null);
  }, [word]);

  const playOne = (i: number) => {
    setActiveIdx(i);
    speakChunk(syllables[i], { rate: 0.7 });
    setClicked((prev) => {
      if (prev.has(i)) return prev;
      const next = new Set(prev);
      next.add(i);
      return next;
    });
  };

  // 모든 음절 클릭 → 자동 전체발음 + onFinish
  useEffect(() => {
    if (finishedRef.current) return;
    if (syllables.length === 0) return;
    if (clicked.size < syllables.length) return;
    finishedRef.current = true;
    const score = 100;
    const t = setTimeout(() => {
      speakWord(word);
      setTimeout(() => onFinish(score), 1100);
    }, 250);
    return () => clearTimeout(t);
  }, [clicked, syllables, word, onFinish]);

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
          모든 음절을 한 번씩 눌러 들어보세요
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {syllables.map((s, i) => {
            const done = clicked.has(i);
            return (
              <button
                key={`${s}-${i}`}
                type="button"
                onClick={() => playOne(i)}
                className={cn(
                  "group relative px-4 py-3 rounded-xl border-2 font-bold text-lg transition-all",
                  "hover:border-primary hover:bg-primary/5",
                  activeIdx === i
                    ? "border-primary bg-primary text-primary-foreground scale-105 shadow-lg"
                    : done
                      ? "border-emerald-500/60 bg-emerald-500/10 text-foreground"
                      : "border-border bg-card text-foreground",
                )}
              >
                <Volume2 className="w-3 h-3 absolute top-1.5 right-1.5 opacity-60" />
                {s}
              </button>
            );
          })}
        </div>
        <div className="text-center text-[11px] text-muted-foreground mt-2">
          {clicked.size} / {syllables.length} 음절 들음
        </div>
      </div>
    </div>
  );
};

import { useEffect, useMemo, useRef, useState } from "react";
import { Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { speakChunk, speakWord, splitIntoSyllables } from "@/lib/syllables";

interface Props {
  word: string;
  onFinish: (score: number) => void;
}

/** 1단계 — 음절 각인. 모든 음절 클릭 → 마지막 음절 재생 끝난 뒤 통단어 자동 재생 → onFinish */
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

  const playFullWordThenFinish = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setActiveIdx(null);
    // 짧은 텀 후 통단어 발음 → 끝나면 onFinish
    setTimeout(() => {
      speakWord(word, () => {
        setTimeout(() => onFinish(100), 600);
      });
    }, 350);
  };

  const playOne = (i: number) => {
    if (finishedRef.current) return;
    setActiveIdx(i);

    const willCompleteAll = !clicked.has(i) && clicked.size + 1 >= syllables.length;

    speakChunk(syllables[i], { rate: 0.7 }, () => {
      if (willCompleteAll) {
        playFullWordThenFinish();
      }
    });

    setClicked((prev) => {
      if (prev.has(i)) return prev;
      const next = new Set(prev);
      next.add(i);
      return next;
    });
  };

  // 단어가 한 음절이거나 분리 결과가 없으면 통단어 1회 재생 후 통과
  useEffect(() => {
    if (finishedRef.current) return;
    if (syllables.length <= 1) {
      finishedRef.current = true;
      const t = setTimeout(() => {
        speakWord(word, () => {
          setTimeout(() => onFinish(100), 600);
        });
      }, 250);
      return () => clearTimeout(t);
    }
  }, [syllables, word, onFinish]);

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

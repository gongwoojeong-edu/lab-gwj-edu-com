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
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  useEffect(() => {
    finishedRef.current = false;
    setClicked(new Set());
    setActiveIdx(null);
  }, [word]);

  const playFullWordThenFinish = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setActiveIdx(null);
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      onFinishRef.current(100);
    };
    window.setTimeout(finish, 4000); // TTS 실패 대비 안전 타이머
    setTimeout(() => {
      speakWord(word, () => {
        setTimeout(finish, 600);
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
  const autoWordRef = useRef<string | null>(null);
  useEffect(() => {
    if (syllables.length > 1) return;
    if (autoWordRef.current === word) return;
    autoWordRef.current = word;
    finishedRef.current = true;

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      onFinishRef.current(100);
    };
    // TTS가 막히거나 onend가 오지 않아도 반드시 진행되도록 안전 타이머
    const fallback = window.setTimeout(finish, 4000);
    const t = window.setTimeout(() => {
      speakWord(word, () => {
        window.setTimeout(finish, 600);
      });
    }, 250);

    return () => {
      window.clearTimeout(t);
      window.clearTimeout(fallback);
    };
  }, [syllables.length, word]);

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

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Check, X, RotateCcw } from "lucide-react";
import {
  englishWordsFromText,
  englishWordsFromTokens,
  scramblePass,
  shuffleArray,
  type MemDirection,
} from "@/lib/memorizationText";
import type { SentenceToken } from "@/data/sentences";
import { cn } from "@/lib/utils";

interface Props {
  english: string;
  korean: string;
  tokens: SentenceToken[];
  direction: MemDirection;
  onPassed: () => void;
}

export const MemScrambleStep = ({
  english,
  korean,
  tokens,
  direction,
  onPassed,
}: Props) => {
  const expected = useMemo(() => {
    if (direction === "ko_to_en") {
      const fromTokens = englishWordsFromTokens(tokens);
      return fromTokens.length > 0 ? fromTokens : englishWordsFromText(english);
    }
    return korean
      .split(/(?:[,，/]|(?:\s*;\s*)|(?:\.\s+(?=[가-힣])))/)
      .map((s) => s.trim())
      .filter(Boolean);
  }, [direction, tokens, english, korean]);

  const [pool, setPool] = useState<string[]>(() => shuffleArray(expected));
  const [selected, setSelected] = useState<string[]>([]);
  const [result, setResult] = useState<"idle" | "pass" | "fail">("idle");

  const pick = (word: string, idx: number) => {
    setSelected((s) => [...s, word]);
    setPool((p) => p.filter((_, i) => i !== idx));
    setResult("idle");
  };

  const unpick = (idx: number) => {
    const word = selected[idx];
    setSelected((s) => s.filter((_, i) => i !== idx));
    setPool((p) => [...p, word]);
    setResult("idle");
  };

  const reset = () => {
    setPool(shuffleArray(expected));
    setSelected([]);
    setResult("idle");
  };

  const check = () => {
    const ok = scramblePass(selected, expected);
    setResult(ok ? "pass" : "fail");
    if (ok) onPassed();
  };

  const prompt =
    direction === "ko_to_en"
      ? "한글 뜻을 보고 영단어를 올바른 순서로 배열하세요."
      : "영문을 보고 한글 어구를 올바른 순서로 배열하세요.";

  return (
    <Card className="p-5 space-y-4">
      <div className="space-y-1">
        <h3 className="font-bold">B. 어순 배열</h3>
        <p className="text-sm text-muted-foreground">{prompt}</p>
      </div>

      <p className="text-sm font-medium bg-primary/5 rounded-lg p-3 leading-relaxed">
        {direction === "ko_to_en" ? korean || english : english}
      </p>

      <div className="min-h-[44px] flex flex-wrap gap-2 p-3 rounded-lg border border-dashed border-border bg-muted/30">
        {selected.length === 0 ? (
          <span className="text-xs text-muted-foreground">여기에 순서대로 배열…</span>
        ) : (
          selected.map((w, i) => (
            <button
              key={`${w}-${i}`}
              type="button"
              onClick={() => unpick(i)}
              className="px-2.5 py-1 rounded-full bg-primary text-primary-foreground text-sm font-medium"
            >
              {w}
            </button>
          ))
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {pool.map((w, i) => (
          <button
            key={`${w}-p-${i}`}
            type="button"
            onClick={() => pick(w, i)}
            className={cn(
              "px-2.5 py-1 rounded-full border text-sm font-medium transition",
              "bg-background hover:bg-accent border-border",
            )}
          >
            {w}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Button onClick={check} disabled={selected.length !== expected.length}>
          확인
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={reset}>
          <RotateCcw className="w-4 h-4 mr-1" /> 초기화
        </Button>
        {result === "pass" && (
          <span className="inline-flex items-center gap-1 text-emerald-600 text-sm font-bold">
            <Check className="w-4 h-4" /> 통과!
          </span>
        )}
        {result === "fail" && (
          <span className="inline-flex items-center gap-1 text-amber-600 text-sm font-bold">
            <X className="w-4 h-4" /> 순서가 맞지 않아요
          </span>
        )}
      </div>
    </Card>
  );
};

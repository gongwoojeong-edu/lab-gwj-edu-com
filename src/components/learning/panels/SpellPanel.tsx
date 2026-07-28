import { useEffect, useRef, useState } from "react";
import { Eye, Volume2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { speakWord } from "@/lib/syllables";
import { toast } from "@/hooks/use-toast";

interface Props {
  word: string;
  onFinish: (score: number) => void;
}

// 공백/구두점 무시 + 소문자 비교
const normSpell = (s: string) =>
  s
    .trim()
    .replace(/\s+/g, "")
    .replace(/[’‘‛`´]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/[.,~!?·…/()'"\-]/g, "")
    .toLowerCase();
const isMatch = (a: string, b: string) => normSpell(a) === normSpell(b);

/** 3단계 — 스펠링. 1트 100, 1오답+정답 90, 2오답+정답공개+재입력 80 */
export const SpellPanel = ({ word, onFinish }: Props) => {
  const [input, setInput] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const finishedRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    finishedRef.current = false;
    setInput("");
    setAttempts(0);
    setRevealed(false);
    const t = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, [word]);

  const submit = () => {
    if (finishedRef.current) return;
    if (!input.trim()) return;
    const ok = isMatch(input, word);
    if (ok) {
      finishedRef.current = true;
      // attempts: 0 = 1트 정답(100), 1 = 1오답 후 정답(90), 2+ = 정답공개 후 재입력(80)
      const score = attempts === 0 ? 100 : attempts === 1 ? 90 : 80;
      toast({ title: "정답!", description: word });
      setTimeout(() => onFinish(score), 500);
      return;
    }
    const next = attempts + 1;
    setAttempts(next);
    if (next >= 2) {
      setRevealed(true);
      toast({
        title: "정답을 확인하세요",
        description: `정답: ${word} — 그대로 한 번 더 입력하면 통과`,
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

  return (
    <div className="space-y-4">
      <div className="text-center">
        <div className="text-xs text-muted-foreground mb-1">한글 뜻을 보고 스펠링 입력</div>
        <div className="flex items-center justify-center gap-2 mt-2">
          <Button variant="ghost" size="sm" onClick={() => speakWord(word)}>
            <Volume2 className="w-3 h-3 mr-1" /> 발음 듣기
          </Button>
        </div>
      </div>
      <div className="flex gap-2 max-w-md mx-auto">
        <Input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
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
        <Button onClick={submit} disabled={!input.trim()}>
          제출
        </Button>
      </div>

      <div className="flex items-center justify-center gap-2 text-xs">
        <span className="text-muted-foreground">시도 {attempts}</span>
        {attempts >= 1 && !revealed && (
          <span className="inline-flex items-center text-destructive">
            <X className="w-3 h-3 mr-0.5" /> 다시 시도
          </span>
        )}
      </div>

      {revealed && (
        <div className="rounded-lg border-2 border-primary/40 bg-primary/5 p-3 text-center space-y-1.5 max-w-md mx-auto">
          <div className="flex items-center justify-center gap-1 text-xs font-bold text-primary">
            <Eye className="w-3.5 h-3.5" /> 정답 공개
          </div>
          <div className="text-2xl font-extrabold text-primary tracking-wide font-mono">
            {word}
          </div>
          <div className="text-xs text-muted-foreground">
            정답을 그대로 입력하면 80점으로 통과합니다.
          </div>
        </div>
      )}
    </div>
  );
};

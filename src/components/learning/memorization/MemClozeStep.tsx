import { useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Check, X } from "lucide-react";
import {
  buildClozeBlanks,
  buildKoreanClozeBlanks,
  type ClozeBlank,
  type MemDirection,
} from "@/lib/memorizationText";
import type { SentenceToken } from "@/data/sentences";
import { cn } from "@/lib/utils";

interface Props {
  english: string;
  korean: string;
  tokens: SentenceToken[];
  blankIds: string[];
  koreanChunks?: string[];
  direction: MemDirection;
  onPassed: () => void;
}

export const MemClozeStep = ({
  english,
  korean,
  tokens,
  blankIds,
  koreanChunks,
  direction,
  onPassed,
}: Props) => {
  const blanks = useMemo((): ClozeBlank[] => {
    if (direction === "en_to_ko") {
      return buildKoreanClozeBlanks(korean, koreanChunks);
    }
    return buildClozeBlanks(tokens, blankIds);
  }, [direction, tokens, blankIds, korean, koreanChunks]);

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<"idle" | "pass" | "fail">("idle");

  const allFilled = blanks.length > 0 && blanks.every((b) => answers[b.id]);

  const check = () => {
    const ok = blanks.every(
      (b) => (answers[b.id] ?? "").trim() === b.word.trim(),
    );
    setResult(ok ? "pass" : "fail");
    if (ok) onPassed();
  };

  const renderEnglishCloze = () => {
    const parts: ReactNode[] = [];
    let remaining = english;
    for (const b of blanks) {
      const re = new RegExp(`\\b${b.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
      const m = remaining.match(re);
      if (!m || m.index == null) continue;
      parts.push(<span key={`pre-${b.id}`}>{remaining.slice(0, m.index)}</span>);
      parts.push(blankSelect(b));
      remaining = remaining.slice(m.index + m[0].length);
    }
    parts.push(<span key="tail">{remaining}</span>);
    return parts;
  };

  const blankSelect = (b: ClozeBlank) => (
    <span key={b.id} className="inline-block mx-0.5 align-baseline">
      <select
        className={cn(
          "text-sm font-bold rounded border px-1 py-0.5 min-w-[80px]",
          answers[b.id] ? "border-primary bg-primary/5" : "border-dashed border-muted-foreground",
        )}
        value={answers[b.id] ?? ""}
        onChange={(e) => {
          setAnswers((a) => ({ ...a, [b.id]: e.target.value }));
          setResult("idle");
        }}
      >
        <option value="">______</option>
        {b.options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </span>
  );

  const renderKoreanCloze = () => {
    const parts: ReactNode[] = [];
    let remaining = korean;
    for (const b of blanks) {
      const idx = remaining.indexOf(b.word);
      if (idx < 0) continue;
      parts.push(<span key={`pre-${b.id}`}>{remaining.slice(0, idx)}</span>);
      parts.push(blankSelect(b));
      remaining = remaining.slice(idx + b.word.length);
    }
    parts.push(<span key="tail">{remaining}</span>);
    return parts;
  };

  return (
    <Card className="p-5 space-y-4">
      <div className="space-y-1">
        <h3 className="font-bold">C. 빈칸 채우기</h3>
        <p className="text-sm text-muted-foreground">
          {direction === "ko_to_en"
            ? "한글 힌트를 참고해 영문 빈칸을 채우세요."
            : "영문을 보고 한글 빈칸을 채우세요."}
        </p>
      </div>

      {direction === "ko_to_en" && korean && (
        <p className="text-sm bg-muted/50 rounded-lg p-3">{korean}</p>
      )}
      {direction === "en_to_ko" && (
        <p className="text-sm bg-muted/50 rounded-lg p-3">{english}</p>
      )}

      <p className="text-base leading-relaxed font-medium">
        {direction === "ko_to_en" ? renderEnglishCloze() : renderKoreanCloze()}
      </p>

      {blanks.length === 0 && (
        <p className="text-xs text-amber-600">빈칸 데이터가 없습니다. 다음 단계로 건너뛸 수 있습니다.</p>
      )}

      <div className="flex items-center gap-2">
        <Button onClick={check} disabled={!allFilled && blanks.length > 0}>
          확인
        </Button>
        {blanks.length === 0 && (
          <Button variant="outline" onClick={onPassed}>
            건너뛰기
          </Button>
        )}
        {result === "pass" && (
          <span className="inline-flex items-center gap-1 text-emerald-600 text-sm font-bold">
            <Check className="w-4 h-4" /> 통과!
          </span>
        )}
        {result === "fail" && (
          <span className="inline-flex items-center gap-1 text-amber-600 text-sm font-bold">
            <X className="w-4 h-4" /> 빈칸을 다시 확인해 주세요
          </span>
        )}
      </div>
    </Card>
  );
};

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Check, X } from "lucide-react";
import {
  buildPartialDictationSegments,
  partialDictationPass,
  type MemDirection,
} from "@/lib/memorizationText";

interface Props {
  english: string;
  korean: string;
  direction: MemDirection;
  blankRatio: number;
  onPassed: () => void;
}

export const MemDictationStep = ({
  english,
  korean,
  direction,
  blankRatio,
  onPassed,
}: Props) => {
  const expected = direction === "ko_to_en" ? english : korean;
  const hint = direction === "ko_to_en" ? korean : english;

  const segments = useMemo(
    () => buildPartialDictationSegments(expected, blankRatio, direction),
    [expected, blankRatio, direction],
  );

  const blankCount = segments.filter((s) => s.type === "blank").length;
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<"idle" | "pass" | "fail">("idle");

  const check = () => {
    const ok = partialDictationPass(segments, answers, direction);
    setResult(ok ? "pass" : "fail");
    if (ok) onPassed();
  };

  return (
    <Card className="p-5 space-y-4">
      <div className="space-y-1">
        <h3 className="font-bold">D. 받아쓰기</h3>
        <p className="text-sm text-muted-foreground">
          {direction === "ko_to_en"
            ? "한글 힌트를 보고 영문의 빈칸만 채우세요."
            : "영문을 보고 한글 해석의 빈칸만 채우세요."}
        </p>
        <p className="text-[11px] text-muted-foreground">
          빈칸 {blankCount}개 · 비율 {Math.round(blankRatio * 100)}% (전체 받아쓰기 아님)
        </p>
      </div>

      {hint && (
        <div className="text-sm bg-muted/50 rounded-lg p-3">
          <span className="text-[11px] font-semibold text-muted-foreground mr-2">힌트</span>
          {hint}
        </div>
      )}

      <div className="text-base leading-loose flex flex-wrap items-baseline gap-x-1 gap-y-2 p-4 rounded-lg border bg-card">
        {segments.map((seg, i) =>
          seg.type === "text" ? (
            <span key={`t-${i}`} className="whitespace-pre-wrap">
              {seg.value}
            </span>
          ) : (
            <Input
              key={seg.id}
              value={answers[seg.id] ?? ""}
              onChange={(e) => {
                setAnswers((a) => ({ ...a, [seg.id]: e.target.value }));
                setResult("idle");
              }}
              className="inline-flex h-8 w-[min(140px,28vw)] text-sm px-2 border-b-2 border-primary/40 rounded-none border-x-0 border-t-0 bg-transparent"
              placeholder="…"
            />
          ),
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button
          onClick={check}
          disabled={segments.some((s) => s.type === "blank" && !(answers[s.id]?.trim()))}
        >
          확인
        </Button>
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

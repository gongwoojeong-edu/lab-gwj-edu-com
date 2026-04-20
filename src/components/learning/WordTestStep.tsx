import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Check, X } from "lucide-react";
import { insertWordTestResult, type WordTestItem } from "@/integrations/supabase/storage";
import { isAnswerCorrect, type WordTestEntry } from "@/lib/wordTestBuilder";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface Props {
  sentenceId: string;
  entries: WordTestEntry[];
  onPassed: () => void;
}

const PASS_THRESHOLD = 0.8;

export const WordTestStep = ({ sentenceId, entries, onPassed }: Props) => {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [graded, setGraded] = useState<Record<string, boolean> | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const score = useMemo(() => {
    if (!graded) return 0;
    const correct = Object.values(graded).filter(Boolean).length;
    return entries.length === 0 ? 0 : correct / entries.length;
  }, [graded, entries.length]);

  const handleSubmit = async () => {
    if (entries.length === 0) {
      toast({ title: "테스트할 단어가 없습니다", description: "분석 단계에서 단어 의미를 먼저 입력하세요." });
      return;
    }
    const items: WordTestItem[] = entries.map((e) => {
      const given = answers[e.ownerId] ?? "";
      return { word: e.word, expected: e.expected, given, correct: isAnswerCorrect(given, e.expected) };
    });
    const correctCount = items.filter((i) => i.correct).length;
    const sc = correctCount / items.length;
    const passed = sc >= PASS_THRESHOLD;
    const map: Record<string, boolean> = {};
    entries.forEach((e, i) => {
      map[e.ownerId] = items[i].correct;
    });
    setGraded(map);
    setSubmitting(true);
    try {
      await insertWordTestResult(sentenceId, items, sc, passed);
      if (passed) {
        toast({ title: `🎉 통과! ${Math.round(sc * 100)}점` });
        onPassed();
      } else {
        toast({
          title: `${Math.round(sc * 100)}점 — 80점 이상 필요`,
          variant: "destructive",
        });
      }
    } catch (e) {
      toast({ title: "저장 실패", description: String(e), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (entries.length === 0) {
    return (
      <Card className="p-4 text-sm text-muted-foreground">
        테스트할 단어가 없습니다. 분석 단계에서 명사·동사·형용사·부사의 한글 뜻을 입력해 주세요.
      </Card>
    );
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">단어 테스트 (POST) — {entries.length}개</div>
        {graded && (
          <div className="text-sm">
            점수: <span className="font-bold">{Math.round(score * 100)}</span> / 100
            {score >= PASS_THRESHOLD ? (
              <span className="ml-2 text-emerald-600 dark:text-emerald-400">PASS</span>
            ) : (
              <span className="ml-2 text-destructive">FAIL</span>
            )}
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {entries.map((e) => {
          const isGraded = graded != null;
          const correct = isGraded ? graded[e.ownerId] : undefined;
          return (
            <div
              key={e.ownerId}
              className={cn(
                "flex items-center gap-2 p-2 rounded-md border",
                isGraded && correct && "border-emerald-500/50 bg-emerald-500/5",
                isGraded && !correct && "border-destructive/50 bg-destructive/5",
              )}
            >
              <span className="font-semibold min-w-[6rem]">{e.word}</span>
              <Input
                value={answers[e.ownerId] ?? ""}
                onChange={(ev) => setAnswers((p) => ({ ...p, [e.ownerId]: ev.target.value }))}
                placeholder="한글 뜻"
                className="h-8"
              />
              {isGraded && correct && <Check className="w-4 h-4 text-emerald-600" />}
              {isGraded && !correct && (
                <span className="text-xs text-destructive whitespace-nowrap">
                  <X className="w-3 h-3 inline" /> {e.expected}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex justify-end">
        <Button onClick={handleSubmit} disabled={submitting}>
          {graded ? "다시 제출" : "제출"}
        </Button>
      </div>
    </Card>
  );
};

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Check, X, Trophy, Flame, Gem, RefreshCw, AlertTriangle } from "lucide-react";
import {
  insertWordTestResult,
  markLatestRemediationDone,
  fetchWordTestAttemptCount,
  type WordTestItem,
  type WrongWord,
} from "@/integrations/supabase/storage";
import type { WordTestEntry } from "@/lib/wordTestBuilder";
import {
  buildQuestions,
  isQuestionCorrect,
  MODE_LABEL,
  type WordTestMode,
  type Question,
} from "@/lib/wordTest";
import { fetchStudentRewards, grantPassReward, resetStreakOnFail } from "@/lib/rewards";
import { WordPreStep } from "@/components/learning/WordPreStep";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface Props {
  sentenceId: string;
  entries: WordTestEntry[];
  onPassed: () => void;
}

type Phase = "intro" | "quiz" | "result" | "remediation" | "remediation_done";

export const WordTestStep = ({ sentenceId, entries, onPassed }: Props) => {
  const [phase, setPhase] = useState<Phase>("intro");
  const [mode, setMode] = useState<WordTestMode>("mixed");
  const [threshold, setThreshold] = useState(0.8);
  const [attemptNo, setAttemptNo] = useState(1);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [graded, setGraded] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [wrongWords, setWrongWords] = useState<WrongWord[]>([]);
  const [score, setScore] = useState(0);
  const [passed, setPassed] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const r = await fetchStudentRewards();
      const a = await fetchWordTestAttemptCount(sentenceId);
      if (!mounted) return;
      if (r) setThreshold(r.threshold);
      setAttemptNo(a + 1);
    })();
    return () => {
      mounted = false;
    };
  }, [sentenceId]);

  const startQuiz = () => {
    if (entries.length === 0) {
      toast({ title: "테스트할 단어가 없습니다", variant: "destructive" });
      return;
    }
    setQuestions(buildQuestions(entries, mode, attemptNo));
    setIdx(0);
    setAnswers({});
    setGraded({});
    setPhase("quiz");
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const cur = questions[idx];

  const advance = () => {
    if (!cur) return;
    const given = answers[cur.ownerId] ?? "";
    const correct = isQuestionCorrect(cur, given);
    setGraded((g) => ({ ...g, [cur.ownerId]: correct }));
    if (idx + 1 < questions.length) {
      setIdx(idx + 1);
      setTimeout(() => inputRef.current?.focus(), 30);
    } else {
      void finalize({ ...graded, [cur.ownerId]: correct });
    }
  };

  const finalize = async (finalGraded: Record<string, boolean>) => {
    const items: WordTestItem[] = questions.map((q) => {
      const given = answers[q.ownerId] ?? "";
      return { word: q.word, expected: q.expected, given, correct: !!finalGraded[q.ownerId] };
    });
    const correctCount = items.filter((i) => i.correct).length;
    const sc = correctCount / items.length;
    const isPass = sc >= threshold;
    const wrong: WrongWord[] = items.filter((i) => !i.correct).map((i) => ({
      word: i.word,
      expected: i.expected,
      given: i.given,
    }));
    setScore(sc);
    setPassed(isPass);
    setWrongWords(wrong);
    setSubmitting(true);
    try {
      await insertWordTestResult(sentenceId, items, sc, isPass, {
        mode,
        attempt_no: attemptNo,
        wrong_words: wrong,
        remediation_done: false,
      });
      if (isPass) {
        const r = await grantPassReward(sentenceId, sc, attemptNo);
        if (r) {
          toast({
            title: `🎉 통과! +${r.delta}P · 🔥 연속 ${r.streak}회`,
            description: `누적 ${r.totalPoints}P${r.milestoneHit ? " · 연속 보너스!" : ""}`,
          });
        }
      } else {
        await resetStreakOnFail();
      }
      setPhase("result");
    } catch (e) {
      toast({ title: "저장 실패", description: String(e), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const goRemediation = () => setPhase("remediation");

  const onRemediationDone = async () => {
    try {
      await markLatestRemediationDone(sentenceId);
    } catch (e) {
      // best-effort
      console.warn("remediation flag save failed", e);
    }
    setPhase("remediation_done");
  };

  const startRetry = () => {
    setAttemptNo((n) => n + 1);
    setPhase("intro");
  };

  // Build wrong-only entries for WordPreStep remediation
  const wrongEntries: WordTestEntry[] = useMemo(
    () =>
      wrongWords
        .map((w) => entries.find((e) => e.word === w.word))
        .filter(Boolean) as WordTestEntry[],
    [wrongWords, entries],
  );

  if (entries.length === 0) {
    return (
      <Card className="p-4 text-sm text-muted-foreground">
        테스트할 단어가 없습니다. 분석 단계에서 명사·동사·형용사·부사의 한글 뜻을 입력해 주세요.
      </Card>
    );
  }

  // ---------- INTRO ----------
  if (phase === "intro") {
    return (
      <Card className="p-6 space-y-5 border-primary/30 bg-gradient-to-br from-primary/5 to-accent/5">
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wider">3. 단어 테스트</div>
          <div className="text-lg font-extrabold text-foreground">시험 모드 선택</div>
          <div className="text-xs text-muted-foreground mt-1">
            {entries.length}문제 · 통과 기준 {Math.round(threshold * 100)}점 · 시도 {attemptNo}회
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(MODE_LABEL) as WordTestMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                "px-3 py-3 rounded-xl border-2 text-xs font-bold transition-all",
                mode === m
                  ? "border-primary bg-primary text-primary-foreground shadow"
                  : "border-border bg-card text-foreground hover:border-primary/50",
              )}
            >
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>
        <div className="flex justify-end">
          <Button onClick={startQuiz} size="lg">시작하기 →</Button>
        </div>
      </Card>
    );
  }

  // ---------- QUIZ ----------
  if (phase === "quiz" && cur) {
    const progress = ((idx) / questions.length) * 100;
    return (
      <Card className="p-6 sm:p-8 space-y-6 border-primary/20">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-primary">
              {idx + 1} / {questions.length}
            </span>
            <span className="text-muted-foreground">
              {cur.kind === "spell" ? "스펠링 쓰기" : "뜻 쓰기 (초성힌트)"}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary to-accent transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="text-center space-y-2 py-4">
          {cur.kind === "spell" ? (
            <>
              <div className="text-xs text-muted-foreground">다음 뜻의 영단어 스펠링은?</div>
              <div className="text-3xl font-extrabold text-foreground">{cur.expected}</div>
            </>
          ) : (
            <>
              <div className="text-xs text-muted-foreground">다음 단어의 한글 뜻은?</div>
              <div className="text-3xl font-extrabold text-foreground">{cur.word}</div>
              <div className="text-base font-bold text-primary tracking-[0.3em]">{cur.hint}</div>
            </>
          )}
        </div>

        <Input
          ref={inputRef}
          value={answers[cur.ownerId] ?? ""}
          onChange={(e) => setAnswers((p) => ({ ...p, [cur.ownerId]: e.target.value }))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              advance();
            }
          }}
          placeholder={cur.kind === "spell" ? "영단어 입력" : "한글 뜻 입력"}
          className="h-14 text-center text-xl font-bold"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
        />

        <div className="flex justify-end">
          <Button onClick={advance} size="lg" disabled={submitting}>
            {idx + 1 === questions.length ? "제출" : "다음 →"}
          </Button>
        </div>
      </Card>
    );
  }

  // ---------- RESULT ----------
  if (phase === "result") {
    return (
      <Card
        className={cn(
          "p-6 sm:p-8 space-y-5 border-2",
          passed
            ? "border-emerald-500/50 bg-emerald-50/30 dark:bg-emerald-500/5"
            : "border-destructive/50 bg-destructive/5",
        )}
      >
        <div className="flex items-center gap-3">
          {passed ? (
            <Trophy className="w-10 h-10 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <AlertTriangle className="w-10 h-10 text-destructive" />
          )}
          <div>
            <div className="text-2xl font-extrabold">
              {Math.round(score * 100)}점{" "}
              <span className={cn("text-base", passed ? "text-emerald-600" : "text-destructive")}>
                / 통과 기준 {Math.round(threshold * 100)}점
              </span>
            </div>
            <div className="text-sm font-bold">
              {passed ? (
                <span className="text-emerald-600 dark:text-emerald-400">PASS 🎉</span>
              ) : (
                <span className="text-destructive">FAIL — 틀린 단어 복습이 필요해요</span>
              )}
            </div>
          </div>
        </div>

        {wrongWords.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              틀린 단어 ({wrongWords.length})
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {wrongWords.map((w) => (
                <div
                  key={w.word}
                  className="flex items-center justify-between gap-2 p-2 rounded-md border border-destructive/40 bg-card"
                >
                  <span className="font-bold">{w.word}</span>
                  <span className="text-xs text-muted-foreground truncate">{w.expected}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2">
          {passed ? (
            <Button size="lg" onClick={onPassed}>
              <Check className="w-4 h-4 mr-1" /> 학습 홈으로
            </Button>
          ) : (
            <Button size="lg" onClick={goRemediation}>
              틀린 단어 복습 시작 →
            </Button>
          )}
        </div>
      </Card>
    );
  }

  // ---------- REMEDIATION (WordPreStep 재사용) ----------
  if (phase === "remediation") {
    return (
      <div className="space-y-3">
        <Card className="p-3 border-amber-500/40 bg-amber-50/40 dark:bg-amber-500/10 text-xs font-bold text-amber-700 dark:text-amber-300">
          🔁 틀린 단어 {wrongEntries.length}개의 4단계 복습을 완료해야 재시험 버튼이 활성화됩니다.
        </Card>
        <WordPreStep
          sentenceId={`${sentenceId}__remediation_${attemptNo}`}
          entries={wrongEntries}
          onCompleted={onRemediationDone}
        />
      </div>
    );
  }

  // ---------- REMEDIATION DONE → RETRY ----------
  return (
    <Card className="p-6 space-y-4 border-primary/30 bg-gradient-to-br from-primary/5 to-accent/5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center">
          <RefreshCw className="w-5 h-5 text-primary" />
        </div>
        <div>
          <div className="text-lg font-extrabold text-primary">복습 완료!</div>
          <div className="text-xs text-muted-foreground">
            이제 재시험을 볼 수 있어요. 통과 기준 {Math.round(threshold * 100)}점.
          </div>
        </div>
      </div>
      <div className="flex justify-end">
        <Button size="lg" onClick={startRetry}>재시험 보기 →</Button>
      </div>
    </Card>
  );
};

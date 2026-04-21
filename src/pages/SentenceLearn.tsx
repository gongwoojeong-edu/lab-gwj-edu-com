import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, LogOut, Lock, Sparkles, Check } from "lucide-react";
import Index from "@/pages/Index";
import { SENTENCES, type Sentence } from "@/data/sentences";
import { signOut } from "@/hooks/useAuth";
import { LEVEL_LABEL } from "@/lib/levels";
import {
  fetchOwnerProgressForSentence,
  fetchSentenceProgress,
  upsertSentenceProgress,
} from "@/integrations/supabase/storage";
import { buildWordTest, type WordTestEntry } from "@/lib/wordTestBuilder";
import { fetchExtraction, extractedToEntries } from "@/lib/wordExtraction";
import { WordPreStep } from "@/components/learning/WordPreStep";
import { TranslationStep } from "@/components/learning/TranslationStep";
import { WordTestStep } from "@/components/learning/WordTestStep";
import { cn } from "@/lib/utils";

import { toast } from "@/hooks/use-toast";

type Step = "pre" | "analysis" | "post";

const STEP_LABELS: Record<Step, string> = {
  pre: "1. 단어 학습",
  analysis: "2. 구문 분석 + 해석",
  post: "3. 단어 테스트",
};

const SentenceLearn = () => {
  const { sentenceId } = useParams<{ sentenceId: string }>();
  const navigate = useNavigate();
  const [sentence, setSentence] = useState<Sentence | null>(null);
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<WordTestEntry[]>([]);
  const [preDone, setPreDone] = useState(false);
  const [analysisDone, setAnalysisDone] = useState(false);
  const [translationDone, setTranslationDone] = useState(false);
  const [step, setStep] = useState<Step>("pre");

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      const found = SENTENCES.find((s) => s.id === sentenceId) ?? null;
      if (!mounted) return;
      setSentence(found);

      if (!found) {
        setLoading(false);
        return;
      }

      // 진행 상태 + entries 빌드
      // 1순위: sentence_word_extractions 캐시 (선생님이 AI로 추출 → 모든 학생 공유)
      // 2순위: owner_progress (스태프 또는 본인) — 안전망
      const [prog, extraction, owners] = await Promise.all([
        fetchSentenceProgress(found.id),
        fetchExtraction(found.id),
        fetchOwnerProgressForSentence(found.id),
      ]);
      if (!mounted) return;

      setPreDone(!!prog?.pre_done);
      setAnalysisDone(!!prog?.analysis_done);
      setTranslationDone(!!prog?.translation_done);

      let built: WordTestEntry[] = [];
      if (extraction && extraction.words.length > 0) {
        built = extractedToEntries(extraction.words);
      } else {
        const ownerSurfaces: Record<string, string> = {};
        found.tokens.forEach((t) => {
          if (t.type === "analyzable") ownerSurfaces[t.id] = t.text;
        });
        const progressMap: Record<string, unknown> = {};
        const completed: string[] = [];
        owners.forEach((o) => {
          progressMap[o.owner_id] = o.progress as object;
          if (o.completed) completed.push(o.owner_id);
        });
        built = buildWordTest(
          ownerSurfaces,
          progressMap as Parameters<typeof buildWordTest>[1],
          completed,
        );
      }
      setEntries(built);

      // 마지막 멈춘 단계로 점프
      if (!prog?.pre_done) setStep("pre");
      else if (!prog?.analysis_done || !prog?.translation_done) setStep("analysis");
      else setStep("post");

      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [sentenceId]);

  const stepStates = useMemo(
    () => ({
      pre: { done: preDone, locked: false },
      analysis: { done: analysisDone && translationDone, locked: !preDone },
      post: { done: false, locked: !(preDone && analysisDone && translationDone) },
    }),
    [preDone, analysisDone, translationDone],
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!sentence) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center bg-background">
        <Card className="p-8 space-y-4 max-w-md">
          <div className="text-xl font-bold text-foreground">문장을 찾을 수 없어요</div>
          <Button onClick={() => navigate("/learn")}>학습 홈으로</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-secondary/30">
      <header className="sticky top-0 z-30 backdrop-blur-md bg-background/70 border-b border-border">
        <div className="max-w-5xl mx-auto px-5 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Button variant="ghost" size="sm" onClick={() => navigate("/learn")}>
              <ArrowLeft className="w-4 h-4 mr-1" />
              <span className="hidden sm:inline">홈</span>
            </Button>
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground">
                {LEVEL_LABEL[sentence.level]} · {sentence.id}
              </div>
              <div className="text-sm font-bold text-foreground truncate max-w-[60vw]">
                {sentence.english}
              </div>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => signOut()}>
            <LogOut className="w-4 h-4 mr-1" />
            <span className="hidden sm:inline">로그아웃</span>
          </Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-6 space-y-5">
        {/* Step tabs */}
        <div className="flex gap-2">
          {(Object.keys(STEP_LABELS) as Step[]).map((k) => {
            const s = stepStates[k];
            const active = step === k;
            return (
              <button
                key={k}
                onClick={() => !s.locked && setStep(k)}
                disabled={s.locked}
                className={cn(
                  "flex-1 px-3 py-2.5 rounded-lg border-2 text-xs font-bold transition-all",
                  active
                    ? "border-primary bg-primary text-primary-foreground shadow"
                    : s.done
                      ? "border-primary/40 bg-primary/5 text-primary"
                      : s.locked
                        ? "border-border bg-muted text-muted-foreground cursor-not-allowed opacity-70"
                        : "border-border bg-card text-foreground hover:border-primary/40",
                )}
              >
                <div className="flex items-center justify-center gap-1.5">
                  {s.locked && <Lock className="w-3 h-3" />}
                  {STEP_LABELS[k]}
                </div>
              </button>
            );
          })}
        </div>

        {/* Step content */}
        {step === "pre" && (
          entries.length === 0 ? (
            <Card className="p-6 space-y-3 border-primary/30 bg-gradient-to-br from-primary/5 to-accent/5">
              <div className="flex items-center gap-2 text-primary">
                <Sparkles className="w-4 h-4" />
                <div className="text-sm font-bold">아직 단어가 준비되지 않았어요</div>
              </div>
              <p className="text-sm text-foreground/80">
                선생님이 이 문장의 단어 추출을 아직 하지 않았어요. 잠시 후 다시 시도해 주세요.
              </p>
              <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
                새로고침
              </Button>
            </Card>
          ) : (
            <WordPreStep
              sentenceId={sentence.id}
              entries={entries}
              onCompleted={async () => {
                setPreDone(true);
                try {
                  await upsertSentenceProgress(sentence.id, { pre_done: true });
                } catch (e) {
                  toast({
                    title: "진행 저장 실패",
                    description: String(e),
                    variant: "destructive",
                  });
                }
                setStep("analysis");
              }}
            />
          )
        )}

        {step === "analysis" && (
          <div className="space-y-4">
            {/* ① 구문 분석 — Index 분석기 임베드 */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2 px-1">
                <div className="text-xs font-bold text-primary uppercase tracking-wider">
                  ① 구문 분석
                </div>
                {analysisDone && (
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                    <Check className="w-3.5 h-3.5" /> 분석 완료
                  </span>
                )}
              </div>
              <div className="rounded-2xl border border-border/60 bg-card/40 overflow-hidden">
                <Index
                  embedMode
                  embedSentenceId={sentence.id}
                  onAnalysisDone={() => setAnalysisDone(true)}
                />
              </div>
            </div>

            {/* ② 한글 해석 입력 */}
            <div className="space-y-1.5">
              <div className="text-xs font-bold text-primary uppercase tracking-wider px-1">
                ② 한글 해석
              </div>
              <TranslationStep
                sentenceId={sentence.id}
                englishSentence={sentence.english}
                onSubmitted={async () => {
                  try {
                    await upsertSentenceProgress(sentence.id, { translation_done: true });
                    setTranslationDone(true);
                  } catch (e) {
                    toast({
                      title: "저장 실패",
                      description: String(e),
                      variant: "destructive",
                    });
                  }
                }}
              />
            </div>

            {/* 다음 단계로 */}
            {analysisDone && translationDone && (
              <Card className="p-4 border-emerald-500/40 bg-emerald-50/40 dark:bg-emerald-500/10 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-bold text-emerald-700 dark:text-emerald-300">
                  <Check className="w-4 h-4" />
                  분석 + 해석 완료
                </div>
                <Button size="sm" onClick={() => setStep("post")}>
                  다음: 단어 테스트 →
                </Button>
              </Card>
            )}
          </div>
        )}

        {step === "post" && (
          <WordTestStep
            sentenceId={sentence.id}
            entries={entries}
            onPassed={() => navigate("/learn")}
          />
        )}
      </main>
    </div>
  );
};

export default SentenceLearn;

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, LogOut, Lock } from "lucide-react";
import { SENTENCES, type Sentence } from "@/data/sentences";
import { signOut } from "@/hooks/useAuth";
import { LEVEL_LABEL } from "@/lib/levels";
import { fetchOwnerProgressForSentence } from "@/integrations/supabase/storage";
import { buildWordTest, type WordTestEntry } from "@/lib/wordTestBuilder";
import { fetchSentenceProgress } from "@/integrations/supabase/storage";
import { WordPreStep } from "@/components/learning/WordPreStep";
import { cn } from "@/lib/utils";

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

      // 진행 상태 + entries 빌드 (본인 progress 기준)
      const [prog, owners] = await Promise.all([
        fetchSentenceProgress(found.id),
        fetchOwnerProgressForSentence(found.id),
      ]);
      if (!mounted) return;

      setPreDone(!!prog?.pre_done);
      setAnalysisDone(!!prog?.analysis_done);
      setTranslationDone(!!prog?.translation_done);

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
      const built = buildWordTest(
        ownerSurfaces,
        progressMap as Parameters<typeof buildWordTest>[1],
        completed,
      );
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
          <WordPreStep
            sentenceId={sentence.id}
            entries={entries}
            onCompleted={() => {
              setPreDone(true);
              setStep("analysis");
            }}
          />
        )}

        {step === "analysis" && (
          <Card className="p-6 space-y-3 border-primary/30 bg-gradient-to-br from-primary/5 to-accent/5">
            <div className="text-sm font-bold text-primary">
              구문 분석 + 한글 해석 (다음 라운드에서 통합)
            </div>
            <p className="text-sm text-foreground/80">
              본 라운드에서는 PRE 단어학습만 동작합니다. 다음 라운드에서 분석기를 임베드하고 하단에
              해석 입력창을 통합합니다.
            </p>
          </Card>
        )}

        {step === "post" && (
          <Card className="p-6 space-y-3">
            <div className="text-sm font-bold">3. 단어 테스트 (다음 라운드)</div>
            <p className="text-sm text-muted-foreground">분석/해석 완료 후 활성화됩니다.</p>
          </Card>
        )}
      </main>
    </div>
  );
};

export default SentenceLearn;

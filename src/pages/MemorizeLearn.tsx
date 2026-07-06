import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2, Trophy, AlertCircle } from "lucide-react";
import { hydrateSentencesFromDb, loadSentenceByCode } from "@/lib/sentenceSource";
import type { Sentence } from "@/data/sentences";
import { fetchTaskModeForSentence } from "@/lib/fetchTaskMode";
import { fetchMemPassageByCode, type MemPassageData } from "@/lib/fetchMemPassage";
import { TASK_MODE_LABEL, showsMemorizeLearn, type TaskMode } from "@/lib/taskMode";
import { useAuth } from "@/hooks/useAuth";
import { fetchSentenceProgress } from "@/integrations/supabase/storage";
import {
  firstIncompleteMemStep,
  markMemStepDone,
  memFlagsFromProgress,
  type MemStep,
} from "@/lib/memorizationProgress";
import {
  DEFAULT_MEM_DIRECTION,
  MEM_DIRECTION_LABEL,
  type MemDirection,
} from "@/lib/memorizationText";
import { MemStepProgressBar } from "@/components/learning/memorization/MemStepProgressBar";
import { MemListenStep } from "@/components/learning/memorization/MemListenStep";
import { MemScrambleStep } from "@/components/learning/memorization/MemScrambleStep";
import { MemClozeStep } from "@/components/learning/memorization/MemClozeStep";
import { speakChunk } from "@/lib/syllables";
import { resolveNextSentence } from "@/lib/nextSentence";

const MemorizeLearn = () => {
  const { sentenceId } = useParams<{ sentenceId: string }>();
  const navigate = useNavigate();
  const { roles } = useAuth();
  const isStaff = roles.includes("teacher") || roles.includes("admin");

  const [sentence, setSentence] = useState<Sentence | null>(null);
  const [passage, setPassage] = useState<MemPassageData | null>(null);
  const [taskMode, setTaskMode] = useState<TaskMode | null>(null);
  const [analysisPassed, setAnalysisPassed] = useState(false);
  const [step, setStep] = useState<MemStep>("listen");
  const [memFlags, setMemFlags] = useState(memFlagsFromProgress(null));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const direction: MemDirection = DEFAULT_MEM_DIRECTION;

  const load = useCallback(async () => {
    if (!sentenceId) return;
    setLoading(true);
    setError(null);
    try {
      await hydrateSentencesFromDb(true);
      const found = await loadSentenceByCode(sentenceId);
      if (!found) {
        setError("지문을 찾을 수 없습니다.");
        return;
      }
      const [ctx, memPassage, prog] = await Promise.all([
        fetchTaskModeForSentence(sentenceId),
        fetchMemPassageByCode(sentenceId),
        fetchSentenceProgress(sentenceId),
      ]);
      const analysisOk = prog?.status === "pass";
      if (!showsMemorizeLearn(ctx.taskMode, analysisOk) && !isStaff) {
        setError("이 지문은 문장암기 대상이 아닙니다.");
        return;
      }
      if (memPassage?.mem_status !== "ready" && !isStaff) {
        setError("선생님이 아직 암기 콘텐츠를 공개하지 않았습니다.");
        return;
      }
      const flags = memFlagsFromProgress(prog);
      setSentence(found);
      setPassage(memPassage);
      setTaskMode(ctx.taskMode);
      setAnalysisPassed(analysisOk);
      setMemFlags(flags);
      setStep(flags.mem_passed_at ? "cloze" : firstIncompleteMemStep(flags));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [sentenceId, isStaff]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!passage || memFlags.mem_listen_done) return;
    speakChunk(passage.english, { rate: 0.82, lang: "en-US" });
  }, [passage, memFlags.mem_listen_done]);

  const handleStepPassed = async (s: MemStep) => {
    if (!sentenceId || saving) return;
    setSaving(true);
    try {
      const next = await markMemStepDone(sentenceId, s, direction);
      setMemFlags(next);
      if (next.mem_passed_at) return;
      if (s === "listen") setStep("scramble");
      else if (s === "scramble") setStep("cloze");
    } finally {
      setSaving(false);
    }
  };

  const goNextSentence = async () => {
    const r = await resolveNextSentence();
    if (r.sentence) {
      navigate(`/learn/sentence/${encodeURIComponent(r.sentence.id)}/memorize`);
    } else {
      navigate("/learn");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !sentence || !passage) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6">
        <AlertCircle className="w-10 h-10 text-muted-foreground" />
        <p className="text-muted-foreground text-center">{error ?? "지문 없음"}</p>
        <Button variant="outline" onClick={() => navigate("/learn")}>
          홈으로
        </Button>
      </div>
    );
  }

  const passed = !!memFlags.mem_passed_at;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b bg-background/90 backdrop-blur px-4 py-3 space-y-2">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/learn")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-muted-foreground">문장암기</div>
            <div className="font-bold truncate">{sentence.id}</div>
          </div>
          {taskMode && (
            <Badge variant="secondary">{TASK_MODE_LABEL[taskMode]}</Badge>
          )}
        </div>
        <MemStepProgressBar
          current={step}
          listenDone={memFlags.mem_listen_done}
          scrambleDone={memFlags.mem_scramble_done}
          clozeDone={memFlags.mem_cloze_done}
        />
      </header>

      <main className="max-w-2xl mx-auto p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline">{MEM_DIRECTION_LABEL[direction]}</Badge>
          <span>선생님 지정 방향</span>
        </div>

        {passed ? (
          <Card className="p-8 text-center space-y-4">
            <Trophy className="w-14 h-14 mx-auto text-violet-600" />
            <h2 className="text-xl font-bold">문장암기 완료!</h2>
            <p className="text-sm text-muted-foreground">
              듣기 · 어순 · 빈칸 단계를 모두 통과했습니다.
            </p>
            <div className="flex flex-wrap justify-center gap-2 pt-2">
              <Button onClick={() => void goNextSentence()}>다음 지문</Button>
              <Button variant="outline" onClick={() => navigate("/learn")}>
                홈으로
              </Button>
            </div>
          </Card>
        ) : (
          <>
            {step === "listen" && !memFlags.mem_listen_done && (
              <MemListenStep
                english={passage.english}
                korean={passage.korean}
                direction={direction}
                onPassed={() => void handleStepPassed("listen")}
              />
            )}
            {step === "scramble" && memFlags.mem_listen_done && !memFlags.mem_scramble_done && (
              <MemScrambleStep
                english={passage.english}
                korean={passage.korean}
                tokens={passage.mem_tokens}
                direction={direction}
                onPassed={() => void handleStepPassed("scramble")}
              />
            )}
            {step === "cloze" && memFlags.mem_scramble_done && !memFlags.mem_cloze_done && (
              <MemClozeStep
                english={passage.english}
                korean={passage.korean}
                tokens={passage.mem_tokens}
                blankIds={passage.mem_cloze_spec.blankIds}
                direction={direction}
                onPassed={() => void handleStepPassed("cloze")}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default MemorizeLearn;

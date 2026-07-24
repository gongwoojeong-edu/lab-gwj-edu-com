import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2, Trophy, AlertCircle } from "lucide-react";
import { hydrateSentencesFromDb, loadSentenceByCode } from "@/lib/sentenceSource";
import type { Sentence } from "@/data/sentences";
import { fetchTaskModeForSentence } from "@/lib/fetchTaskMode";
import { fetchMemPassageByCode, type MemPassageData } from "@/lib/fetchMemPassage";
import {
  activeMemTrack,
  displayDirectionLabel,
  fetchMemSettingsForSentence,
} from "@/lib/fetchMemSettings";
import { TASK_MODE_LABEL, showsMemorizeLearn, type TaskMode } from "@/lib/taskMode";
import { useAuth } from "@/hooks/useAuth";
import { fetchSentenceProgress } from "@/integrations/supabase/storage";
import {
  firstIncompleteMemStep,
  markMemStepDone,
  memFlagsFromProgress,
  resetMemProgressForRetry,
  type MemStep,
} from "@/lib/memorizationProgress";
import type { MemDirection } from "@/lib/memorizationText";
import { MemStepProgressBar } from "@/components/learning/memorization/MemStepProgressBar";
import { MemListenStep } from "@/components/learning/memorization/MemListenStep";
import { MemScrambleStep } from "@/components/learning/memorization/MemScrambleStep";
import { MemClozeStep } from "@/components/learning/memorization/MemClozeStep";
import { MemDictationStep } from "@/components/learning/memorization/MemDictationStep";
import { MemSpeechStep } from "@/components/learning/memorization/MemSpeechStep";
import { MemRecordStep } from "@/components/learning/memorization/MemRecordStep";
import { resolveNextSentence } from "@/lib/nextSentence";

const MEM_STEP_ORDER = (requireRecord: boolean) =>
  requireRecord
    ? (["listen", "scramble", "cloze", "dictation", "speech", "record"] as const)
    : (["listen", "scramble", "cloze", "dictation", "speech"] as const);

const MemorizeLearn = () => {
  const { sentenceId } = useParams<{ sentenceId: string }>();
  const navigate = useNavigate();
  const { roles } = useAuth();
  const isStaff = roles.includes("teacher") || roles.includes("admin");

  const [sentence, setSentence] = useState<Sentence | null>(null);
  const [passage, setPassage] = useState<MemPassageData | null>(null);
  const [taskMode, setTaskMode] = useState<TaskMode | null>(null);
  const [memSettings, setMemSettings] = useState<Awaited<ReturnType<typeof fetchMemSettingsForSentence>> | null>(null);
  const [memFlags, setMemFlags] = useState(memFlagsFromProgress(null));
  const [step, setStep] = useState<MemStep>("listen");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [secondTrackBanner, setSecondTrackBanner] = useState(false);

  const activeDirection: MemDirection = useMemo(() => {
    if (!memSettings) return "ko_to_en";
    return activeMemTrack(memSettings.directionSetting, memFlags.mem_ko_to_en_done);
  }, [memSettings, memFlags.mem_ko_to_en_done]);

  const requireRecord = memSettings?.requireRecord ?? false;

  const load = useCallback(async () => {
    if (!sentenceId) return;
    setLoading(true);
    setError(null);
    setSecondTrackBanner(false);
    try {
      await hydrateSentencesFromDb(true);
      const found = await loadSentenceByCode(sentenceId);
      if (!found) {
        setError("지문을 찾을 수 없습니다.");
        return;
      }
      const [ctx, memPassage, prog, settings] = await Promise.all([
        fetchTaskModeForSentence(sentenceId),
        fetchMemPassageByCode(sentenceId),
        fetchSentenceProgress(sentenceId),
        fetchMemSettingsForSentence(sentenceId),
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
      setMemSettings(settings);
      setMemFlags(flags);
      setStep(flags.mem_passed_at ? "speech" : firstIncompleteMemStep(flags, settings.requireRecord));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [sentenceId, isStaff]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleStepPassed = async (s: MemStep, extra?: { dictationScore?: number }) => {
    if (!sentenceId || saving || !memSettings) return;
    setSaving(true);
    try {
      const next = await markMemStepDone(sentenceId, s, {
        activeDirection,
        directionSetting: memSettings.directionSetting,
        requireRecord,
        dictationScore: extra?.dictationScore,
      });
      setMemFlags(next);
      if (next.advancedToSecondTrack) {
        setSecondTrackBanner(true);
        setStep("listen");
        return;
      }
      if (next.mem_passed_at) return;
      const order = [...MEM_STEP_ORDER(requireRecord)];
      const idx = order.indexOf(s);
      if (idx >= 0 && idx < order.length - 1) setStep(order[idx + 1]);
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

  if (error || !sentence || !passage || !memSettings) {
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
  const dirLabel = displayDirectionLabel(memSettings.directionSetting, activeDirection);

  const stepProps = {
    sentenceId: sentence.id,
    english: passage.english,
    korean: passage.korean,
    direction: activeDirection,
  };

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
          {taskMode && <Badge variant="secondary">{TASK_MODE_LABEL[taskMode]}</Badge>}
        </div>
        <MemStepProgressBar
          current={step}
          listenDone={memFlags.mem_listen_done}
          scrambleDone={memFlags.mem_scramble_done}
          clozeDone={memFlags.mem_cloze_done}
          dictationDone={memFlags.mem_dictation_done}
          speechDone={memFlags.mem_speech_done}
          recordDone={memFlags.mem_record_done}
          requireRecord={requireRecord}
        />
      </header>

      <main className="max-w-2xl mx-auto p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline">{dirLabel}</Badge>
          <span>선생님 지정</span>
        </div>

        {secondTrackBanner && (
          <Card className="p-3 bg-violet-500/10 border-violet-500/30 text-sm">
            한→영 트랙 완료! 이제 <strong>영→한</strong> 트랙을 진행합니다.
          </Card>
        )}

        {passed ? (
          <Card className="p-8 text-center space-y-4">
            <Trophy className="w-14 h-14 mx-auto text-violet-600" />
            <h2 className="text-xl font-bold">문장암기 완료!</h2>
            <p className="text-sm text-muted-foreground">
              {requireRecord
                ? "듣기 · 어순 · 빈칸 · 받아쓰기 · 발화 · 녹음을 모두 통과했습니다."
                : "듣기 · 어순 · 빈칸 · 받아쓰기 · 발화를 모두 통과했습니다."}
            </p>
            <div className="flex flex-wrap justify-center gap-2 pt-2">
              <Button onClick={() => void goNextSentence()}>다음 지문</Button>
              {memSettings.unitId && (
                <Button variant="secondary" asChild>
                  <Link to={`/learn/unit/${memSettings.unitId}/flow`}>단락흐름암기</Link>
                </Button>
              )}
              <Button variant="outline" onClick={() => navigate("/learn")}>
                홈으로
              </Button>
            </div>
          </Card>
        ) : (
          <>
            {step === "listen" && !memFlags.mem_listen_done && (
              <MemListenStep {...stepProps} onPassed={() => void handleStepPassed("listen")} />
            )}
            {step === "scramble" && memFlags.mem_listen_done && !memFlags.mem_scramble_done && (
              <MemScrambleStep
                {...stepProps}
                tokens={passage.mem_tokens}
                onPassed={() => void handleStepPassed("scramble")}
              />
            )}
            {step === "cloze" && memFlags.mem_scramble_done && !memFlags.mem_cloze_done && (
              <MemClozeStep
                {...stepProps}
                tokens={passage.mem_tokens}
                blankIds={passage.mem_cloze_spec.blankIds}
                koreanChunks={passage.mem_korean_chunks}
                onPassed={() => void handleStepPassed("cloze")}
              />
            )}
            {step === "dictation" && memFlags.mem_cloze_done && !memFlags.mem_dictation_done && (
              <MemDictationStep
                {...stepProps}
                blankRatio={memSettings.dictationBlankRatio}
                minScore={memSettings.dictationMinScore}
                onPassed={(score) => void handleStepPassed("dictation", { dictationScore: score })}
              />
            )}
            {step === "speech" && memFlags.mem_dictation_done && !memFlags.mem_speech_done && (
              <MemSpeechStep {...stepProps} onPassed={() => void handleStepPassed("speech")} />
            )}
            {step === "record" && requireRecord && memFlags.mem_speech_done && !memFlags.mem_record_done && (
              <MemRecordStep
                sentenceId={sentence.id}
                {...stepProps}
                onPassed={() => void handleStepPassed("record")}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default MemorizeLearn;

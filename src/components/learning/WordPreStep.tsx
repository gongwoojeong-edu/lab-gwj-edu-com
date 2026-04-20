import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, RotateCcw } from "lucide-react";
import type { WordTestEntry } from "@/lib/wordTestBuilder";
import { fetchLatestWordPre, insertWordPreResult, type AssistEntry } from "@/lib/wordPre";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  WordStageProgressBar,
  PASS_THRESHOLD,
  type StageKey,
  type StageScores,
} from "./WordStageProgressBar";
import { SyllablePanel } from "./panels/SyllablePanel";
import { SpeakPanel } from "./panels/SpeakPanel";
import { SpellPanel } from "./panels/SpellPanel";
import { MeaningPanel } from "./panels/MeaningPanel";

interface Props {
  sentenceId: string;
  entries: WordTestEntry[];
  onCompleted: () => void;
}

const STAGE_ORDER: StageKey[] = ["syllable", "speak", "spell", "meaning"];
const STAGE_LABEL_FULL: Record<StageKey, string> = {
  syllable: "① 음절각인",
  speak: "② 발화",
  spell: "③ 스펠링",
  meaning: "④ 의미인출",
};

type StageMeta = { stuck?: boolean; teacherSkipped?: boolean; lastHeard?: string };
type FlagType = "stuck" | "teacher_skip";

const emptyScores = (): StageScores => ({ syllable: 0, speak: 0, spell: 0, meaning: 0 });

export const WordPreStep = ({ sentenceId, entries, onCompleted }: Props) => {
  const [stageIdx, setStageIdx] = useState(0);
  const [wordIdx, setWordIdx] = useState(0);
  const [passedPerStage, setPassedPerStage] = useState<Record<StageKey, number>>({
    syllable: 0,
    speak: 0,
    spell: 0,
    meaning: 0,
  });
  const [perWordScores, setPerWordScores] = useState<Record<string, StageScores>>({});
  const [perWordFlags, setPerWordFlags] = useState<
    Record<string, Partial<Record<StageKey, FlagType>>>
  >({});
  const [assistEntries, setAssistEntries] = useState<AssistEntry[]>([]);
  const [attemptNonce, setAttemptNonce] = useState(0); // bump to remount panel on retry

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [showStamp, setShowStamp] = useState(false);
  const [roundIntro, setRoundIntro] = useState<StageKey | null>(null);

  const total = entries.length;
  const stage = STAGE_ORDER[stageIdx];
  const current = entries[wordIdx];

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    fetchLatestWordPre(sentenceId).then((r) => {
      if (!mounted) return;
      if (r?.completed) {
        setDone(true);
      } else {
        setDone(false);
        resetAll();
        // show first round intro
        setRoundIntro("syllable");
        setTimeout(() => mounted && setRoundIntro(null), 1200);
      }
      setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [sentenceId]);

  const resetAll = () => {
    setStageIdx(0);
    setWordIdx(0);
    setPassedPerStage({ syllable: 0, speak: 0, spell: 0, meaning: 0 });
    setPerWordScores({});
    setPerWordFlags({});
    setAssistEntries([]);
    setAttemptNonce(0);
  };

  const saveResults = async (
    scoresMap: Record<string, StageScores>,
    flagsMap: Record<string, Partial<Record<StageKey, FlagType>>>,
    log: AssistEntry[],
  ) => {
    setSaving(true);
    try {
      const known: string[] = [];
      const unknown: string[] = [];
      entries.forEach((e) => {
        const s = scoresMap[e.word] ?? emptyScores();
        const f = flagsMap[e.word] ?? {};
        const spellPerfect = s.spell >= 100;
        const anyAssist = Object.values(f).some((v) => v === "stuck" || v === "teacher_skip");
        if (!spellPerfect || anyAssist) unknown.push(e.word);
        else known.push(e.word);
      });
      await insertWordPreResult(sentenceId, known, unknown, log);
      setDone(true);
      toast({ title: "단어 학습 완료", description: `${known.length}개 단어 통과` });
      onCompleted();
    } catch (e) {
      toast({ title: "저장 실패", description: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleStageFinish = (score: number, meta?: StageMeta) => {
    if (!current) return;

    const safetyPassed = !!(meta?.stuck || meta?.teacherSkipped);
    const stagePassed = score >= PASS_THRESHOLD || safetyPassed;

    if (!stagePassed) {
      toast({
        title: "다시 시도해 주세요",
        description: `${score}% — 90% 이상이어야 다음으로 넘어가요`,
        variant: "destructive",
      });
      setAttemptNonce((n) => n + 1);
      return;
    }

    // Record score + flag for this word/stage
    const prevScores = perWordScores[current.word] ?? emptyScores();
    const nextScoresForWord: StageScores = { ...prevScores, [stage]: score };
    const nextScoresMap = { ...perWordScores, [current.word]: nextScoresForWord };
    setPerWordScores(nextScoresMap);

    let nextFlagsMap = perWordFlags;
    if (meta?.stuck || meta?.teacherSkipped) {
      const flag: FlagType = meta.teacherSkipped ? "teacher_skip" : "stuck";
      const prevFlags = perWordFlags[current.word] ?? {};
      nextFlagsMap = {
        ...perWordFlags,
        [current.word]: { ...prevFlags, [stage]: flag },
      };
      setPerWordFlags(nextFlagsMap);
    }

    let nextAssist = assistEntries;
    if (meta?.stuck || meta?.teacherSkipped) {
      const entry: AssistEntry = {
        word: current.word,
        stage: stage as AssistEntry["stage"],
        type: meta.teacherSkipped ? "teacher_skip" : "stuck",
        attempts: meta.stuck ? 10 : 0,
        lastHeard: meta.lastHeard,
      };
      nextAssist = [...assistEntries, entry];
      setAssistEntries(nextAssist);
      if (meta.teacherSkipped) {
        toast({
          title: "🔓 선생님 패스키 통과",
          description: `${current.word} · ${STAGE_LABEL_FULL[stage]} — 기록되었습니다`,
        });
      }
    }

    // bump passed counter for this stage
    const nextPassed = { ...passedPerStage, [stage]: passedPerStage[stage] + 1 };
    setPassedPerStage(nextPassed);

    // advance word within stage
    if (wordIdx + 1 < total) {
      setWordIdx(wordIdx + 1);
      setAttemptNonce((n) => n + 1);
      return;
    }

    // stage round complete → next stage or finish
    if (stageIdx + 1 < STAGE_ORDER.length) {
      const nextStage = STAGE_ORDER[stageIdx + 1];
      setRoundIntro(nextStage);
      setTimeout(() => {
        setRoundIntro(null);
        setStageIdx(stageIdx + 1);
        setWordIdx(0);
        setAttemptNonce((n) => n + 1);
      }, 1200);
      return;
    }

    // all stages done
    setShowStamp(true);
    setTimeout(() => {
      setShowStamp(false);
      void saveResults(nextScoresMap, nextFlagsMap, nextAssist);
    }, 1600);
  };

  if (loading) {
    return <Card className="p-6 text-sm text-muted-foreground">불러오는 중…</Card>;
  }
  if (total === 0) {
    return (
      <Card className="p-6 text-sm text-muted-foreground">
        학습할 단어가 없습니다.
      </Card>
    );
  }

  if (done) {
    return (
      <Card className="p-6 sm:p-8 space-y-5 border-primary/30 bg-gradient-to-br from-primary/5 to-accent/5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center">
            <Check className="w-5 h-5 text-primary" />
          </div>
          <div>
            <div className="text-lg font-extrabold text-primary">단어 학습 통과</div>
            <div className="text-xs text-muted-foreground">
              {total} 단어 모두 4단계를 통과했어요.
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
          {entries.map((e) => {
            const flags = perWordFlags[e.word] ?? {};
            const teacherStages = (Object.entries(flags) as [StageKey, FlagType][])
              .filter(([, v]) => v === "teacher_skip")
              .map(([k]) => STAGE_LABEL_FULL[k]);
            const stuckStages = (Object.entries(flags) as [StageKey, FlagType][])
              .filter(([, v]) => v === "stuck")
              .map(([k]) => STAGE_LABEL_FULL[k]);
            return (
              <div
                key={e.word}
                className={cn(
                  "p-2 rounded-md border bg-card flex flex-col gap-0.5",
                  teacherStages.length
                    ? "border-amber-500/60 bg-amber-50/40 dark:bg-amber-500/10"
                    : stuckStages.length
                      ? "border-destructive/40"
                      : "border-primary/20",
                )}
              >
                <span className="font-semibold text-foreground flex items-center gap-1">
                  {e.word}
                  {teacherStages.length > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold">
                      🔓 선생님
                    </span>
                  )}
                </span>
                <span className="text-xs text-muted-foreground">{e.expected}</span>
                {teacherStages.length > 0 && (
                  <span className="text-[10px] text-amber-600 dark:text-amber-400">
                    패스키 통과: {teacherStages.join(", ")}
                  </span>
                )}
                {stuckStages.length > 0 && (
                  <span className="text-[10px] text-destructive">
                    안전망: {stuckStages.join(", ")}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              resetAll();
              setDone(false);
              setRoundIntro("syllable");
              setTimeout(() => setRoundIntro(null), 1200);
            }}
            disabled={saving}
          >
            <RotateCcw className="w-4 h-4 mr-1" /> 다시 학습
          </Button>
        </div>
      </Card>
    );
  }

  const panelKey = `${stage}-${wordIdx}-${attemptNonce}`;

  return (
    <>
      <Card className="p-6 sm:p-8 space-y-6 border-primary/20 mb-32">
        <div className="text-center">
          <div className="text-xs text-muted-foreground mb-1">뜻</div>
          <div className="text-lg font-bold text-foreground">{current.expected}</div>
        </div>

        {stage === "syllable" && (
          <SyllablePanel key={panelKey} word={current.word} onFinish={handleStageFinish} />
        )}
        {stage === "speak" && (
          <SpeakPanel key={panelKey} word={current.word} onFinish={handleStageFinish} />
        )}
        {stage === "spell" && (
          <SpellPanel key={panelKey} word={current.word} onFinish={handleStageFinish} />
        )}
        {stage === "meaning" && (
          <MeaningPanel
            key={panelKey}
            word={current.word}
            expected={current.expected}
            onFinish={handleStageFinish}
          />
        )}
      </Card>

      {roundIntro && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none bg-background/60 backdrop-blur-sm">
          <div className="px-8 py-6 rounded-2xl border-2 border-primary bg-card shadow-2xl text-center animate-in zoom-in-50 duration-300">
            <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
              라운드 시작
            </div>
            <div className="text-2xl font-extrabold text-primary">
              {STAGE_LABEL_FULL[roundIntro]} 라운드
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              단어 {total}개 연속 진행
            </div>
          </div>
        </div>
      )}

      {showStamp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none bg-background/40 backdrop-blur-sm">
          <div className="w-44 h-44 rounded-full border-8 border-primary bg-primary/10 flex items-center justify-center animate-in zoom-in-50 duration-500">
            <div className="text-center">
              <Check className="w-14 h-14 mx-auto text-primary" />
              <div className="text-xl font-extrabold text-primary mt-1">PASS</div>
            </div>
          </div>
        </div>
      )}

      <WordStageProgressBar
        totalWords={total}
        currentStage={stage}
        currentWord={current.word}
        wordIndex={wordIdx}
        passedPerStage={passedPerStage}
        perWordFlags={perWordFlags}
      />
    </>
  );
};

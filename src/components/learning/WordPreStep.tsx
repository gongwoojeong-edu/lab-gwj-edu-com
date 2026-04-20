import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, RotateCcw } from "lucide-react";
import type { WordTestEntry } from "@/lib/wordTestBuilder";
import { fetchLatestWordPre, insertWordPreResult, type AssistEntry } from "@/lib/wordPre";
import { toast } from "@/hooks/use-toast";
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
const EMPTY_SCORES: StageScores = { syllable: 0, speak: 0, spell: 0, meaning: 0 };

type StageMeta = { stuck?: boolean; teacherSkipped?: boolean; lastHeard?: string };

export const WordPreStep = ({ sentenceId, entries, onCompleted }: Props) => {
  const [idx, setIdx] = useState(0);
  const [stage, setStage] = useState<StageKey>("syllable");
  const [scores, setScores] = useState<StageScores>(EMPTY_SCORES);
  // 단계별 안전망 통과 플래그(이 단어 한정). 단어 넘어갈 때 초기화.
  const [stagePassFlags, setStagePassFlags] = useState<
    Partial<Record<StageKey, "stuck" | "teacher_skip">>
  >({});
  const [perWordResults, setPerWordResults] = useState<
    Array<{ word: string; scores: StageScores }>
  >([]);
  const [assistEntries, setAssistEntries] = useState<AssistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [showStamp, setShowStamp] = useState(false);

  const total = entries.length;
  const current = entries[idx];

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    fetchLatestWordPre(sentenceId).then((r) => {
      if (!mounted) return;
      if (r?.completed) {
        setDone(true);
      } else {
        setDone(false);
        setIdx(0);
        setStage("syllable");
        setScores(EMPTY_SCORES);
        setStagePassFlags({});
        setPerWordResults([]);
        setAssistEntries([]);
      }
      setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [sentenceId]);

  const saveResults = async (
    results: Array<{ word: string; scores: StageScores }>,
    log: AssistEntry[],
  ) => {
    setSaving(true);
    try {
      const known = results.map((r) => r.word);
      // 스펠링 < 100 이거나 어시스트(stuck/teacher_skip)로 통과한 단어를 unknown 으로 분류
      const assistedWords = new Set(log.map((e) => e.word));
      const unknown = results
        .filter((r) => r.scores.spell < 100 || assistedWords.has(r.word))
        .map((r) => r.word);
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
    const nextScores: StageScores = { ...scores, [stage]: score };
    setScores(nextScores);

    const safetyPassed = !!(meta?.stuck || meta?.teacherSkipped);
    const stagePassed = score >= PASS_THRESHOLD || safetyPassed;

    // 어시스트 기록
    let nextAssist = assistEntries;
    if (meta?.stuck && (stage === "speak" || stage === "meaning")) {
      const entry: AssistEntry = {
        word: current.word,
        stage,
        type: "stuck",
        attempts: 10,
        lastHeard: meta.lastHeard,
      };
      nextAssist = [...assistEntries, entry];
      setAssistEntries(nextAssist);
    } else if (meta?.teacherSkipped && (stage === "speak" || stage === "meaning")) {
      const entry: AssistEntry = {
        word: current.word,
        stage,
        type: "teacher_skip",
        attempts: 0,
        lastHeard: meta.lastHeard,
      };
      nextAssist = [...assistEntries, entry];
      setAssistEntries(nextAssist);
    }

    // 단계 미통과 → 같은 단계 재시작 (안전망 미해당 시)
    if (!stagePassed) {
      toast({
        title: "다시 시도해 주세요",
        description: `${score}% — 90% 이상이어야 다음으로 넘어가요`,
        variant: "destructive",
      });
      setTimeout(() => {
        setScores((prev) => ({ ...prev, [stage]: 0 }));
      }, 50);
      return;
    }

    // 안전망 통과 플래그 기록
    let nextFlags = stagePassFlags;
    if (meta?.stuck) {
      nextFlags = { ...stagePassFlags, [stage]: "stuck" };
      setStagePassFlags(nextFlags);
    } else if (meta?.teacherSkipped) {
      nextFlags = { ...stagePassFlags, [stage]: "teacher_skip" };
      setStagePassFlags(nextFlags);
    }

    const stageIdx = STAGE_ORDER.indexOf(stage);
    if (stageIdx < STAGE_ORDER.length - 1) {
      setStage(STAGE_ORDER[stageIdx + 1]);
      return;
    }

    // 4단계까지 모두 종료 → 단어 패스 판정
    const allPass = STAGE_ORDER.every((k) => {
      const s = nextScores[k];
      const flag = nextFlags[k];
      return s >= PASS_THRESHOLD || flag === "stuck" || flag === "teacher_skip";
    });

    if (!allPass) {
      const failed = STAGE_ORDER.find((k) => {
        const s = nextScores[k];
        const flag = nextFlags[k];
        return !(s >= PASS_THRESHOLD || flag === "stuck" || flag === "teacher_skip");
      });
      if (failed) {
        setStage(failed);
        setScores((prev) => ({ ...prev, [failed]: 0 }));
      }
      return;
    }

    const updatedResults = [...perWordResults, { word: current.word, scores: nextScores }];
    setPerWordResults(updatedResults);

    if (idx + 1 >= total) {
      setShowStamp(true);
      setTimeout(() => {
        setShowStamp(false);
        void saveResults(updatedResults, nextAssist);
      }, 1600);
    } else {
      setIdx(idx + 1);
      setStage("syllable");
      setScores(EMPTY_SCORES);
      setStagePassFlags({});
    }
  };

  const handleRestart = () => {
    setIdx(0);
    setStage("syllable");
    setScores(EMPTY_SCORES);
    setStagePassFlags({});
    setPerWordResults([]);
    setAssistEntries([]);
    setDone(false);
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
          {entries.map((e) => (
            <div
              key={e.word}
              className="p-2 rounded-md border border-primary/20 bg-card flex flex-col gap-0.5"
            >
              <span className="font-semibold text-foreground">{e.word}</span>
              <span className="text-xs text-muted-foreground">{e.expected}</span>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={handleRestart} disabled={saving}>
            <RotateCcw className="w-4 h-4 mr-1" /> 다시 학습
          </Button>
        </div>
      </Card>
    );
  }

  const panelKey = `${idx}-${stage}-${scores[stage] === 0 ? "fresh" : "x"}`;

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
        scores={scores}
        wordIndex={idx}
        totalWords={total}
        currentStage={stage}
        currentWord={current.word}
        passedWords={perWordResults.length}
      />
    </>
  );
};

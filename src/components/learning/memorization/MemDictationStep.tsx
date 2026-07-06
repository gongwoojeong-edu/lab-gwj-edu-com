import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ArrowRight, Check, Loader2, Volume2 } from "lucide-react";
import {
  buildPartialDictationSegments,
  partialDictationScore,
  type MemDirection,
} from "@/lib/memorizationText";
import { playPassageAudioEnglish, resolvePassageAudioUrl } from "@/lib/passageAudio";
import { cn } from "@/lib/utils";

interface Props {
  sentenceId: string;
  english: string;
  korean: string;
  direction: MemDirection;
  blankRatio: number;
  minScore: number;
  onPassed: (score: number) => void;
}

export const MemDictationStep = ({
  sentenceId,
  english,
  korean,
  direction,
  blankRatio,
  minScore,
  onPassed,
}: Props) => {
  const expected = direction === "ko_to_en" ? english : korean;
  const hint = direction === "ko_to_en" ? korean : english;

  const segments = useMemo(
    () => buildPartialDictationSegments(expected, blankRatio, direction),
    [expected, blankRatio, direction],
  );

  const blankIds = useMemo(
    () => segments.filter((s) => s.type === "blank").map((s) => s.id),
    [segments],
  );

  const blankCount = blankIds.length;
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [blankResults, setBlankResults] = useState<Record<string, boolean>>({});
  const [correctCount, setCorrectCount] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loadingAudio, setLoadingAudio] = useState(true);
  const autoPlayedRef = useRef(false);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const allFilled = blankIds.every((id) => answers[id]?.trim());

  const playAudio = () => {
    setPlaying(true);
    void playPassageAudioEnglish(sentenceId, english, () => setPlaying(false));
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoadingAudio(true);
      try {
        await resolvePassageAudioUrl(sentenceId);
      } catch {
        /* fallback TTS */
      } finally {
        if (!cancelled) setLoadingAudio(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sentenceId]);

  useEffect(() => {
    if (direction !== "ko_to_en" || loadingAudio || autoPlayedRef.current) return;
    autoPlayedRef.current = true;
    playAudio();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingAudio, direction, sentenceId]);

  const submit = () => {
    if (!allFilled) return;
    const result = partialDictationScore(segments, answers, direction);
    setScore(result.score);
    setBlankResults(result.results);
    setCorrectCount(result.correctCount);
    setSubmitted(true);
  };

  const focusBlank = (id: string) => {
    const el = inputRefs.current[id];
    el?.focus();
    el?.select();
  };

  const handleBlankKeyDown = (segId: string, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (submitted) return;
    const idx = blankIds.indexOf(segId);
    if (idx < 0) return;
    if (idx < blankIds.length - 1) {
      focusBlank(blankIds[idx + 1]);
      return;
    }
    if (allFilled) submit();
    else {
      const nextEmpty = blankIds.find((id) => !answers[id]?.trim());
      if (nextEmpty) focusBlank(nextEmpty);
    }
  };

  const meetsMin = minScore <= 0 || (score != null && score >= minScore);

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
          {minScore > 0 && ` · 권장 ${minScore}점 이상`}
        </p>
      </div>

      {direction === "ko_to_en" && (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={playAudio}
            disabled={playing || loadingAudio}
          >
            {loadingAudio ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <Volume2 className="w-4 h-4 mr-1.5" />
            )}
            {playing ? "재생 중…" : "다시 듣기"}
          </Button>
          <span className="text-[11px] text-muted-foreground">영문 발음을 들으며 빈칸을 채우세요</span>
        </div>
      )}

      {hint ? (
        <div className="text-sm bg-muted/50 rounded-lg p-3">
          <span className="text-[11px] font-semibold text-muted-foreground mr-2">힌트</span>
          {hint}
        </div>
      ) : direction === "ko_to_en" ? (
        <div className="text-sm bg-amber-50 text-amber-800 rounded-lg p-3">
          한글 해석이 없습니다. 오디오를 듣고 빈칸을 채워 주세요.
        </div>
      ) : null}

      <div className="text-base leading-loose flex flex-wrap items-baseline gap-x-1 gap-y-2 p-4 rounded-lg border bg-card">
        {segments.map((seg, i) =>
          seg.type === "text" ? (
            <span key={`t-${i}`} className="whitespace-pre-wrap">
              {seg.value}
            </span>
          ) : (
            <span key={seg.id} className="inline-flex flex-col items-start">
              <Input
                ref={(el) => {
                  inputRefs.current[seg.id] = el;
                }}
                value={answers[seg.id] ?? ""}
                readOnly={submitted}
                onChange={(e) => {
                  setAnswers((a) => ({ ...a, [seg.id]: e.target.value }));
                }}
                onKeyDown={(e) => handleBlankKeyDown(seg.id, e)}
                className={cn(
                  "inline-flex h-8 w-[min(140px,28vw)] text-sm px-2 border-b-2 rounded-none border-x-0 border-t-0 bg-transparent",
                  submitted && blankResults[seg.id] === true && "border-emerald-500 text-emerald-700",
                  submitted && blankResults[seg.id] === false && "border-red-500 text-red-700",
                  !submitted && "border-primary/40",
                )}
                placeholder="…"
              />
              {submitted && blankResults[seg.id] === false && (
                <span className="text-[10px] text-red-600 mt-0.5 px-1">{seg.answer}</span>
              )}
            </span>
          ),
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {!submitted ? (
          <Button onClick={submit} disabled={!allFilled}>
            확인
          </Button>
        ) : (
          <>
            <Button onClick={() => score != null && onPassed(score)}>
              다음 단계
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
            {score != null && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 text-sm font-bold",
                  meetsMin ? "text-emerald-600" : "text-amber-600",
                )}
              >
                <Check className="w-4 h-4" />
                {score}점 ({correctCount}/{blankCount})
                {minScore > 0 && !meetsMin && ` · 기준 ${minScore}점 미달`}
              </span>
            )}
          </>
        )}
      </div>
    </Card>
  );
};

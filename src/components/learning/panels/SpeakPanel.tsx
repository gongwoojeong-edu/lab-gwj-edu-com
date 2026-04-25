import { useEffect, useMemo, useRef, useState } from "react";
import { Mic, MicOff, SkipForward, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { englishMatch, getSpeechRecognition, speechSupported } from "@/lib/speech";
import { speakWord, splitIntoSyllables } from "@/lib/syllables";
import { toast } from "@/hooks/use-toast";
import { TeacherSkipButton } from "@/components/learning/TeacherSkipButton";

interface Props {
  word: string;
  onFinish: (
    score: number,
    meta?: { stuck?: boolean; teacherSkipped?: boolean; lastHeard?: string },
  ) => void;
  /** (선택) 발화 단계 전체 일괄 통과 — 선생님 패스키 확인 후 호출됨 */
  onTeacherAllPass?: () => void;
}

type RecInstance = NonNullable<ReturnType<typeof getSpeechRecognition>> extends new () => infer R
  ? R
  : never;

const STUCK_LIMIT = 10;

/** 2단계 — 영어 STT 발화. 1회 100, 2회 90, 3+ 80, 10회 안전망 70(stuck), 선생님 스킵 90(teacherSkipped) */
export const SpeakPanel = ({ word, onFinish }: Props) => {
  const supported = speechSupported();
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState<string>("");
  const [attempts, setAttempts] = useState(0);
  const finishedRef = useRef(false);
  const recRef = useRef<RecInstance | null>(null);
  const lastHeardRef = useRef<string>("");

  const phonics = useMemo(() => splitIntoSyllables(word).join(" · "), [word]);

  useEffect(() => {
    finishedRef.current = false;
    setHeard("");
    setAttempts(0);
    lastHeardRef.current = "";
    return () => {
      try {
        recRef.current?.abort();
      } catch {
        /* noop */
      }
    };
  }, [word]);

  // 5회 도달 시 보조 안내
  useEffect(() => {
    if (attempts === 5 && !finishedRef.current) {
      toast({
        title: "발음이 어려우면 천천히 또박또박 말해보세요",
        description: `남은 시도 ${STUCK_LIMIT - attempts}회`,
      });
    }
    if (attempts >= STUCK_LIMIT && !finishedRef.current) {
      finishedRef.current = true;
      toast({
        title: "기록 후 다음으로",
        description: `${STUCK_LIMIT}회 시도 — 어려운 단어로 기록합니다`,
      });
      setTimeout(
        () => onFinish(70, { stuck: true, lastHeard: lastHeardRef.current }),
        1200,
      );
    }
  }, [attempts, onFinish]);

  const start = () => {
    const Ctor = getSpeechRecognition();
    if (!Ctor) {
      toast({
        title: "이 브라우저는 음성 인식을 지원하지 않아요",
        description: "Chrome 또는 Edge를 사용해 주세요.",
        variant: "destructive",
      });
      return;
    }
    try {
      const rec = new Ctor();
      rec.lang = "en-US";
      rec.interimResults = false;
      rec.continuous = false;
      rec.maxAlternatives = 3;
      rec.onresult = (e) => {
        let best = "";
        const alts = e.results[0];
        for (let i = 0; i < alts.length; i++) {
          const t = alts[i].transcript;
          if (englishMatch(t, word)) {
            best = t;
            break;
          }
          if (!best) best = t;
        }
        setHeard(best);
        lastHeardRef.current = best;
        const ok = englishMatch(best, word);
        const nextAttempts = attempts + 1;
        setAttempts(nextAttempts);
        if (ok && !finishedRef.current) {
          finishedRef.current = true;
          const score = nextAttempts === 1 ? 100 : nextAttempts === 2 ? 90 : 80;
          toast({ title: "Excellent!", description: `${word} (${best})` });
          setTimeout(() => onFinish(score), 700);
        } else if (!ok) {
          toast({
            title: "다시 시도",
            description: `들린 발음: "${best}" — 시도 ${nextAttempts}/${STUCK_LIMIT}`,
            variant: "destructive",
          });
        }
      };
      rec.onerror = (e) => {
        if (e.error !== "no-speech" && e.error !== "aborted") {
          toast({
            title: "음성 인식 오류",
            description: e.error,
            variant: "destructive",
          });
        }
      };
      rec.onend = () => setListening(false);
      recRef.current = rec;
      setListening(true);
      rec.start();
    } catch (err) {
      setListening(false);
      toast({
        title: "마이크를 시작할 수 없어요",
        description: String(err),
        variant: "destructive",
      });
    }
  };

  const stop = () => {
    try {
      recRef.current?.stop();
    } catch {
      /* noop */
    }
    setListening(false);
  };

  const skip = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onFinish(60);
  };

  const teacherApprove = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onFinish(90, { teacherSkipped: true, lastHeard: lastHeardRef.current });
  };

  return (
    <div className="space-y-5">
      <div className="text-center">
        <div className="text-xs text-muted-foreground mb-1">음소표 보고 발음하기</div>
        <div className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
          {word}
        </div>
        <div className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary text-sm font-mono text-foreground/80">
          {phonics}
        </div>
      </div>

      {listening && (
        <div className="flex flex-col items-center gap-2 py-3 rounded-2xl border-2 border-primary/40 bg-primary/5 animate-in fade-in zoom-in-95 duration-300">
          <div className="relative w-14 h-14 flex items-center justify-center">
            <span className="absolute inset-0 rounded-full bg-primary/30 animate-ping" />
            <span className="absolute inset-1 rounded-full bg-primary/20 animate-pulse" />
            <Mic className="relative w-7 h-7 text-primary" />
          </div>
          <div className="text-sm font-bold text-primary">듣고 있어요…</div>
          <div className="flex items-end gap-1 h-4">
            <span className="w-1 bg-primary rounded-full animate-pulse" style={{ height: "40%", animationDelay: "0ms" }} />
            <span className="w-1 bg-primary rounded-full animate-pulse" style={{ height: "100%", animationDelay: "120ms" }} />
            <span className="w-1 bg-primary rounded-full animate-pulse" style={{ height: "60%", animationDelay: "240ms" }} />
            <span className="w-1 bg-primary rounded-full animate-pulse" style={{ height: "90%", animationDelay: "360ms" }} />
            <span className="w-1 bg-primary rounded-full animate-pulse" style={{ height: "50%", animationDelay: "480ms" }} />
          </div>
        </div>
      )}

      <div className="flex flex-col items-center gap-3">
        <Button
          size="lg"
          variant={listening ? "destructive" : "default"}
          onClick={listening ? stop : start}
          disabled={!supported}
          className="min-w-44"
        >
          {listening ? (
            <>
              <MicOff className="w-4 h-4 mr-2" /> 듣는 중… (탭하여 중지)
            </>
          ) : (
            <>
              <Mic className="w-4 h-4 mr-2" /> 발음하기
            </>
          )}
        </Button>

        {heard && (
          <div className="text-xs text-muted-foreground">
            마지막 인식: <span className="font-mono">{heard}</span>
          </div>
        )}

        <div className="flex items-center gap-2 text-xs">
          <Button variant="ghost" size="sm" onClick={() => speakWord(word)}>
            <Volume2 className="w-3 h-3 mr-1" /> 시범 듣기
          </Button>
          <span
            className={cn(
              "font-mono",
              attempts >= STUCK_LIMIT - 2
                ? "text-destructive font-bold"
                : "text-muted-foreground",
            )}
          >
            시도 {attempts}/{STUCK_LIMIT}
          </span>
        </div>

        {!supported && (
          <Button variant="outline" size="sm" onClick={skip}>
            <SkipForward className="w-3 h-3 mr-1" /> 음성인식 미지원 — 건너뛰기 (60점)
          </Button>
        )}

        <TeacherSkipButton onApproved={teacherApprove} />
      </div>

      <p
        className={cn(
          "text-center text-[11px]",
          attempts >= 2 ? "text-destructive" : "text-muted-foreground",
        )}
      >
        90점 이상 또는 10회 안전망/선생님 패스키로 통과합니다.
      </p>
    </div>
  );
};

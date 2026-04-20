import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getSpeechRecognition, koreanMeaningMatch, speechSupported } from "@/lib/speech";
import { toast } from "@/hooks/use-toast";

interface Props {
  word: string;
  expected: string; // Korean meaning(s), comma/slash separated
  onFinish: (score: number) => void;
}

/** 4단계 — 한국어 STT 의미인출. 1회 100, 2회 90, 3+ 80, 건너뛰기 60 */
export const MeaningPanel = ({ word, expected, onFinish }: Props) => {
  const supported = speechSupported();
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState("");
  const [attempts, setAttempts] = useState(0);
  const finishedRef = useRef(false);
  const recRef = useRef<ReturnType<NonNullable<ReturnType<typeof getSpeechRecognition>>> | null>(
    null,
  );

  useEffect(() => {
    finishedRef.current = false;
    setHeard("");
    setAttempts(0);
    return () => {
      try {
        recRef.current?.abort();
      } catch {
        /* noop */
      }
    };
  }, [word]);

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
      rec.lang = "ko-KR";
      rec.interimResults = false;
      rec.continuous = false;
      rec.maxAlternatives = 3;
      rec.onresult = (e) => {
        let best = "";
        const alts = e.results[0];
        for (let i = 0; i < alts.length; i++) {
          const t = alts[i].transcript;
          if (koreanMeaningMatch(t, expected)) {
            best = t;
            break;
          }
          if (!best) best = t;
        }
        setHeard(best);
        const ok = koreanMeaningMatch(best, expected);
        const nextAttempts = attempts + 1;
        setAttempts(nextAttempts);
        if (ok && !finishedRef.current) {
          finishedRef.current = true;
          const score = nextAttempts === 1 ? 100 : nextAttempts === 2 ? 90 : 80;
          toast({ title: "정답!", description: `${word} = ${best}` });
          setTimeout(() => onFinish(score), 700);
        } else if (!ok) {
          toast({
            title: "다시 시도",
            description: `들린 말: "${best}"`,
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

  return (
    <div className="space-y-5">
      <div className="text-center">
        <div className="text-xs text-muted-foreground mb-1">이 단어의 뜻을 한국어로 말하세요</div>
        <div className="text-4xl sm:text-5xl font-extrabold tracking-tight text-foreground">
          {word}
        </div>
      </div>

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
              <Mic className="w-4 h-4 mr-2" /> 뜻 말하기
            </>
          )}
        </Button>

        {heard && (
          <div className="text-xs text-muted-foreground">
            마지막 인식: <span className="font-semibold">{heard}</span>
          </div>
        )}

        <div className="text-xs text-muted-foreground">시도 {attempts}</div>

        {!supported && (
          <Button variant="outline" size="sm" onClick={skip}>
            <SkipForward className="w-3 h-3 mr-1" /> 음성인식 미지원 — 건너뛰기 (60점)
          </Button>
        )}
      </div>

      <p
        className={cn(
          "text-center text-[11px]",
          attempts >= 2 ? "text-destructive" : "text-muted-foreground",
        )}
      >
        90점 이상이어야 이 단어가 통과됩니다.
      </p>
    </div>
  );
};

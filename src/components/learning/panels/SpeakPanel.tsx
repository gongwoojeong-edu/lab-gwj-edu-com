import { useEffect, useMemo, useRef, useState } from "react";
import { Mic, MicOff, SkipForward, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { englishMatch, getSpeechRecognition, speechSupported } from "@/lib/speech";
import { speakWord, splitIntoSyllables } from "@/lib/syllables";
import { toast } from "@/hooks/use-toast";

interface Props {
  word: string;
  onFinish: (score: number) => void;
}

type RecInstance = NonNullable<ReturnType<typeof getSpeechRecognition>> extends new () => infer R
  ? R
  : never;

/** 2단계 — 영어 STT 발화. 1회 100, 2회 90, 3+ 80, 건너뛰기 60 */
export const SpeakPanel = ({ word, onFinish }: Props) => {
  const supported = speechSupported();
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState<string>("");
  const [attempts, setAttempts] = useState(0);
  const finishedRef = useRef(false);
  const recRef = useRef<RecInstance | null>(null);

  // 음소표 폴백: 음절을 하이픈으로 표시 (실데이터 phonics 추가는 다음 라운드)
  const phonics = useMemo(() => splitIntoSyllables(word).join(" · "), [word]);

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
            description: `들린 발음: "${best}"`,
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
        <div className="text-xs text-muted-foreground mb-1">음소표 보고 발음하기</div>
        <div className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
          {word}
        </div>
        <div className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary text-sm font-mono text-foreground/80">
          {phonics}
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
          <span className="text-muted-foreground">시도 {attempts}</span>
        </div>

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
        90점 이상이어야 다음 단계로 넘어갑니다.
      </p>
    </div>
  );
};

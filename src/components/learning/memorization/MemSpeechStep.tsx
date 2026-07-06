import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Mic, MicOff, Volume2, Check, SkipForward, Loader2, Sparkles } from "lucide-react";
import { englishMatch, getSpeechRecognition, speechSupported } from "@/lib/speech";
import { dictationPassEn, type MemDirection } from "@/lib/memorizationText";
import { speakChunk } from "@/lib/syllables";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  assessPronunciationWithAzure,
  checkAzureSpeechAvailable,
} from "@/lib/azureSpeechAssess";

interface Props {
  english: string;
  korean: string;
  direction: MemDirection;
  onPassed: () => void;
}

type RecInstance = NonNullable<ReturnType<typeof getSpeechRecognition>> extends new () => infer R
  ? R
  : never;

const MAX_ATTEMPTS = 3;

function speechPass(heard: string, expected: string, direction: MemDirection): boolean {
  if (direction === "ko_to_en") {
    return dictationPassEn(heard, expected) || englishMatch(heard, expected);
  }
  return dictationPassEn(heard, expected);
}

export const MemSpeechStep = ({ english, korean, direction, onPassed }: Props) => {
  const supported = speechSupported();
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [passed, setPassed] = useState(false);
  const [azureAvailable, setAzureAvailable] = useState(false);
  const [azureBusy, setAzureBusy] = useState(false);
  const [azureRecording, setAzureRecording] = useState(false);
  const finishedRef = useRef(false);
  const recRef = useRef<RecInstance | null>(null);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const azureChunksRef = useRef<Blob[]>([]);

  const prompt =
    direction === "ko_to_en"
      ? "한글 뜻을 보고 영어 문장을 소리 내어 읽으세요."
      : "영문을 보고 한국어로 소리 내어 말하세요.";
  const expected = direction === "ko_to_en" ? english : korean;
  const display = direction === "ko_to_en" ? korean : english;
  const recLang = direction === "ko_to_en" ? "en-US" : "ko-KR";

  useEffect(() => {
    finishedRef.current = false;
    void checkAzureSpeechAvailable().then(setAzureAvailable);
    return () => {
      try {
        recRef.current?.abort();
        mediaRecRef.current?.stop();
      } catch {
        /* noop */
      }
    };
  }, [english]);

  const finishPass = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setPassed(true);
    setTimeout(onPassed, 600);
  };

  const start = () => {
    const Ctor = getSpeechRecognition();
    if (!Ctor) {
      toast({
        title: "음성 인식 미지원",
        description: "Chrome 또는 Edge를 사용해 주세요.",
        variant: "destructive",
      });
      return;
    }
    try {
      const rec = new Ctor();
      rec.lang = recLang;
      rec.interimResults = false;
      rec.continuous = false;
      rec.maxAlternatives = 3;
      rec.onresult = (e) => {
        let best = "";
        const alts = e.results[0];
        for (let i = 0; i < alts.length; i++) {
          const t = alts[i].transcript;
          if (speechPass(t, expected, direction)) {
            best = t;
            break;
          }
          if (!best) best = t;
        }
        setHeard(best);
        const ok = speechPass(best, expected, direction);
        const next = attempts + 1;
        setAttempts(next);
        if (ok) {
          toast({ title: "잘했어요!", description: "발화 통과" });
          finishPass();
        } else {
          toast({
            title: "다시 시도",
            description: `인식: "${best}" (${next}/${MAX_ATTEMPTS})`,
            variant: "destructive",
          });
        }
      };
      rec.onerror = (e) => {
        if (e.error !== "no-speech" && e.error !== "aborted") {
          toast({ title: "음성 인식 오류", description: e.error, variant: "destructive" });
        }
      };
      rec.onend = () => setListening(false);
      recRef.current = rec;
      setListening(true);
      rec.start();
    } catch (err) {
      setListening(false);
      toast({ title: "마이크 시작 실패", description: String(err), variant: "destructive" });
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

  const skipUnsupported = () => {
    toast({ title: "발화 단계 건너뜀", description: "음성 인식 미지원 브라우저" });
    finishPass();
  };

  const startAzureRecord = async () => {
    if (azureBusy || azureRecording || passed) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      azureChunksRef.current = [];
      const mr = new MediaRecorder(stream);
      mediaRecRef.current = mr;
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) azureChunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setAzureRecording(false);
        void submitAzure(new Blob(azureChunksRef.current, { type: mr.mimeType || "audio/webm" }));
      };
      mr.start();
      setAzureRecording(true);
      setTimeout(() => {
        try {
          if (mediaRecRef.current?.state === "recording") mediaRecRef.current.stop();
        } catch {
          /* noop */
        }
      }, 8000);
    } catch (err) {
      toast({ title: "마이크 오류", description: String(err), variant: "destructive" });
    }
  };

  const stopAzureRecord = () => {
    try {
      if (mediaRecRef.current?.state === "recording") mediaRecRef.current.stop();
    } catch {
      setAzureRecording(false);
    }
  };

  const submitAzure = async (blob: Blob) => {
    setAzureBusy(true);
    try {
      const lang = direction === "ko_to_en" ? "en-US" : "ko-KR";
      const result = await assessPronunciationWithAzure(blob, expected, lang);
      if (!result.ok) {
        toast({
          title: "Azure 발음 검사 실패",
          description: result.error ?? "다시 시도해 주세요",
          variant: "destructive",
        });
        return;
      }
      setHeard(result.transcript ?? "");
      const next = attempts + 1;
      setAttempts(next);
      if (result.passed) {
        toast({
          title: "발음 통과!",
          description: `Azure 점수 ${result.pronScore ?? 0}점`,
        });
        finishPass();
      } else {
        toast({
          title: "다시 시도",
          description: `Azure ${result.pronScore ?? 0}점 (기준 ${result.passThreshold ?? 80}점)`,
          variant: "destructive",
        });
      }
    } finally {
      setAzureBusy(false);
    }
  };

  const showAzure =
    azureAvailable && (direction === "ko_to_en" || direction === "en_to_ko");

  return (
    <Card className="p-5 space-y-4">
      <div className="space-y-1">
        <h3 className="font-bold">E. 소리내어 읽기</h3>
        <p className="text-sm text-muted-foreground">{prompt}</p>
      </div>

      <p className="text-base font-medium bg-violet-500/5 rounded-lg p-4 leading-relaxed">{display}</p>

      {listening && (
        <div className="flex flex-col items-center gap-2 py-4 rounded-xl border border-violet-500/30 bg-violet-500/5">
          <Mic className="w-8 h-8 text-violet-600 animate-pulse" />
          <span className="text-sm font-bold text-violet-700 dark:text-violet-300">듣고 있어요…</span>
        </div>
      )}

      {azureRecording && (
        <div className="flex flex-col items-center gap-2 py-4 rounded-xl border border-sky-500/30 bg-sky-500/5">
          <Mic className="w-8 h-8 text-sky-600 animate-pulse" />
          <span className="text-sm font-bold text-sky-700">Azure 녹음 중… (최대 8초)</span>
          <Button size="sm" variant="outline" onClick={stopAzureRecord}>
            녹음 종료
          </Button>
        </div>
      )}

      <div className="flex flex-col items-center gap-3">
        <Button
          size="lg"
          variant={listening ? "destructive" : "default"}
          onClick={listening ? stop : start}
          disabled={!supported || passed || azureRecording || azureBusy}
          className="min-w-40"
        >
          {listening ? (
            <>
              <MicOff className="w-4 h-4 mr-2" /> 중지
            </>
          ) : (
            <>
              <Mic className="w-4 h-4 mr-2" /> 발화하기
            </>
          )}
        </Button>

        {showAzure && (
          <Button
            size="sm"
            variant="secondary"
            disabled={passed || azureBusy || azureRecording || listening}
            onClick={() => void (azureRecording ? stopAzureRecord() : startAzureRecord())}
          >
            {azureBusy ? (
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            ) : (
              <Sparkles className="w-3 h-3 mr-1" />
            )}
            {azureRecording ? "녹음 중…" : "Azure 정밀 발음 검사"}
          </Button>
        )}

        {direction === "ko_to_en" && (
          <Button variant="ghost" size="sm" onClick={() => speakChunk(english, { rate: 0.82 })}>
            <Volume2 className="w-3 h-3 mr-1" /> 시범 듣기
          </Button>
        )}

        {heard && (
          <p className="text-xs text-muted-foreground">
            인식: <span className="font-mono">{heard}</span>
          </p>
        )}

        <span className={cn("text-xs font-mono", attempts >= MAX_ATTEMPTS ? "text-amber-600" : "text-muted-foreground")}>
          시도 {attempts}/{MAX_ATTEMPTS}
        </span>

        {!supported && (
          <Button variant="outline" size="sm" onClick={skipUnsupported}>
            <SkipForward className="w-3 h-3 mr-1" /> 건너뛰기
          </Button>
        )}

        {passed && (
          <span className="inline-flex items-center gap-1 text-emerald-600 text-sm font-bold">
            <Check className="w-4 h-4" /> 통과!
          </span>
        )}
      </div>
    </Card>
  );
};

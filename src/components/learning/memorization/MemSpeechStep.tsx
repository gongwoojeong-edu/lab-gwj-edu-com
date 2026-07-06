import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Mic,
  MicOff,
  Volume2,
  Check,
  SkipForward,
  Loader2,
  Sparkles,
  Eye,
  EyeOff,
} from "lucide-react";
import { englishMatch, getSpeechRecognition, speechSupported } from "@/lib/speech";
import { dictationPassEn, type MemDirection } from "@/lib/memorizationText";
import { playPassageAudioEnglish } from "@/lib/passageAudio";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  assessPronunciationWithAzure,
  checkAzureSpeechAvailable,
} from "@/lib/azureSpeechAssess";

interface Props {
  sentenceId: string;
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

function collectTranscript(results: { length: number; [i: number]: { 0?: { transcript?: string } } }): string {
  let out = "";
  for (let i = 0; i < results.length; i++) {
    out += results[i][0]?.transcript ?? "";
    if (i < results.length - 1) out += " ";
  }
  return out.replace(/\s+/g, " ").trim();
}

export const MemSpeechStep = ({ sentenceId, english, korean, direction, onPassed }: Props) => {
  const supported = speechSupported();
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState("");
  const [interim, setInterim] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [passed, setPassed] = useState(false);
  const [azureAvailable, setAzureAvailable] = useState(false);
  const [azureBusy, setAzureBusy] = useState(false);
  const [azureRecording, setAzureRecording] = useState(false);
  const [showTargetHint, setShowTargetHint] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const finishedRef = useRef(false);
  const recRef = useRef<RecInstance | null>(null);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const azureChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const gradingRef = useRef(false);
  const transcriptRef = useRef("");

  const isKoToEn = direction === "ko_to_en";
  const expected = isKoToEn ? english : korean;
  const sourceText = isKoToEn ? korean : english;
  const targetLabel = isKoToEn ? "영어" : "한국어";
  const sourceLabel = isKoToEn ? "한글 해석" : "영어 원문";
  const noSource = !sourceText.trim();
  const recLang = isKoToEn ? "en-US" : "ko-KR";

  const prompt = noSource
    ? isKoToEn
      ? "한글 해석이 없습니다. 영어 원문을 소리 내어 읽으세요."
      : "영문을 소리 내어 읽으세요."
    : isKoToEn
      ? "한글 해석을 보며 영어로 말하세요. (동시통역처럼)"
      : "영어 원문을 보며 한국어로 말하세요. (동시통역처럼)";

  const displaySource = noSource ? (isKoToEn ? english : english) : sourceText;

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
      if (timerRef.current != null) window.clearInterval(timerRef.current);
    };
  }, [english]);

  const finishPass = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setPassed(true);
    setTimeout(onPassed, 600);
  };

  const gradeTranscript = (transcript: string) => {
    if (gradingRef.current || finishedRef.current) return;
    gradingRef.current = true;
    const text = transcript.trim();
    setHeard(text);
    setInterim("");
    const ok = speechPass(text, expected, direction);
    const next = attempts + 1;
    setAttempts(next);
    if (ok) {
      toast({ title: "잘했어요!", description: "발화 통과" });
      finishPass();
    } else if (text) {
      toast({
        title: "다시 시도",
        description: `인식: "${text.slice(0, 60)}${text.length > 60 ? "…" : ""}" (${next}/${MAX_ATTEMPTS})`,
        variant: "destructive",
      });
    } else {
      toast({
        title: "음성이 인식되지 않았습니다",
        description: `다시 시도해 주세요 (${next}/${MAX_ATTEMPTS})`,
        variant: "destructive",
      });
    }
    gradingRef.current = false;
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
      rec.interimResults = true;
      rec.continuous = true;
      rec.maxAlternatives = 1;
      rec.onresult = (e) => {
        const results = e.results;
        let interimText = "";
        for (let i = e.resultIndex; i < results.length; i++) {
          if (!results[i].isFinal) {
            interimText = results[i][0]?.transcript ?? "";
          }
        }
        const full = collectTranscript(results);
        transcriptRef.current = full;
        setHeard(full);
        setInterim(interimText);
      };
      rec.onerror = (e) => {
        if (e.error !== "no-speech" && e.error !== "aborted") {
          toast({ title: "음성 인식 오류", description: e.error, variant: "destructive" });
        }
      };
      rec.onend = () => {
        setListening(false);
        if (timerRef.current != null) {
          window.clearInterval(timerRef.current);
          timerRef.current = null;
        }
        const finalText = transcriptRef.current.trim();
        if (!gradingRef.current && !finishedRef.current) {
          gradeTranscript(finalText);
        }
      };
      recRef.current = rec;
      setHeard("");
      setInterim("");
      transcriptRef.current = "";
      setElapsedSec(0);
      setListening(true);
      timerRef.current = window.setInterval(() => setElapsedSec((s) => s + 1), 1000);
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
      setListening(false);
    }
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
      }, 15000);
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
      const lang = isKoToEn ? "en-US" : "ko-KR";
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

  const showAzure = azureAvailable;

  return (
    <Card className="p-5 space-y-4">
      <div className="space-y-1">
        <h3 className="font-bold">E. 소리내어 읽기</h3>
        <p className="text-sm text-muted-foreground">{prompt}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 min-h-0">
          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
            {noSource && isKoToEn ? "영어 원문 (읽기)" : sourceLabel}
          </div>
          <div
            className={cn(
              "text-base font-medium rounded-lg p-4 leading-relaxed overflow-y-auto max-h-48 border",
              noSource && isKoToEn
                ? "bg-amber-50 border-amber-200 text-amber-950"
                : "bg-violet-500/5 border-violet-500/20",
            )}
          >
            {displaySource}
          </div>
          {noSource && isKoToEn && (
            <p className="text-[11px] text-amber-700">한글 해석 미입력 — 영문 낭독 모드</p>
          )}
        </div>

        <div className="space-y-1.5 min-h-0">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
              {targetLabel} (발화)
            </div>
            {!noSource && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-[11px] px-2"
                onClick={() => setShowTargetHint((v) => !v)}
              >
                {showTargetHint ? (
                  <>
                    <EyeOff className="w-3 h-3 mr-1" /> 힌트 숨기기
                  </>
                ) : (
                  <>
                    <Eye className="w-3 h-3 mr-1" /> 힌트 보기
                  </>
                )}
              </Button>
            )}
          </div>
          <div
            className={cn(
              "text-base rounded-lg p-4 leading-relaxed overflow-y-auto max-h-48 border border-dashed",
              showTargetHint || noSource
                ? "bg-muted/40 text-foreground border-muted-foreground/30"
                : "bg-muted/20 text-muted-foreground/50 border-muted-foreground/20 flex items-center justify-center min-h-[8rem]",
            )}
          >
            {showTargetHint || noSource ? (
              expected
            ) : (
              <span className="text-sm text-center px-2">
                {targetLabel}로 말해 주세요
                <br />
                <span className="text-[11px]">(동시통역 — 정답은 숨김)</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {listening && (
        <div className="flex flex-col items-center gap-2 py-4 rounded-xl border border-violet-500/30 bg-violet-500/5">
          <Mic className="w-8 h-8 text-violet-600 animate-pulse" />
          <span className="text-sm font-bold text-violet-700 dark:text-violet-300">
            듣고 있어요… {elapsedSec}초
          </span>
          <span className="text-[11px] text-muted-foreground">말을 마치면 「중지」를 누르세요</span>
          {(heard || interim) && (
            <p className="text-xs text-muted-foreground max-w-md text-center px-4 max-h-20 overflow-y-auto">
              {heard}
              {interim && <span className="opacity-60"> {interim}</span>}
            </p>
          )}
        </div>
      )}

      {azureRecording && (
        <div className="flex flex-col items-center gap-2 py-4 rounded-xl border border-sky-500/30 bg-sky-500/5">
          <Mic className="w-8 h-8 text-sky-600 animate-pulse" />
          <span className="text-sm font-bold text-sky-700">Azure 녹음 중… (최대 15초)</span>
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

        {isKoToEn && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void playPassageAudioEnglish(sentenceId, english)}
          >
            <Volume2 className="w-3 h-3 mr-1" /> 시범 듣기
          </Button>
        )}

        {heard && !listening && (
          <p className="text-xs text-muted-foreground max-w-md text-center">
            인식: <span className="font-mono">{heard}</span>
          </p>
        )}

        <span
          className={cn(
            "text-xs font-mono",
            attempts >= MAX_ATTEMPTS ? "text-amber-600" : "text-muted-foreground",
          )}
        >
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

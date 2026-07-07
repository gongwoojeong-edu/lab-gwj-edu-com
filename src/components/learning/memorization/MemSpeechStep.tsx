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
} from "lucide-react";
import { englishMatch, getSpeechRecognition, isSpeechLikelyBlocked, speechErrorMessage, speechSupported } from "@/lib/speech";
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

function mergeSpeechResults(
  finals: string[],
  results: { length: number; [i: number]: { isFinal?: boolean; 0?: { transcript?: string }; length?: number } },
  fromIndex: number,
): { text: string; interim: string } {
  for (let i = fromIndex; i < results.length; i++) {
    const row = results[i];
    const piece = row[0]?.transcript ?? "";
    if (!piece) continue;
    if (row.isFinal) finals.push(piece);
  }
  let interim = "";
  for (let i = results.length - 1; i >= 0; i--) {
    if (!results[i].isFinal) {
      interim = results[i][0]?.transcript ?? "";
      break;
    }
  }
  const text = [...finals, interim].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  return { text, interim };
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
  const [elapsedSec, setElapsedSec] = useState(0);
  const finishedRef = useRef(false);
  const recRef = useRef<RecInstance | null>(null);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const azureChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const gradingRef = useRef(false);
  const transcriptRef = useRef("");
  const sessionActiveRef = useRef(false);
  const userStopRef = useRef(false);
  const hadSpeechRef = useRef(false);
  const finalPartsRef = useRef<string[]>([]);
  const listenStartedAtRef = useRef(0);

  const isKoToEn = direction === "ko_to_en";
  const expected = isKoToEn ? english : korean;
  const recLang = isKoToEn ? "en-US" : "ko-KR";
  const attemptsExhausted = attempts >= MAX_ATTEMPTS;
  const embeddedPreview = isSpeechLikelyBlocked();

  const promptText = isKoToEn
    ? korean.trim()
      ? "한글 해석을 보고 영어로 소리 내어 말하세요."
      : "영어 원문을 소리 내어 읽으세요."
    : "영어 원문을 보고 한국어로 소리 내어 말하세요.";

  const panelLabel = isKoToEn
    ? korean.trim()
      ? "한글 해석"
      : "영어 원문"
    : "영어 원문";

  const panelText = isKoToEn ? (korean.trim() || english) : english;
  const readAloudFallback = isKoToEn && !korean.trim();

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

    if (!text && !hadSpeechRef.current) {
      toast({
        title: "음성이 인식되지 않았습니다",
        description: embeddedPreview
          ? "Lovable 미리보기보다 Chrome 새 탭(lab.gwj-edu.com)에서 시도해 주세요."
          : "마이크 허용 후 문장을 읽고 「중지」를 눌러 주세요. (시도 횟수 차감 없음)",
        variant: "destructive",
      });
      gradingRef.current = false;
      return;
    }

    const next = attempts + 1;
    setAttempts(next);
    const ok = speechPass(text, expected, direction);
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

  const skipAfterMax = () => {
    toast({ title: "발화 단계 진행", description: "인식 미통과 — 다음 단계로 이동합니다." });
    finishPass();
  };

  const start = () => {
    if (attemptsExhausted || passed) return;

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
      rec.continuous = false;
      rec.maxAlternatives = 3;
      rec.onresult = (e) => {
        const { text, interim: interimText } = mergeSpeechResults(
          finalPartsRef.current,
          e.results,
          e.resultIndex,
        );
        if (text) hadSpeechRef.current = true;
        transcriptRef.current = text;
        setHeard(text);
        setInterim(interimText);
      };
      rec.onstart = () => {
        listenStartedAtRef.current = Date.now();
      };
      rec.onerror = (e) => {
        if (e.error === "not-allowed" || e.error === "service-not-allowed") {
          sessionActiveRef.current = false;
          userStopRef.current = false;
        }
        if (e.error !== "no-speech" && e.error !== "aborted") {
          toast({
            title: "음성 인식 오류",
            description: speechErrorMessage(e.error),
            variant: "destructive",
          });
        }
      };
      rec.onend = () => {
        if (sessionActiveRef.current && !userStopRef.current) {
          try {
            rec.start();
          } catch {
            /* browser ended session; keep UI until user stops */
          }
          return;
        }
        setListening(false);
        sessionActiveRef.current = false;
        if (timerRef.current != null) {
          window.clearInterval(timerRef.current);
          timerRef.current = null;
        }
        const finalText = transcriptRef.current.trim();
        if (!gradingRef.current && !finishedRef.current && userStopRef.current) {
          gradeTranscript(finalText);
        }
        userStopRef.current = false;
      };
      recRef.current = rec;
      setHeard("");
      setInterim("");
      transcriptRef.current = "";
      hadSpeechRef.current = false;
      finalPartsRef.current = [];
      sessionActiveRef.current = true;
      userStopRef.current = false;
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
    const listenedMs = Date.now() - listenStartedAtRef.current;
    if (listenedMs < 1200 && !hadSpeechRef.current) {
      toast({
        title: "조금 더 읽어 주세요",
        description: "1초 이상 읽은 뒤 「중지」를 눌러 주세요.",
      });
      return;
    }
    userStopRef.current = true;
    sessionActiveRef.current = false;
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
        <p className="text-sm text-muted-foreground">{promptText}</p>
      </div>

      <div className="space-y-1.5">
        <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
          {panelLabel}
        </div>
        <div
          className={cn(
            "text-base font-medium rounded-lg p-4 leading-relaxed overflow-y-auto max-h-48 border",
            readAloudFallback
              ? "bg-amber-50 border-amber-200 text-amber-950"
              : "bg-violet-500/5 border-violet-500/20",
          )}
        >
          {panelText}
        </div>
        {readAloudFallback && (
          <p className="text-[11px] text-amber-700">한글 해석 미입력 — 영문 낭독 모드</p>
        )}
      </div>

      {embeddedPreview && (
        <div className="text-xs rounded-lg border border-amber-300 bg-amber-50 text-amber-900 px-3 py-2">
          미리보기(iframe)에서는 Chrome 음성 인식이 차단되는 경우가 많습니다.
          <strong className="block mt-1">Publish된 주소를 Chrome 새 탭에서 열어</strong> 테스트해 주세요.
          {showAzure && " 또는 아래 「녹음 발음 검사」를 사용하세요."}
        </div>
      )}

      {listening && (
        <div className="flex flex-col items-center gap-2 py-4 rounded-xl border border-violet-500/30 bg-violet-500/5">
          <Mic className="w-8 h-8 text-violet-600 animate-pulse" />
          <span className="text-sm font-bold text-violet-700 dark:text-violet-300">
            듣고 있어요… {elapsedSec}초
          </span>
          <span className="text-[11px] text-muted-foreground">
            영문을 크게 읽은 뒤 「중지」를 누르세요
          </span>
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
          onClick={() => void (listening ? stop() : start())}
          disabled={!supported || passed || azureRecording || azureBusy || attemptsExhausted}
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
            {azureRecording ? "녹음 중…" : "녹음 발음 검사 (권장)"}
          </Button>
        )}

        {readAloudFallback && !passed && !listening && (
          <Button variant="outline" size="sm" onClick={() => finishPass()}>
            <Check className="w-3 h-3 mr-1" /> 낭독 완료 (인식 불가 시)
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

        {attemptsExhausted && !passed && (
          <div className="flex flex-col items-center gap-2 text-center">
            <p className="text-xs text-amber-600">
              {MAX_ATTEMPTS}회 시도했습니다. 마이크·브라우저(Chrome)를 확인하거나 다음 단계로 진행하세요.
            </p>
            <Button variant="outline" size="sm" onClick={skipAfterMax}>
              <SkipForward className="w-3 h-3 mr-1" /> 다음 단계로
            </Button>
          </div>
        )}

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

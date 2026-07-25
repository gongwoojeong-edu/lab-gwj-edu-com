// ============================================================
// MemInterpretStep — G. 동시통역
//   원문 재생 → 즉시 반대 언어로 발화(마이크) → STT 유사도 판정 (≥ 60%)
//   Azure 사용 가능 시 Azure, 아니면 브라우저 Web Speech, 최종 대안: 타이핑 입력
// ============================================================
import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Mic, MicOff, Volume2, SkipForward, Sparkles, Loader2, Keyboard, Check } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  getSpeechRecognition,
  isSpeechLikelyBlocked,
  speechErrorMessage,
  speechSupported,
  levenshtein,
} from "@/lib/speech";
import {
  normalizeEnSentence,
  type MemDirection,
} from "@/lib/memorizationText";
import { playPassageAudioEnglish } from "@/lib/passageAudio";
import {
  assessPronunciationWithAzure,
  checkAzureSpeechAvailable,
} from "@/lib/azureSpeechAssess";

interface Props {
  sentenceId: string;
  english: string;
  korean: string;
  direction: MemDirection;
  onPassed: (score: number) => void;
}

type RecInstance = NonNullable<ReturnType<typeof getSpeechRecognition>> extends new () => infer R
  ? R
  : never;

const MAX_ATTEMPTS = 3;
const PASS_THRESHOLD = 60;

function similarityEn(a: string, b: string): number {
  const x = normalizeEnSentence(a).replace(/\s/g, "");
  const y = normalizeEnSentence(b).replace(/\s/g, "");
  if (!x || !y) return 0;
  const maxLen = Math.max(x.length, y.length);
  return Math.max(0, Math.round((1 - levenshtein(x, y) / maxLen) * 100));
}

function similarityKo(a: string, b: string): number {
  const norm = (s: string) => s.trim().replace(/\s+/g, "").toLowerCase();
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return 0;
  const maxLen = Math.max(x.length, y.length);
  return Math.max(0, Math.round((1 - levenshtein(x, y) / maxLen) * 100));
}

export const MemInterpretStep = ({ sentenceId, english, korean, direction, onPassed }: Props) => {
  // 현재 트랙: ko_to_en(원문 한글, 응답 영어) | en_to_ko(원문 영어, 응답 한글)
  const isKoToEn = direction === "ko_to_en";
  const sourceLabel = isKoToEn ? "한글 원문 (듣고 즉시 영어로)" : "영어 원문 (듣고 즉시 한국어로)";
  const sourceText = isKoToEn ? (korean.trim() || english) : english;
  const expected = isKoToEn ? english : (korean.trim() || english);
  const targetLang: "en-US" | "ko-KR" = isKoToEn ? "en-US" : "ko-KR";
  const similarity = isKoToEn ? similarityEn : similarityKo;
  const supported = speechSupported();
  const embeddedPreview = isSpeechLikelyBlocked();

  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState("");
  const [interim, setInterim] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [passed, setPassed] = useState(false);
  const [lastScore, setLastScore] = useState<number | null>(null);
  const [azureAvailable, setAzureAvailable] = useState(false);
  const [azureBusy, setAzureBusy] = useState(false);
  const [azureRecording, setAzureRecording] = useState(false);
  const [typedFallback, setTypedFallback] = useState("");
  const [showTyped, setShowTyped] = useState(false);

  const recRef = useRef<RecInstance | null>(null);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const azureChunksRef = useRef<Blob[]>([]);
  const finishedRef = useRef(false);
  const gradingRef = useRef(false);
  const transcriptRef = useRef("");
  const sessionActiveRef = useRef(false);
  const userStopRef = useRef(false);
  const finalPartsRef = useRef<string[]>([]);

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

  const finishPass = (score: number) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setPassed(true);
    setLastScore(score);
    setTimeout(() => onPassed(score), 600);
  };

  const attemptsExhausted = attempts >= MAX_ATTEMPTS;

  const grade = (text: string, score: number) => {
    const next = attempts + 1;
    setAttempts(next);
    setLastScore(score);
    if (score >= PASS_THRESHOLD) {
      toast({ title: "통역 통과!", description: `유사도 ${score}점` });
      finishPass(score);
    } else {
      toast({
        title: "다시 시도",
        description: `유사도 ${score}점 (기준 ${PASS_THRESHOLD}점, ${next}/${MAX_ATTEMPTS})`,
        variant: "destructive",
      });
    }
  };

  // ---- Web Speech ----
  const start = () => {
    if (attemptsExhausted || passed) return;
    const Ctor = getSpeechRecognition();
    if (!Ctor) {
      setShowTyped(true);
      return;
    }
    try {
      const rec = new Ctor();
      rec.lang = targetLang;
      rec.interimResults = true;
      rec.continuous = false;
      rec.maxAlternatives = 3;
      rec.onresult = (e) => {
        let interimText = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const row = e.results[i] as unknown as { isFinal?: boolean; 0?: { transcript?: string } };
          const piece = row[0]?.transcript ?? "";
          if (!piece) continue;
          if (row.isFinal) finalPartsRef.current.push(piece);
          else interimText = piece;
        }
        const text = [...finalPartsRef.current, interimText].filter(Boolean).join(" ").trim();
        transcriptRef.current = text;
        setHeard(text);
        setInterim(interimText);
      };
      rec.onerror = (e) => {
        if (e.error !== "no-speech" && e.error !== "aborted") {
          toast({ title: "음성 인식 오류", description: speechErrorMessage(e.error), variant: "destructive" });
        }
      };
      rec.onend = () => {
        if (sessionActiveRef.current && !userStopRef.current) {
          try { rec.start(); } catch { /* noop */ }
          return;
        }
        setListening(false);
        sessionActiveRef.current = false;
        const finalText = transcriptRef.current.trim();
        if (!gradingRef.current && !finishedRef.current && userStopRef.current) {
          gradingRef.current = true;
          if (!finalText) {
            toast({ title: "음성이 인식되지 않았습니다", description: "다시 시도해 주세요", variant: "destructive" });
          } else {
            grade(finalText, similarity(finalText, expected));
          }
          gradingRef.current = false;
        }
        userStopRef.current = false;
      };
      recRef.current = rec;
      setHeard("");
      setInterim("");
      transcriptRef.current = "";
      finalPartsRef.current = [];
      sessionActiveRef.current = true;
      userStopRef.current = false;
      setListening(true);
      rec.start();
    } catch (err) {
      setListening(false);
      toast({ title: "마이크 시작 실패", description: String(err), variant: "destructive" });
    }
  };

  const stop = () => {
    userStopRef.current = true;
    sessionActiveRef.current = false;
    try { recRef.current?.stop(); } catch { setListening(false); }
  };

  // ---- Azure ----
  const startAzureRecord = async () => {
    if (azureBusy || azureRecording || passed) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      azureChunksRef.current = [];
      const mr = new MediaRecorder(stream);
      mediaRecRef.current = mr;
      mr.ondataavailable = (e) => { if (e.data.size > 0) azureChunksRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setAzureRecording(false);
        void submitAzure(new Blob(azureChunksRef.current, { type: mr.mimeType || "audio/webm" }));
      };
      mr.start();
      setAzureRecording(true);
      setTimeout(() => {
        try { if (mediaRecRef.current?.state === "recording") mediaRecRef.current.stop(); } catch { /* noop */ }
      }, 15000);
    } catch (err) {
      toast({ title: "마이크 오류", description: String(err), variant: "destructive" });
    }
  };

  const stopAzureRecord = () => {
    try { if (mediaRecRef.current?.state === "recording") mediaRecRef.current.stop(); } catch { setAzureRecording(false); }
  };

  const submitAzure = async (blob: Blob) => {
    setAzureBusy(true);
    try {
      const result = await assessPronunciationWithAzure(blob, expected, targetLang);
      if (!result.ok) {
        toast({ title: "Azure 검사 실패", description: result.error ?? "다시 시도해 주세요", variant: "destructive" });
        return;
      }
      const transcript = result.transcript ?? "";
      setHeard(transcript);
      const score = similarity(transcript, expected);
      grade(transcript, score);
    } finally {
      setAzureBusy(false);
    }
  };

  const submitTyped = () => {
    if (!typedFallback.trim()) return;
    const score = similarity(typedFallback, expected);
    setHeard(typedFallback);
    grade(typedFallback, score);
    setTypedFallback("");
  };

  const skipAfterMax = () => {
    toast({ title: "통역 단계 진행", description: "다음 단계로 이동합니다." });
    finishPass(lastScore ?? 0);
  };

  return (
    <Card className="p-5 space-y-4">
      <div className="space-y-1">
        <h3 className="font-bold">G. 동시통역</h3>
        <p className="text-sm text-muted-foreground">
          원문을 듣고 즉시 반대 언어로 소리 내어 말하세요. 유사도 {PASS_THRESHOLD}% 이상이면 통과.
        </p>
      </div>

      <div className="space-y-1.5">
        <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
          {sourceLabel}
        </div>
        <div className="text-base font-medium rounded-lg p-4 leading-relaxed bg-sky-500/5 border border-sky-500/20">
          {sourceText}
        </div>
        {!isKoToEn && (
          <Button size="sm" variant="ghost" onClick={() => void playPassageAudioEnglish(sentenceId, english)}>
            <Volume2 className="w-3 h-3 mr-1" /> 원문 재생
          </Button>
        )}
      </div>

      {embeddedPreview && (
        <div className="text-xs rounded-lg border border-amber-300 bg-amber-50 text-amber-900 px-3 py-2">
          미리보기에서는 브라우저 음성 인식이 차단될 수 있습니다. Azure 녹음 또는 타이핑 대체를 사용하세요.
        </div>
      )}

      {listening && (
        <div className="flex flex-col items-center gap-2 py-4 rounded-xl border border-violet-500/30 bg-violet-500/5">
          <Mic className="w-8 h-8 text-violet-600 animate-pulse" />
          <span className="text-sm font-bold text-violet-700">듣고 있어요…</span>
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
          <Button size="sm" variant="outline" onClick={stopAzureRecord}>녹음 종료</Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="lg"
          variant={listening ? "destructive" : "default"}
          onClick={() => void (listening ? stop() : start())}
          disabled={!supported || passed || azureRecording || azureBusy || attemptsExhausted}
        >
          {listening ? (<><MicOff className="w-4 h-4 mr-2" /> 중지</>) : (<><Mic className="w-4 h-4 mr-2" /> 말하기</>)}
        </Button>

        {azureAvailable && (
          <Button
            size="sm"
            variant="secondary"
            disabled={passed || azureBusy || azureRecording || listening}
            onClick={() => void (azureRecording ? stopAzureRecord() : startAzureRecord())}
          >
            {azureBusy ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Sparkles className="w-3 h-3 mr-1" />}
            {azureRecording ? "녹음 중…" : "Azure 녹음"}
          </Button>
        )}

        <Button size="sm" variant="ghost" onClick={() => setShowTyped((v) => !v)}>
          <Keyboard className="w-3 h-3 mr-1" /> 타이핑 대체
        </Button>

        <span className="text-xs text-muted-foreground font-mono ml-auto">
          시도 {attempts}/{MAX_ATTEMPTS}
        </span>
      </div>

      {showTyped && !passed && (
        <div className="space-y-2">
          <Textarea
            value={typedFallback}
            onChange={(e) => setTypedFallback(e.target.value)}
            rows={2}
            placeholder={isKoToEn ? "Type what you would say in English…" : "한국어로 통역을 입력하세요…"}
          />
          <Button size="sm" onClick={submitTyped} disabled={!typedFallback.trim() || attemptsExhausted}>
            <Check className="w-3 h-3 mr-1" /> 제출
          </Button>
        </div>
      )}

      {heard && !listening && (
        <p className="text-xs text-muted-foreground">
          인식: <span className="font-mono">{heard}</span>
          {lastScore != null && <span className="ml-2">({lastScore}점)</span>}
        </p>
      )}

      {attemptsExhausted && !passed && (
        <Button variant="outline" size="sm" onClick={skipAfterMax}>
          <SkipForward className="w-3 h-3 mr-1" /> 다음 단계로
        </Button>
      )}
    </Card>
  );
};

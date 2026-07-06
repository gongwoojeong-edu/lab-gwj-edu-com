import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Volume2, Check, X, Lightbulb, Loader2 } from "lucide-react";
import { speakChunk } from "@/lib/syllables";
import { resolvePassageAudioUrl } from "@/lib/passageAudio";
import {
  dictationPassEn,
  dictationPassKo,
  type MemDirection,
} from "@/lib/memorizationText";

interface Props {
  sentenceId: string;
  english: string;
  korean: string;
  direction: MemDirection;
  onPassed: () => void;
}

export const MemListenStep = ({ sentenceId, english, korean, direction, onPassed }: Props) => {
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<"idle" | "pass" | "fail">("idle");
  const [hints, setHints] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioSource, setAudioSource] = useState<"tts" | "upload" | null>(null);
  const [loadingAudio, setLoadingAudio] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const prompt =
    direction === "ko_to_en"
      ? "영어 오디오를 듣고 영문을 입력하세요."
      : "영어 오디오를 듣고 한글 해석을 입력하세요.";
  const expected = direction === "ko_to_en" ? english : korean;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoadingAudio(true);
      try {
        const { url, source } = await resolvePassageAudioUrl(sentenceId);
        if (!cancelled) {
          setAudioUrl(url);
          setAudioSource(source);
        }
      } catch {
        if (!cancelled) {
          setAudioUrl(null);
          setAudioSource(null);
        }
      } finally {
        if (!cancelled) setLoadingAudio(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sentenceId]);

  const playAudio = () => {
    if (audioUrl) {
      setPlaying(true);
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      audio.onended = () => setPlaying(false);
      audio.onerror = () => {
        setPlaying(false);
        speakChunk(english, { rate: 0.82, lang: "en-US" }, () => setPlaying(false));
      };
      void audio.play().catch(() => {
        setPlaying(false);
        speakChunk(english, { rate: 0.82, lang: "en-US" }, () => setPlaying(false));
      });
      return;
    }
    setPlaying(true);
    speakChunk(english, { rate: 0.82, lang: "en-US" }, () => setPlaying(false));
  };

  const check = () => {
    const ok =
      direction === "ko_to_en"
        ? dictationPassEn(answer, expected)
        : dictationPassKo(answer, expected);
    setResult(ok ? "pass" : "fail");
    if (ok) onPassed();
  };

  const showHint = () => {
    setHints((h) => h + 1);
    if (direction === "ko_to_en") {
      const first = english.match(/[A-Za-z]+/)?.[0] ?? "";
      if (first) setAnswer((a) => (a ? a : first + "…"));
    } else if (korean) {
      setAnswer((a) => (a ? a : korean.slice(0, Math.min(4, korean.length)) + "…"));
    }
  };

  return (
    <Card className="p-5 space-y-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-bold">A. 듣기 + 딕테이션</h3>
          {loadingAudio ? (
            <Badge variant="outline" className="text-[10px]">
              <Loader2 className="w-3 h-3 mr-1 animate-spin inline" />
              오디오 확인…
            </Badge>
          ) : audioSource === "tts" || audioSource === "upload" ? (
            <Badge variant="secondary" className="text-[10px] bg-emerald-500/10 text-emerald-700">
              원어민 TTS
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] text-muted-foreground">
              브라우저 음성
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{prompt}</p>
      </div>

      {direction === "ko_to_en" && korean && (
        <p className="text-sm bg-muted/50 rounded-lg p-3">{korean}</p>
      )}

      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={playAudio} disabled={playing || loadingAudio}>
          <Volume2 className="w-4 h-4 mr-2" />
          {playing ? "재생 중…" : "다시 듣기"}
        </Button>
        {hints < 2 && (
          <Button type="button" variant="ghost" size="sm" onClick={showHint}>
            <Lightbulb className="w-4 h-4 mr-1" />
            힌트 ({2 - hints}회)
          </Button>
        )}
      </div>

      <Input
        value={answer}
        onChange={(e) => {
          setAnswer(e.target.value);
          setResult("idle");
        }}
        placeholder={direction === "ko_to_en" ? "영문 입력…" : "한글 입력…"}
        className="text-base"
        onKeyDown={(e) => e.key === "Enter" && check()}
      />

      <div className="flex items-center gap-2">
        <Button onClick={check} disabled={!answer.trim()}>
          확인
        </Button>
        {result === "pass" && (
          <span className="inline-flex items-center gap-1 text-emerald-600 text-sm font-bold">
            <Check className="w-4 h-4" /> 통과!
          </span>
        )}
        {result === "fail" && (
          <span className="inline-flex items-center gap-1 text-amber-600 text-sm font-bold">
            <X className="w-4 h-4" /> 다시 시도해 주세요
          </span>
        )}
      </div>
    </Card>
  );
};

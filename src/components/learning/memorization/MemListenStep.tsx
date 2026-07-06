import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Volume2, Check, Loader2 } from "lucide-react";
import { speakChunk } from "@/lib/syllables";
import { resolvePassageAudioUrl } from "@/lib/passageAudio";
import type { MemDirection } from "@/lib/memorizationText";

interface Props {
  sentenceId: string;
  english: string;
  korean: string;
  direction: MemDirection;
  onPassed: () => void;
}

export const MemListenStep = ({ sentenceId, english, korean, onPassed }: Props) => {
  const [playing, setPlaying] = useState(false);
  const [playedOnce, setPlayedOnce] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioSource, setAudioSource] = useState<"tts" | "upload" | null>(null);
  const [loadingAudio, setLoadingAudio] = useState(true);
  const autoPlayedRef = useRef(false);

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

  const playAudio = (auto = false) => {
    const onEnd = () => {
      setPlaying(false);
      setPlayedOnce(true);
    };
    if (audioUrl) {
      setPlaying(true);
      const audio = new Audio(audioUrl);
      audio.onended = onEnd;
      audio.onerror = () => {
        speakChunk(english, { rate: 0.82, lang: "en-US" }, onEnd);
      };
      void audio.play().catch(() => {
        speakChunk(english, { rate: 0.82, lang: "en-US" }, onEnd);
      });
      return;
    }
    setPlaying(true);
    speakChunk(english, { rate: 0.82, lang: "en-US" }, onEnd);
  };

  useEffect(() => {
    if (loadingAudio || autoPlayedRef.current) return;
    autoPlayedRef.current = true;
    playAudio(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingAudio, english]);

  return (
    <Card className="p-5 space-y-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-bold">A. 듣기</h3>
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
        <p className="text-sm text-muted-foreground">
          오디오를 들으며 한글 해석과 영문을 함께 확인하세요.
        </p>
      </div>

      {korean && (
        <div className="rounded-lg border bg-muted/40 p-4 space-y-1">
          <div className="text-[11px] font-semibold text-muted-foreground">한글</div>
          <p className="text-base leading-relaxed">{korean}</p>
        </div>
      )}

      <div className="rounded-lg border bg-primary/5 p-4 space-y-1">
        <div className="text-[11px] font-semibold text-muted-foreground">영문</div>
        <p className="text-base leading-relaxed font-medium">{english}</p>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <Button type="button" variant="outline" onClick={() => playAudio()} disabled={playing || loadingAudio}>
          <Volume2 className="w-4 h-4 mr-2" />
          {playing ? "재생 중…" : "다시 듣기"}
        </Button>
        <Button onClick={onPassed} disabled={!playedOnce && !playing}>
          <Check className="w-4 h-4 mr-2" />
          확인 → 다음
        </Button>
      </div>
    </Card>
  );
};

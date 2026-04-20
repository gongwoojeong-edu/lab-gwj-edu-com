import { useEffect, useRef, useState } from "react";
import { Eye, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useHintSettings } from "./HintSettingsContext";

interface KoreanHintButtonProps {
  korean: string;
  /** 힌트 노출 시간(ms) — 기본 2500ms */
  durationMs?: number;
}

/**
 * 한국어 번역을 잠깐 보여주고 자동으로 페이드아웃되는 버튼.
 * 학생별 권한이 꺼져 있으면 잠금 상태로 표시된다.
 */
export const KoreanHintButton = ({ korean, durationMs = 5000 }: KoreanHintButtonProps) => {
  const { hintEnabled } = useHintSettings();
  const [shown, setShown] = useState(false);
  const [fading, setFading] = useState(false);
  const timeoutRef = useRef<number | null>(null);
  const fadeRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      if (fadeRef.current) window.clearTimeout(fadeRef.current);
    };
  }, []);

  const reveal = () => {
    if (!hintEnabled) return;
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    if (fadeRef.current) window.clearTimeout(fadeRef.current);
    setFading(false);
    setShown(true);
    fadeRef.current = window.setTimeout(() => setFading(true), durationMs - 400);
    timeoutRef.current = window.setTimeout(() => {
      setShown(false);
      setFading(false);
    }, durationMs);
  };

  return (
    <div className="flex items-center gap-3 min-h-[28px]">
      <button
        type="button"
        onClick={reveal}
        disabled={!hintEnabled}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors font-kr",
          hintEnabled
            ? "border-primary/30 text-primary hover:bg-primary/5"
            : "border-border text-muted-foreground/50 cursor-not-allowed"
        )}
      >
        {hintEnabled ? <Eye className="size-3" /> : <Lock className="size-3" />}
        {hintEnabled ? "한글 힌트" : "힌트 잠금"}
      </button>
      {shown && (
        <p
          className={cn(
            "text-xs text-muted-foreground font-kr transition-opacity duration-400",
            fading ? "opacity-0" : "opacity-100"
          )}
        >
          {korean}
        </p>
      )}
      {!hintEnabled && (
        <p className="text-[11px] text-muted-foreground/60 italic font-kr">
          원장님이 비활성화한 학생입니다
        </p>
      )}
    </div>
  );
};

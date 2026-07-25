// ============================================================
// MemTranslateStep — H. 번역 (타이핑)
//   ko_to_en 트랙: 영문 100% 일치 (정규화 후)
//   en_to_ko 트랙: 한글 유사도 ≥ 75%
// ============================================================
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Check, SkipForward } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  dictationPassEn,
  dictationPassKo,
  normalizeEnSentence,
  type MemDirection,
} from "@/lib/memorizationText";
import { levenshtein } from "@/lib/speech";

interface Props {
  english: string;
  korean: string;
  direction: MemDirection;
  onPassed: (score: number) => void;
}

const MAX_ATTEMPTS = 3;

function scoreEn(typed: string, expected: string): number {
  const t = normalizeEnSentence(typed).replace(/\s/g, "");
  const e = normalizeEnSentence(expected).replace(/\s/g, "");
  if (!t || !e) return 0;
  if (t === e) return 100;
  const maxLen = Math.max(t.length, e.length);
  return Math.max(0, Math.round((1 - levenshtein(t, e) / maxLen) * 100));
}

function scoreKo(typed: string, expected: string): number {
  const norm = (s: string) => s.trim().replace(/\s+/g, "").toLowerCase();
  const t = norm(typed);
  const e = norm(expected);
  if (!t || !e) return 0;
  if (t === e) return 100;
  const maxLen = Math.max(t.length, e.length);
  return Math.max(0, Math.round((1 - levenshtein(t, e) / maxLen) * 100));
}

/** ko_to_en: 100% 완전일치. en_to_ko: 유사도 ≥ 75% (또는 의미매칭) */
function checkPass(typed: string, direction: MemDirection, english: string, korean: string): { pass: boolean; score: number } {
  if (direction === "ko_to_en") {
    const s = scoreEn(typed, english);
    return { pass: s === 100 || dictationPassEn(typed, english) === true && s >= 100, score: s };
  }
  const s = scoreKo(typed, korean);
  return { pass: dictationPassKo(typed, korean) || s >= 75, score: s };
}

export const MemTranslateStep = ({ english, korean, direction, onPassed }: Props) => {
  const [typed, setTyped] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [passed, setPassed] = useState(false);
  const [lastScore, setLastScore] = useState<number | null>(null);

  const isKoToEn = direction === "ko_to_en";
  const promptLabel = isKoToEn ? "한글 해석" : "영어 원문";
  const promptText = isKoToEn ? (korean.trim() || english) : english;
  const inputLabel = isKoToEn ? "영문으로 번역" : "한글로 번역";
  const passRule = isKoToEn
    ? "정확히 일치해야 통과 (대소문자·구두점·아포스트로피 자동 처리)"
    : "핵심 의미가 맞으면 통과 (유사도 75% 이상)";

  const attemptsExhausted = attempts >= MAX_ATTEMPTS;

  const submit = () => {
    if (passed || !typed.trim()) return;
    const { pass, score } = checkPass(typed, direction, english, korean);
    setLastScore(score);
    const next = attempts + 1;
    setAttempts(next);
    if (pass) {
      setPassed(true);
      toast({ title: "번역 통과!", description: `점수 ${score}점` });
      setTimeout(() => onPassed(score), 600);
    } else {
      toast({
        title: "다시 시도",
        description: `점수 ${score}점 (${next}/${MAX_ATTEMPTS})`,
        variant: "destructive",
      });
    }
  };

  const skipAfterMax = () => {
    toast({ title: "번역 단계 진행", description: "다음 단계로 이동합니다." });
    setPassed(true);
    setTimeout(() => onPassed(lastScore ?? 0), 400);
  };

  return (
    <Card className="p-5 space-y-4">
      <div className="space-y-1">
        <h3 className="font-bold">H. 번역</h3>
        <p className="text-sm text-muted-foreground">{passRule}</p>
      </div>

      <div className="space-y-1.5">
        <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
          {promptLabel}
        </div>
        <div className="text-base font-medium rounded-lg p-4 leading-relaxed bg-violet-500/5 border border-violet-500/20">
          {promptText}
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
          {inputLabel}
        </div>
        <Textarea
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
          rows={3}
          disabled={passed || attemptsExhausted}
          placeholder={isKoToEn ? "Type the English translation…" : "한국어 번역을 입력하세요…"}
          className="text-base"
        />
        {lastScore != null && (
          <p className="text-xs text-muted-foreground">최근 점수: {lastScore}점</p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button onClick={submit} disabled={passed || attemptsExhausted || !typed.trim()}>
          <Check className="w-4 h-4 mr-1" /> 제출
        </Button>
        <span className="text-xs text-muted-foreground font-mono">
          시도 {attempts}/{MAX_ATTEMPTS}
        </span>
        {attemptsExhausted && !passed && (
          <Button variant="outline" size="sm" onClick={skipAfterMax}>
            <SkipForward className="w-3 h-3 mr-1" /> 다음 단계로
          </Button>
        )}
      </div>
    </Card>
  );
};

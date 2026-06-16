import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Check, Eye, EyeOff } from "lucide-react";
import { fetchTranslation, upsertTranslation } from "@/integrations/supabase/storage";
import { toast } from "@/hooks/use-toast";
import { stripKoreanFromEnglishSource } from "@/lib/sentenceSource";

interface Props {
  sentenceId: string;
  englishSentence: string;
  onSubmitted: (submittedText: string) => void;
}

/**
 * 한글 해석 단계.
 * 정책: 학생이 화면에 들어왔을 때 이전 제출한 한글이 자동으로 보이지 않는다.
 *  - 이전 제출이 있으면 "제출됨" 뱃지만 표시하고, [이전 제출 보기/숨기기] 버튼으로만 노출.
 *  - textarea 는 항상 빈 상태로 시작 → 학생이 새로 작성.
 */
export const TranslationStep = ({ sentenceId, englishSentence, onSubmitted }: Props) => {
  const [text, setText] = useState("");
  const [previousText, setPreviousText] = useState<string | null>(null);
  const [showPrevious, setShowPrevious] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const safeEnglishSentence = stripKoreanFromEnglishSource(englishSentence);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setText("");
    setShowPrevious(false);
    setPreviousText(null);
    setSubmitted(false);

    // 안전망: 5초 안에 응답이 없으면 강제로 입력 가능 상태로 전환
    // (네트워크 지연/RLS reject 등으로 영원히 로딩 멈추는 현상 방지)
    const safetyTimer = window.setTimeout(() => {
      if (mounted) setLoading(false);
    }, 5000);

    fetchTranslation(sentenceId)
      .then((t) => {
        if (!mounted) return;
        if (t) {
          setPreviousText(t);
          setSubmitted(true);
        }
      })
      .catch((e) => {
        // 조용히 실패: 학생은 새로 작성하면 됨
        console.warn("[TranslationStep] fetchTranslation failed", e);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
      window.clearTimeout(safetyTimer);
    };
  }, [sentenceId]);

  const handleSubmit = async () => {
    if (!text.trim()) {
      toast({ title: "해석을 입력하세요", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await upsertTranslation(sentenceId, text.trim());
      setPreviousText(text.trim());
      setSubmitted(true);
      toast({ title: "해석 저장 완료" });
      onSubmitted(text.trim());
    } catch (e) {
      toast({ title: "저장 실패", description: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="space-y-1">
        <div className="text-xs text-muted-foreground">원문</div>
        <div className="text-base font-medium leading-relaxed">{safeEnglishSentence}</div>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <label className="text-sm font-semibold">정독 기준 한글 해석</label>
          {previousText && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[11px]"
              onClick={() => setShowPrevious((v) => !v)}
            >
              {showPrevious ? (
                <>
                  <EyeOff className="w-3 h-3 mr-1" /> 이전 제출 숨기기
                </>
              ) : (
                <>
                  <Eye className="w-3 h-3 mr-1" /> 이전 제출 보기
                </>
              )}
            </Button>
          )}
        </div>
        {showPrevious && previousText && (
          <div className="text-xs p-2 rounded-md bg-muted/40 border border-border whitespace-pre-wrap">
            <span className="text-muted-foreground font-bold">이전 제출:</span> {previousText}
          </div>
        )}
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="문장의 의미를 한국어로 정확하게 적어주세요."
          rows={3}
          disabled={loading}
        />
        <div className="flex items-center gap-2 justify-end">
          {submitted && (
            <span className="inline-flex items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400">
              <Check className="w-4 h-4" /> 제출됨
            </span>
          )}
          <Button onClick={handleSubmit} disabled={saving || loading || !text.trim()}>
            {submitted ? "다시 제출" : "해석 제출"}
          </Button>
        </div>
      </div>
    </Card>
  );
};

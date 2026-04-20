import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Check } from "lucide-react";
import { fetchTranslation, upsertTranslation } from "@/integrations/supabase/storage";
import { toast } from "@/hooks/use-toast";

interface Props {
  sentenceId: string;
  englishSentence: string;
  onSubmitted: () => void;
}

export const TranslationStep = ({ sentenceId, englishSentence, onSubmitted }: Props) => {
  const [text, setText] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    fetchTranslation(sentenceId).then((t) => {
      if (!mounted) return;
      if (t) {
        setText(t);
        setSubmitted(true);
      } else {
        setText("");
        setSubmitted(false);
      }
      setLoading(false);
    });
    return () => {
      mounted = false;
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
      setSubmitted(true);
      toast({ title: "해석 저장 완료" });
      onSubmitted();
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
        <div className="text-base font-medium leading-relaxed">{englishSentence}</div>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-semibold">정독 기준 한글 해석</label>
        <Textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (submitted) setSubmitted(false);
          }}
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

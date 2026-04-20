import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { runExtraction } from "@/lib/wordExtraction";

interface Props {
  sentenceId: string;
  english: string;
}

/** 선생님/관리자 전용. AI로 PRE 단어 추출 → sentence_word_extractions 캐시 갱신. */
export const AiExtractButton = ({ sentenceId, english }: Props) => {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await runExtraction(sentenceId, english);
      if ("error" in res) {
        const status = res.status;
        if (status === 429) {
          toast({ title: "잠시 후 다시 시도해 주세요", description: "AI 호출 한도 초과", variant: "destructive" });
        } else if (status === 402) {
          toast({ title: "AI 크레딧이 소진되었어요", description: "Settings → Workspace → Usage", variant: "destructive" });
        } else if (status === 403) {
          toast({ title: "권한이 없습니다", description: "선생님 계정으로 시도해 주세요", variant: "destructive" });
        } else {
          toast({ title: "추출 실패", description: res.error, variant: "destructive" });
        }
        return;
      }
      toast({
        title: "✨ 단어 추출 완료",
        description: `${res.count}개 단어가 PRE 학습 목록에 반영됩니다.`,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={handleClick}
      disabled={loading || !english.trim()}
      className="gap-1.5 border-primary/40 text-primary hover:bg-primary/10 hover:text-primary"
    >
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
      <span className="hidden sm:inline font-kr text-[11px] font-bold">AI 단어 추출</span>
    </Button>
  );
};

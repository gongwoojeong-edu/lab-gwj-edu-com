import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, LogOut, Sparkles } from "lucide-react";
import { SENTENCES, type Sentence } from "@/data/sentences";
import { signOut } from "@/hooks/useAuth";
import { LEVEL_LABEL } from "@/lib/levels";

/**
 * 학습 컨테이너 — PRE → 분석+해석 → POST 순차.
 * 본 라운드에서는 라우팅 골격만 마련하고, 각 단계 UI는 후속 라운드에서 채워 넣습니다.
 * (분석기 본체는 / 경로의 Index.tsx에 그대로 보존되어 있습니다.)
 */
const SentenceLearn = () => {
  const { sentenceId } = useParams<{ sentenceId: string }>();
  const navigate = useNavigate();
  const [sentence, setSentence] = useState<Sentence | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const found = SENTENCES.find((s) => s.id === sentenceId) ?? null;
    setSentence(found);
    setLoading(false);
  }, [sentenceId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!sentence) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center bg-background">
        <Card className="p-8 space-y-4 max-w-md">
          <div className="text-xl font-bold text-foreground">문장을 찾을 수 없어요</div>
          <p className="text-sm text-muted-foreground">
            요청한 문장 ID <code className="font-mono">{sentenceId}</code> 가 존재하지 않습니다.
          </p>
          <Button onClick={() => navigate("/learn")}>학습 홈으로</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-secondary/30">
      <header className="sticky top-0 z-30 backdrop-blur-md bg-background/70 border-b border-border">
        <div className="max-w-5xl mx-auto px-5 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Button variant="ghost" size="sm" onClick={() => navigate("/learn")}>
              <ArrowLeft className="w-4 h-4 mr-1" />
              <span className="hidden sm:inline">홈</span>
            </Button>
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground">
                {LEVEL_LABEL[sentence.level]} · {sentence.id}
              </div>
              <div className="text-sm font-bold text-foreground truncate max-w-[60vw]">
                {sentence.english}
              </div>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => signOut()}>
            <LogOut className="w-4 h-4 mr-1" />
            <span className="hidden sm:inline">로그아웃</span>
          </Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-8 space-y-6">
        <Card className="p-6 space-y-3 border-primary/30 bg-gradient-to-br from-primary/5 to-accent/5">
          <div className="flex items-center gap-2 text-primary">
            <Sparkles className="w-4 h-4" />
            <span className="text-sm font-bold">학습 화면 준비 중</span>
          </div>
          <p className="text-sm text-foreground/80 leading-relaxed">
            라우팅이 분리되었습니다. 다음 라운드에서 이 자리에{" "}
            <strong>1단어 학습(PRE) → 2구문 분석 + 한글 해석 → 3단어 테스트(POST)</strong>{" "}
            순차 진행 UI를 채워 넣습니다.
          </p>
          <div className="text-xs text-muted-foreground">문장 ID: {sentence.id}</div>
        </Card>
      </main>
    </div>
  );
};

export default SentenceLearn;

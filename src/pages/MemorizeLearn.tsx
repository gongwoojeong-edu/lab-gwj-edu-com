import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2, BookOpen } from "lucide-react";
import { hydrateSentencesFromDb, loadSentenceByCode } from "@/lib/sentenceSource";
import type { Sentence } from "@/data/sentences";
import { fetchTaskModeForSentence } from "@/lib/fetchTaskMode";
import { TASK_MODE_LABEL, type TaskMode } from "@/lib/taskMode";
import { useAuth } from "@/hooks/useAuth";

const MemorizeLearn = () => {
  const { sentenceId } = useParams<{ sentenceId: string }>();
  const navigate = useNavigate();
  const { roles } = useAuth();
  const isStaff = roles.includes("teacher") || roles.includes("admin");

  const [sentence, setSentence] = useState<Sentence | null>(null);
  const [taskMode, setTaskMode] = useState<TaskMode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sentenceId) return;
    let mounted = true;
    setLoading(true);
    (async () => {
      try {
        await hydrateSentencesFromDb(true);
        const found = await loadSentenceByCode(sentenceId);
        if (!found) {
          if (mounted) setError("지문을 찾을 수 없습니다.");
          return;
        }
        const ctx = await fetchTaskModeForSentence(sentenceId);
        if (mounted) {
          setSentence(found);
          setTaskMode(ctx.taskMode);
        }
      } catch (e) {
        if (mounted) setError((e as Error).message);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [sentenceId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !sentence) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6">
        <p className="text-muted-foreground">{error ?? "지문 없음"}</p>
        <Button variant="outline" onClick={() => navigate("/learn")}>
          홈으로
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b bg-background/90 backdrop-blur px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/learn")}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-muted-foreground">문장암기</div>
          <div className="font-bold truncate">{sentence.id}</div>
        </div>
        {taskMode && (
          <Badge variant="secondary">{TASK_MODE_LABEL[taskMode]}</Badge>
        )}
      </header>

      <main className="max-w-2xl mx-auto p-5 space-y-6">
        <Card className="p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <BookOpen className="w-4 h-4" />
            대상 문장
          </div>
          <p className="text-base leading-relaxed">{sentence.english}</p>
          {sentence.korean && (
            <p className="text-sm text-muted-foreground border-t pt-3">{sentence.korean}</p>
          )}
        </Card>

        <Card className="p-6 space-y-4 text-center">
          <h2 className="text-lg font-bold">문장암기 학습 (준비 중)</h2>
          <p className="text-sm text-muted-foreground">
            듣기·딕테이션 → 어순배열 → 빈칸채우기 단계가 곧 연결됩니다.
            <br />
            선생님이 지정한 테스크:{" "}
            <strong>{taskMode ? TASK_MODE_LABEL[taskMode] : "—"}</strong>
          </p>
          {isStaff && (
            <Button variant="outline" size="sm" asChild>
              <Link to={`/learn/sentence/${encodeURIComponent(sentence.id)}`}>
                구문 학습 화면 (선생님)
              </Link>
            </Button>
          )}
        </Card>
      </main>
    </div>
  );
};

export default MemorizeLearn;

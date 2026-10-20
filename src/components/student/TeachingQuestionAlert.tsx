import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { MessageCircleQuestion } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { fetchOpenQuestionsForStudent, subscribeTeachingQuestions, type TeachingQuestion } from "@/lib/teachingQuestions";

/** Questions are delivered independently of the active teaching session/current sentence. */
export function TeachingQuestionAlert() {
  const { user, role } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [questions, setQuestions] = useState<TeachingQuestion[]>([]);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const uid = role === "student" ? user?.id : undefined;

  useEffect(() => {
    setQuestions([]);
    setError(false);
    if (!uid) return;
    let alive = true;
    let version = 0;
    let failed = false;
    const reload = async () => {
      const request = ++version;
      try {
        const next = await fetchOpenQuestionsForStudent(uid);
        if (!alive || request !== version) return;
        setQuestions(next);
        setError(false);
        failed = false;
      } catch {
        if (!alive || request !== version) return;
        setError(true);
        if (!failed) toast({ title: "添삭 질문을 불러오지 못했어요".replace("添", "첨"), description: "다시 불러오기를 눌러 주세요.", variant: "destructive" });
        failed = true;
      }
    };
    void reload();
    const unsubscribe = subscribeTeachingQuestions(uid, () => void reload());
    return () => { alive = false; unsubscribe(); };
  }, [uid, retry]);

  const current = questions[0];
  if (!uid || pathname.startsWith("/teacher") || (!current && !error)) return null;
  // The sentence's own response panel is already visible on this page.
  if (!error && current && pathname === `/learn/sentence/${encodeURIComponent(current.sentence_id)}`) return null;

  return (
    <div className="sticky top-0 z-[70] border-b border-primary/30 bg-background shadow-sm" role="status">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
        <MessageCircleQuestion className="h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{error ? "첨삭 질문을 불러오지 못했어요" : `선생님 질문 · ${questions.length}문항`}</p>
          {current && <p className="line-clamp-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">{current.question}</p>}
        </div>
        <Button size="sm" className="shrink-0" onClick={() => error ? setRetry((value) => value + 1) : current && navigate(`/learn/sentence/${encodeURIComponent(current.sentence_id)}`)}>
          {error ? "다시 불러오기" : "답변하기"}
        </Button>
      </div>
    </div>
  );
}
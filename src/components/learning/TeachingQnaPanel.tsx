// ============================================================
// TeachingQnaPanel — 첨삭 문답 (선생님 질문 → 학생 답변 → O/X 판정)
//   role="teacher"  : 질문 작성/전송 + 판정
//   role="student"  : 답변 입력/선택
//   role="readonly" : 기록 보기 전용
// ============================================================
import { useCallback, useEffect, useState } from "react";
import { MessageCircleQuestion, Check, X, Send, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  answerTeachingQuestion,
  fetchTeachingQuestions,
  judgeTeachingQuestion,
  sendTeachingQuestion,
  subscribeTeachingQuestions,
  type TeachingQuestion,
} from "@/lib/teachingQuestions";

interface Props {
  studentUserId: string;
  sentenceId: string;
  role: "teacher" | "student" | "readonly";
  className?: string;
}

export const TeachingQnaPanel = ({ studentUserId, sentenceId, role, className }: Props) => {
  const [rows, setRows] = useState<TeachingQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [question, setQuestion] = useState("");
  const [choices, setChoices] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(() => {
    fetchTeachingQuestions(studentUserId, sentenceId)
      .then(setRows)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [studentUserId, sentenceId]);

  useEffect(() => {
    setLoading(true);
    reload();
    return subscribeTeachingQuestions(studentUserId, reload);
  }, [studentUserId, reload]);

  const send = async () => {
    if (!question.trim() || sending) return;
    setSending(true);
    try {
      await sendTeachingQuestion(studentUserId, sentenceId, question, choices);
      setQuestion("");
      setChoices([]);
      reload();
    } catch (e) {
      toast({
        title: "질문 전송 실패",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const answer = async (id: string, text: string) => {
    if (!text.trim()) return;
    setBusyId(id);
    try {
      await answerTeachingQuestion(id, text);
      setDrafts((p) => ({ ...p, [id]: "" }));
      reload();
    } catch (e) {
      toast({
        title: "답변 제출 실패",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  };

  const judge = async (id: string, verdict: "correct" | "wrong") => {
    setBusyId(id);
    try {
      await judgeTeachingQuestion(id, verdict);
      reload();
    } catch (e) {
      toast({
        title: "판정 저장 실패",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  };

  if (role === "readonly" && !loading && rows.length === 0) return null;

  return (
    <div className={cn("rounded-md border border-sky-500/40 bg-sky-500/5 p-3 space-y-3", className)}>
      <div className="text-xs font-bold text-sky-700 dark:text-sky-300 flex items-center gap-1">
        <MessageCircleQuestion className="w-3.5 h-3.5" /> 첨삭 문답
        {rows.length > 0 && <span className="text-muted-foreground font-normal">· {rows.length}문항</span>}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> 불러오는 중…
        </div>
      ) : rows.length === 0 ? (
        <div className="text-xs text-muted-foreground">
          {role === "teacher"
            ? "아래에 질문을 입력해 학생 화면으로 보낼 수 있어요."
            : "선생님이 질문을 보내면 이곳에 표시됩니다."}
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const draft = drafts[r.id] ?? "";
            const canAnswer = role === "student" && !r.answer;
            const canRetry = role === "student" && r.verdict === "wrong";
            return (
              <div key={r.id} className="rounded-md border bg-card p-2 space-y-2">
                <div className="text-sm">
                  <span className="text-[11px] font-bold text-muted-foreground mr-1.5">선생님</span>
                  <span className="font-medium whitespace-pre-wrap">{r.question}</span>
                </div>

                {r.answer && (
                  <div className="flex items-start gap-2">
                    <div className="text-sm flex-1">
                      <span className="text-[11px] font-bold text-muted-foreground mr-1.5">학생</span>
                      <span className="whitespace-pre-wrap">{r.answer}</span>
                    </div>
                    {r.verdict === "correct" && (
                      <span className="text-emerald-600 font-bold text-lg leading-none">⭕</span>
                    )}
                    {r.verdict === "wrong" && (
                      <span className="text-rose-600 font-bold text-lg leading-none">❌</span>
                    )}
                  </div>
                )}

                {role === "teacher" && r.answer && (
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      variant={r.verdict === "correct" ? "default" : "outline"}
                      className="h-7 text-[11px]"
                      disabled={busyId === r.id}
                      onClick={() => judge(r.id, "correct")}
                    >
                      <Check className="w-3.5 h-3.5 mr-1" /> 정답
                    </Button>
                    <Button
                      size="sm"
                      variant={r.verdict === "wrong" ? "destructive" : "outline"}
                      className="h-7 text-[11px]"
                      disabled={busyId === r.id}
                      onClick={() => judge(r.id, "wrong")}
                    >
                      <X className="w-3.5 h-3.5 mr-1" /> 오답
                    </Button>
                  </div>
                )}

                {(canAnswer || canRetry) &&
                  (r.choices && r.choices.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {r.choices.map((c, i) => (
                        <Button
                          key={i}
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs"
                          disabled={busyId === r.id}
                          onClick={() => answer(r.id, c)}
                        >
                          {c}
                        </Button>
                      ))}
                    </div>
                  ) : (
                    <div className="flex gap-1.5">
                      <Input
                        value={draft}
                        placeholder="답을 입력하세요"
                        className="h-8 text-sm"
                        disabled={busyId === r.id}
                        onChange={(e) => setDrafts((p) => ({ ...p, [r.id]: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            answer(r.id, draft);
                          }
                        }}
                      />
                      <Button
                        size="sm"
                        className="h-8"
                        disabled={busyId === r.id || !draft.trim()}
                        onClick={() => answer(r.id, draft)}
                      >
                        제출
                      </Button>
                    </div>
                  ))}

                {role === "student" && r.verdict === "wrong" && (
                  <div className="text-[11px] text-rose-600">다시 한 번 답해 볼까요?</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {role === "teacher" && (
        <div className="space-y-1.5 pt-1 border-t border-sky-500/30">
          <Textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="예) they의 지시어는?"
            rows={2}
            className="text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                send();
              }
            }}
          />
          {choices.length > 0 && (
            <div className="space-y-1">
              {choices.map((c, i) => (
                <div key={i} className="flex gap-1.5">
                  <Input
                    value={c}
                    placeholder={`보기 ${i + 1}`}
                    className="h-8 text-sm"
                    onChange={(e) =>
                      setChoices((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))
                    }
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2"
                    onClick={() => setChoices((prev) => prev.filter((_, j) => j !== i))}
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-1.5">
            {choices.length < 4 && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-[11px]"
                onClick={() => setChoices((prev) => [...prev, ""])}
              >
                <Plus className="w-3.5 h-3.5 mr-1" /> 보기 추가
              </Button>
            )}
            <Button
              size="sm"
              className="h-8 ml-auto"
              disabled={sending || !question.trim()}
              onClick={send}
            >
              <Send className="w-3.5 h-3.5 mr-1" /> 질문 보내기
            </Button>
          </div>
          <div className="text-[11px] text-muted-foreground">
            보기를 2개 이상 추가하면 객관식, 비워두면 자유 입력형으로 전송됩니다.
          </div>
        </div>
      )}
    </div>
  );
};

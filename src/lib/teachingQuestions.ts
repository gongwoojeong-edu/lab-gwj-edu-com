// ============================================================
// teachingQuestions — 첨삭(티칭) 중 선생님 질문 / 학생 답변 / O·X 판정
//   · DB(teaching_questions)에 기록으로 남고, Realtime 으로 즉시 반영
// ============================================================
import { supabase } from "@/integrations/supabase/client";
import { getCurrentUserId } from "@/lib/authState";

export type Verdict = "correct" | "wrong";

export interface TeachingQuestion {
  id: string;
  user_id: string;
  teacher_id: string | null;
  sentence_id: string;
  question: string;
  choices: string[] | null;
  answer: string | null;
  answered_at: string | null;
  verdict: Verdict | null;
  judged_at: string | null;
  created_at: string;
}

const normalize = (r: Record<string, unknown>): TeachingQuestion => ({
  id: String(r.id),
  user_id: String(r.user_id),
  teacher_id: (r.teacher_id as string | null) ?? null,
  sentence_id: String(r.sentence_id),
  question: String(r.question ?? ""),
  choices: Array.isArray(r.choices) ? (r.choices as string[]) : null,
  answer: (r.answer as string | null) ?? null,
  answered_at: (r.answered_at as string | null) ?? null,
  verdict: (r.verdict as Verdict | null) ?? null,
  judged_at: (r.judged_at as string | null) ?? null,
  created_at: String(r.created_at),
});

/** 특정 학생·문장의 문답 전체 (오래된 순) */
export const fetchTeachingQuestions = async (
  studentUserId: string,
  sentenceId: string,
): Promise<TeachingQuestion[]> => {
  const { data, error } = await supabase
    .from("teaching_questions")
    .select("*")
    .eq("user_id", studentUserId)
    .eq("sentence_id", sentenceId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(normalize);
};

/** 선생님: 질문 보내기 (choices 비우면 자유 입력형) */
export const sendTeachingQuestion = async (
  studentUserId: string,
  sentenceId: string,
  question: string,
  choices?: string[],
): Promise<TeachingQuestion> => {
  const teacherId = await getCurrentUserId();
  const clean = (choices ?? []).map((c) => c.trim()).filter(Boolean);
  const { data, error } = await supabase
    .from("teaching_questions")
    .insert({
      user_id: studentUserId,
      teacher_id: teacherId,
      sentence_id: sentenceId,
      question: question.trim(),
      choices: clean.length >= 2 ? clean : null,
    } as never)
    .select("*")
    .single();
  if (error) throw error;
  return normalize(data as Record<string, unknown>);
};

/** 학생: 답변 제출 (재답변 시 판정 초기화) */
export const answerTeachingQuestion = async (
  id: string,
  answer: string,
): Promise<void> => {
  const { error } = await supabase
    .from("teaching_questions")
    .update({
      answer: answer.trim(),
      answered_at: new Date().toISOString(),
      verdict: null,
      judged_at: null,
    } as never)
    .eq("id", id);
  if (error) throw error;
};

/** 선생님: O/X 판정 */
export const judgeTeachingQuestion = async (
  id: string,
  verdict: Verdict,
): Promise<void> => {
  const { error } = await supabase
    .from("teaching_questions")
    .update({ verdict, judged_at: new Date().toISOString() } as never)
    .eq("id", id);
  if (error) throw error;
};

/** 선생님: 질문 삭제(잘못 보낸 경우) — 정책상 교사만 update 가능하므로 soft 처리 대신 delete 미지원 */
export const subscribeTeachingQuestions = (
  studentUserId: string,
  onChange: () => void,
): (() => void) => {
  const channel = supabase
    .channel(`tq_${studentUserId}_${Math.random().toString(36).slice(2)}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "teaching_questions",
        filter: `user_id=eq.${studentUserId}`,
      },
      () => onChange(),
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
};

// ============================================================
// teachingSession.ts — 보류 문장 티칭 모드
//   · 선생님이 [티칭 시작] → 학생 화면에 해당 문장 오버레이 표시
//   · 신호는 student_notifications(kind='teaching') 행 1건으로 저장
//   · 선생님 메모 타이핑은 DB 저장 없이 Realtime broadcast 로만 중계
// ============================================================
import { supabase } from "@/integrations/supabase/client";
import { getCurrentUserId } from "@/lib/authState";

export const TEACHING_KIND = "teaching";

export interface TeachingSignal {
  id: string;
  sentence_id: string | null;
  created_at: string;
}

export const teachingChannelName = (studentUserId: string) =>
  `teaching-${studentUserId}`;

/** 선생님: 학생 화면에 문장 띄우기 */
export const startTeaching = async (
  studentUserId: string,
  sentenceId: string,
): Promise<void> => {
  await stopTeaching(studentUserId);
  const sender = await getCurrentUserId();
  const { error } = await supabase.from("student_notifications").insert({
    user_id: studentUserId,
    kind: TEACHING_KIND,
    title: "선생님이 이 문장을 함께 보고 있어요",
    sentence_id: sentenceId,
    sent_by: sender,
  });
  if (error) throw error;
};

/** 티칭 종료 — 열려 있는 teaching 신호를 읽음 처리 */
export const stopTeaching = async (studentUserId: string): Promise<void> => {
  await supabase
    .from("student_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", studentUserId)
    .eq("kind", TEACHING_KIND)
    .is("read_at", null);
};

/** 현재 진행중인 티칭 신호(학생 본인 또는 지정 학생) */
export const fetchActiveTeaching = async (
  userId: string,
): Promise<TeachingSignal | null> => {
  const { data } = await supabase
    .from("student_notifications")
    .select("id, sentence_id, created_at")
    .eq("user_id", userId)
    .eq("kind", TEACHING_KIND)
    .is("read_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as TeachingSignal | null) ?? null;
};

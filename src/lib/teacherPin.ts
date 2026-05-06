import { supabase } from "@/integrations/supabase/client";

const cleanPin = (value: unknown): string | null => {
  const pin = typeof value === "string" ? value.trim() : "";
  return pin.length > 0 ? pin : null;
};

export const fetchTeacherPin = async (): Promise<string | null> => {
  // getUser()는 auth 토큰 lock을 잡을 수 있어, 학습 화면의 제출/오버라이드와 충돌할 수 있다.
  // RLS가 이미 학생=본인 행, 선생님/관리자=허용 행만 노출하므로 DB 조회만으로 PIN을 가져온다.
  const { data, error } = await supabase
    .from("student_profiles")
    .select("teacher_pin")
    .not("teacher_pin", "is", null)
    .neq("teacher_pin", "")
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  return cleanPin(data?.teacher_pin);
};
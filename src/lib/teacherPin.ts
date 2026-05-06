import { supabase } from "@/integrations/supabase/client";

const cleanPin = (value: unknown): string | null => {
  const pin = typeof value === "string" ? value.trim() : "";
  return pin.length > 0 ? pin : null;
};

export const fetchTeacherPin = async (): Promise<string | null> => {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return null;

  const own = await supabase
    .from("student_profiles")
    .select("teacher_pin")
    .eq("user_id", u.user.id)
    .maybeSingle();
  const ownPin = cleanPin(own.data?.teacher_pin);
  if (ownPin) return ownPin;

  // 학생은 RLS상 본인 행만 보여 여기서도 타인 PIN을 볼 수 없다.
  // 선생님/관리자가 학생 화면을 확인하는 경우에는 본인 student_profile이 없으므로
  // 등록된 학생 PIN 중 하나를 안전망으로 사용한다.
  const fallback = await supabase
    .from("student_profiles")
    .select("teacher_pin")
    .not("teacher_pin", "is", null)
    .limit(1)
    .maybeSingle();

  return cleanPin(fallback.data?.teacher_pin);
};
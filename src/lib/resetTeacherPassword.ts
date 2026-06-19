import { supabase } from "@/integrations/supabase/client";

const db = supabase as unknown as { from: (table: string) => any };

export type ResetTeacherPasswordResult = {
  ok: boolean;
  error?: string;
  loginId?: string;
  password?: string;
  email?: string;
  name?: string | null;
  userId?: string;
};

/** admin: 선생님 비밀번호를 초기값(아이디+마지막 숫자)으로 재설정 */
export async function resetTeacherPassword(opts: {
  userId?: string;
  loginId?: string;
}): Promise<ResetTeacherPasswordResult> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return { ok: false, error: "로그인이 필요합니다." };
  }

  const { data, error } = await supabase.functions.invoke("reset-teacher-password", {
    body: opts,
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  const result = (data ?? {}) as ResetTeacherPasswordResult;
  if (result.ok === false) {
    return { ok: false, error: result.error ?? "비밀번호 초기화 실패" };
  }

  return result;
}

export type TeacherAccountRow = {
  user_id: string;
  name: string;
  login_id: string;
};

/** Orbit 캐시에서 auth 연결된 선생님 목록 */
export async function fetchTeacherAccounts(): Promise<TeacherAccountRow[]> {
  const { data, error } = await db
    .from("orbit_staff_cache")
    .select("auth_user_id, name, employee_no")
    .not("auth_user_id", "is", null)
    .eq("active", true)
    .order("name");

  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) return [];
    throw error;
  }

  return (data ?? [])
    .filter((r) => r.auth_user_id && r.employee_no)
    .map((r) => ({
      user_id: r.auth_user_id as string,
      name: r.name as string,
      login_id: (r.employee_no as string).toLowerCase(),
    }));
}

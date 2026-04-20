import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/hooks/useAuth";

/** 모든 user_roles 행을 가져와 user_id → role[] 맵으로 변환. admin만 호출 가능. */
export const fetchAllUserRoles = async (): Promise<Record<string, AppRole[]>> => {
  const { data, error } = await supabase.from("user_roles").select("user_id, role");
  if (error) throw error;
  const map: Record<string, AppRole[]> = {};
  ((data ?? []) as { user_id: string; role: AppRole }[]).forEach((r) => {
    (map[r.user_id] ??= []).push(r.role);
  });
  return map;
};

/** 특정 사용자에게 역할을 추가. admin만 가능. */
export const addUserRole = async (userId: string, role: AppRole): Promise<void> => {
  const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
  if (error && !/duplicate/i.test(error.message)) throw error;
};

/** 특정 사용자에게서 역할을 제거. admin만 가능. */
export const removeUserRole = async (userId: string, role: AppRole): Promise<void> => {
  const { error } = await supabase
    .from("user_roles")
    .delete()
    .eq("user_id", userId)
    .eq("role", role);
  if (error) throw error;
};

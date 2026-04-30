import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { purgeAllGwjKeysForUser } from "@/lib/cacheCleanup";

export type AppRole = "student" | "teacher" | "admin";

interface AuthState {
  session: Session | null;
  user: User | null;
  roles: AppRole[];
  loading: boolean;
}

export const useAuth = (): AuthState => {
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // IMPORTANT: subscribe FIRST, then get session.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.user) {
        // defer role fetch to avoid deadlock
        setTimeout(() => fetchRoles(s.user.id), 0);
      } else {
        setRoles([]);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user) {
        fetchRoles(data.session.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const fetchRoles = async (userId: string) => {
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    setRoles(((data ?? []) as { role: AppRole }[]).map((r) => r.role));
  };

  return { session, user: session?.user ?? null, roles, loading };
};

export const signOut = async () => {
  // 로그아웃 직전 현재 user의 gwj.* localStorage 키 일괄 정리.
  // (공용 PC에서 다른 학생 로그인 시 잔재 노출 방지)
  try {
    const { data } = await supabase.auth.getUser();
    const uid = data.user?.id;
    if (uid) purgeAllGwjKeysForUser(uid);
  } catch {
    /* ignore */
  }
  return supabase.auth.signOut();
};

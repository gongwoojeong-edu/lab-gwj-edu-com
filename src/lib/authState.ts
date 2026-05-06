import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "student" | "teacher" | "admin";

export interface AuthSnapshot {
  session: Session | null;
  user: User | null;
  roles: AppRole[];
  loading: boolean;
}

let snapshot: AuthSnapshot = {
  session: null,
  user: null,
  roles: [],
  loading: true,
};

const listeners = new Set<() => void>();
let started = false;
let roleRequestId = 0;

const emit = () => listeners.forEach((listener) => listener());

const setSnapshot = (patch: Partial<AuthSnapshot>) => {
  snapshot = { ...snapshot, ...patch };
  emit();
};

const loadRoles = async (userId: string, requestId: number) => {
  try {
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    if (requestId !== roleRequestId || snapshot.user?.id !== userId) return;
    setSnapshot({
      roles: ((data ?? []) as { role: AppRole }[]).map((r) => r.role),
      loading: false,
    });
  } catch (error) {
    console.warn("[authState] role load failed", error);
    if (requestId === roleRequestId && snapshot.user?.id === userId) {
      setSnapshot({ roles: [], loading: false });
    }
  }
};

const applySession = (session: Session | null) => {
  const user = session?.user ?? null;
  roleRequestId += 1;
  const requestId = roleRequestId;

  if (!user) {
    setSnapshot({ session: null, user: null, roles: [], loading: false });
    return;
  }

  setSnapshot({ session, user, loading: true });
  window.setTimeout(() => void loadRoles(user.id, requestId), 0);
};

export const ensureAuthStarted = () => {
  if (started) return;
  started = true;

  supabase.auth.onAuthStateChange((_event, session) => {
    window.setTimeout(() => applySession(session), 0);
  });

  supabase.auth
    .getSession()
    .then(({ data }) => applySession(data.session))
    .catch((error) => {
      console.warn("[authState] initial session load failed", error);
      setSnapshot({ session: null, user: null, roles: [], loading: false });
    });
};

export const getAuthSnapshot = () => snapshot;

export const subscribeAuthState = (listener: () => void) => {
  ensureAuthStarted();
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const waitForAuthReady = (timeoutMs = 1500): Promise<AuthSnapshot> => {
  ensureAuthStarted();
  if (!snapshot.loading) return Promise.resolve(snapshot);

  return new Promise((resolve) => {
    let unsubscribe: (() => void) | null = null;
    const done = () => {
      if (unsubscribe) unsubscribe();
      window.clearTimeout(timer);
      resolve(snapshot);
    };
    const timer = window.setTimeout(done, timeoutMs);
    unsubscribe = subscribeAuthState(() => {
      if (!snapshot.loading) done();
    });
  });
};

export const getCurrentUserId = async (timeoutMs = 1500): Promise<string | null> => {
  ensureAuthStarted();
  if (snapshot.user?.id) return snapshot.user.id;
  const ready = await waitForAuthReady(timeoutMs);
  return ready.user?.id ?? null;
};
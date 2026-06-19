import { supabase } from "@/integrations/supabase/client";

export type OrbitEnglishSyncResult = {
  ok: boolean;
  error?: string;
  teachersSynced?: number;
  studentsSynced?: number;
  studentsSkipped?: number;
  studentsExcluded?: number;
  studentsFailed?: number;
  deactivated?: number;
};

/** Orbit(영어과) → student_profiles · 선생님 계정 동기화 */
export async function syncOrbitEnglishProfiles(): Promise<OrbitEnglishSyncResult> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return { ok: false, error: "로그인이 필요합니다." };
  }

  const { data, error } = await supabase.functions.invoke("sync-orbit-english", {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  if (error) {
    const context = (error as { context?: { json?: () => Promise<unknown>; text?: () => Promise<string> } }).context;
    try {
      const body = await context?.json?.();
      const message = (body as { error?: string } | null)?.error;
      if (message) return { ok: false, error: message };
    } catch {
      try {
        const text = await context?.text?.();
        if (text) return { ok: false, error: text };
      } catch {
        // fall through to the SDK message
      }
    }
    return { ok: false, error: error.message || "동기화 함수 호출 실패" };
  }

  const result = (data ?? {}) as OrbitEnglishSyncResult;
  if (result.ok === false) {
    return { ok: false, error: result.error ?? "동기화 실패" };
  }

  return result;
}

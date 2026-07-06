// ============================================================
// paragraphFlowProgress — 단락흐름암기 진도
// ============================================================
import { supabase } from "@/integrations/supabase/client";
import { getCurrentUserId } from "@/lib/authState";

export interface ParagraphFlowProgress {
  unit_id: string;
  attempt_count: number;
  passed_at: string | null;
  best_score: number | null;
}

export async function fetchParagraphFlowProgress(
  unitId: string,
): Promise<ParagraphFlowProgress | null> {
  const userId = await getCurrentUserId();
  if (!userId) return null;
  const { data, error } = await supabase
    .from("paragraph_flow_progress")
    .select("unit_id, attempt_count, passed_at, best_score")
    .eq("user_id", userId)
    .eq("unit_id", unitId)
    .maybeSingle();
  if (error) throw error;
  return (data as ParagraphFlowProgress) ?? null;
}

export async function saveParagraphFlowAttempt(
  unitId: string,
  score: number,
  passed: boolean,
): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("로그인이 필요합니다.");

  const existing = await fetchParagraphFlowProgress(unitId);
  const attempt_count = (existing?.attempt_count ?? 0) + 1;
  const best_score = Math.max(existing?.best_score ?? 0, score);

  const { error } = await supabase.from("paragraph_flow_progress").upsert(
    {
      user_id: userId,
      unit_id: unitId,
      attempt_count,
      best_score,
      passed_at: passed ? new Date().toISOString() : existing?.passed_at ?? null,
      updated_at: new Date().toISOString(),
    } as Record<string, unknown>,
    { onConflict: "user_id,unit_id" },
  );
  if (error) throw error;
}

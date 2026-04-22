// ============================================================
// masterAvailability.ts — sentence별 마스터(원장 admin) 답안 존재 여부 일괄 조회
// 선생님 화면에서 "마스터 미등록" 표시/승인 비활성을 위해 사용.
// ============================================================
import { supabase } from "@/integrations/supabase/client";

const fetchAdminUserIds = async (): Promise<string[]> => {
  const { data } = await supabase
    .from("user_roles")
    .select("user_id")
    .eq("role", "admin");
  return ((data ?? []) as { user_id: string }[]).map((r) => r.user_id);
};

/** sentenceIds 각각에 대해 마스터(원장 owner_progress) 1건이라도 있는지 → boolean map */
export const fetchMasterAvailability = async (
  sentenceIds: string[],
): Promise<Record<string, boolean>> => {
  const out: Record<string, boolean> = {};
  if (sentenceIds.length === 0) return out;
  const adminIds = await fetchAdminUserIds();
  if (adminIds.length === 0) {
    sentenceIds.forEach((id) => (out[id] = false));
    return out;
  }
  const { data } = await supabase
    .from("owner_progress")
    .select("sentence_id")
    .in("sentence_id", sentenceIds)
    .in("user_id", adminIds)
    .limit(1000);
  const set = new Set<string>(
    ((data ?? []) as { sentence_id: string }[]).map((r) => r.sentence_id),
  );
  sentenceIds.forEach((id) => (out[id] = set.has(id)));
  return out;
};

/** 단건용 */
export const hasMasterForSentence = async (sentenceId: string): Promise<boolean> => {
  const map = await fetchMasterAvailability([sentenceId]);
  return !!map[sentenceId];
};

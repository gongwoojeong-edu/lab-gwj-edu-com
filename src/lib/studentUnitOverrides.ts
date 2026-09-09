// ============================================================
// studentUnitOverrides — 학생별 "유닛 통째로 건너뛰기"
// student_unit_overrides.skip_unit 사용.
// 유닛 단위로 저장하므로 이후 지문이 추가/삭제돼도 자동 반영된다.
// ============================================================
import { supabase } from "@/integrations/supabase/client";
import { getCurrentUserId } from "@/lib/authState";

/** 특정 학생의 스킵 지정된 유닛 id 집합 */
export const fetchSkippedUnitIds = async (userId: string): Promise<Set<string>> => {
  const { data, error } = await supabase
    .from("student_unit_overrides")
    .select("unit_id, skip_unit")
    .eq("user_id", userId)
    .eq("skip_unit", true);
  if (error) return new Set();
  return new Set(((data ?? []) as { unit_id: string }[]).map((r) => r.unit_id));
};

/** 스킵 유닛에 속한 모든 지문 code 집합 (지문 변동 자동 반영) */
export const fetchSkippedUnitPassageCodes = async (
  userId: string,
): Promise<Set<string>> => {
  const unitIds = Array.from(await fetchSkippedUnitIds(userId));
  if (unitIds.length === 0) return new Set();
  const out = new Set<string>();
  const CHUNK = 100;
  for (let i = 0; i < unitIds.length; i += CHUNK) {
    const { data } = await supabase
      .from("textbook_passages")
      .select("code")
      .in("unit_id", unitIds.slice(i, i + CHUNK));
    ((data ?? []) as { code: string }[]).forEach((r) => out.add(r.code));
  }
  return out;
};

/** 여러 학생의 유닛 스킵 현황 (userId → unitId 집합) */
export const fetchSkipUnitMapForStudents = async (
  userIds: string[],
  unitIds?: string[],
): Promise<Record<string, Set<string>>> => {
  const map: Record<string, Set<string>> = {};
  if (userIds.length === 0) return map;
  let q = supabase
    .from("student_unit_overrides")
    .select("user_id, unit_id, skip_unit")
    .in("user_id", userIds)
    .eq("skip_unit", true);
  if (unitIds && unitIds.length > 0) q = q.in("unit_id", unitIds);
  const { data } = await q;
  for (const r of (data ?? []) as { user_id: string; unit_id: string }[]) {
    (map[r.user_id] ??= new Set()).add(r.unit_id);
  }
  return map;
};

/** 전체 학생의 유닛별 스킵 현황 (unitId → userId 집합) — 진행률/배지용 */
export const fetchSkipUnitByUnit = async (
  unitIds?: string[],
): Promise<Record<string, Set<string>>> => {
  const map: Record<string, Set<string>> = {};
  let q = supabase
    .from("student_unit_overrides")
    .select("user_id, unit_id, skip_unit")
    .eq("skip_unit", true);
  if (unitIds && unitIds.length > 0) q = q.in("unit_id", unitIds);
  const { data } = await q;
  for (const r of (data ?? []) as { user_id: string; unit_id: string }[]) {
    (map[r.unit_id] ??= new Set()).add(r.user_id);
  }
  return map;
};

/** 학생×유닛 스킵 토글 */
export const upsertSkipUnit = async (
  userId: string,
  unitId: string,
  skip: boolean,
): Promise<void> => {
  const currentUserId = await getCurrentUserId();
  const { error } = await supabase
    .from("student_unit_overrides")
    .upsert(
      { user_id: userId, unit_id: unitId, skip_unit: skip, created_by: currentUserId },
      { onConflict: "user_id,unit_id" },
    );
  if (error) throw error;
};

/** 여러 학생 × 여러 유닛 일괄 지정/해제 */
export const bulkSetSkipUnit = async (
  userIds: string[],
  unitIds: string[],
  skip: boolean,
): Promise<number> => {
  if (userIds.length === 0 || unitIds.length === 0) return 0;
  const currentUserId = await getCurrentUserId();
  const rows = userIds.flatMap((uid) =>
    unitIds.map((unitId) => ({
      user_id: uid,
      unit_id: unitId,
      skip_unit: skip,
      created_by: currentUserId,
    })),
  );
  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase
      .from("student_unit_overrides")
      .upsert(rows.slice(i, i + CHUNK), { onConflict: "user_id,unit_id" });
    if (error) throw error;
  }
  return rows.length;
};

// ============================================================
// fetchMemSettings — 암기 방향·녹음 필수 (선생님 설정 resolve)
// ============================================================
import { supabase } from "@/integrations/supabase/client";
import { getCurrentUserId } from "@/lib/authState";
import { activeAssignmentDueOrFilter } from "@/lib/assignmentDue";
import type { MemDirection } from "@/lib/memorizationText";

export type MemDirectionSetting = "ko_to_en" | "en_to_ko" | "both";

export const MEM_DIRECTION_SETTING_LABEL: Record<MemDirectionSetting, string> = {
  ko_to_en: "한글 → 영문",
  en_to_ko: "영문 → 한글",
  both: "양방향",
};

export interface MemSettingsContext {
  directionSetting: MemDirectionSetting;
  requireRecord: boolean;
  dictationBlankRatio: number;
  unitId: string | null;
}

export async function fetchMemSettingsForSentence(
  sentenceId: string,
): Promise<MemSettingsContext> {
  const userId = await getCurrentUserId();

  const { data: passageRow } = await supabase
    .from("textbook_passages")
    .select("unit_id")
    .eq("code", sentenceId)
    .maybeSingle();

  const unitId = (passageRow as { unit_id: string } | null)?.unit_id ?? null;

  let unitDirection: MemDirectionSetting = "ko_to_en";
  let requireRecord = false;
  let dictationBlankRatio = 0.35;
  if (unitId) {
    const { data: unitRow } = await supabase
      .from("textbook_units")
      .select("default_mem_direction, mem_require_record, mem_dictation_blank_ratio")
      .eq("id", unitId)
      .maybeSingle();
    const u = unitRow as {
      default_mem_direction?: MemDirectionSetting;
      mem_require_record?: boolean;
      mem_dictation_blank_ratio?: number;
    } | null;
    unitDirection = u?.default_mem_direction ?? "ko_to_en";
    requireRecord = !!u?.mem_require_record;
    dictationBlankRatio = u?.mem_dictation_blank_ratio ?? 0.35;
  }

  const nowIso = new Date().toISOString();
  let assignQuery = supabase
    .from("assignments")
    .select("sentence_id, unit_id, mem_direction, due_at")
    .or(activeAssignmentDueOrFilter(nowIso))
    .not("mem_direction", "is", null);

  if (userId) {
    assignQuery = assignQuery.or(`student_id.eq.${userId},student_id.is.null`);
  } else {
    assignQuery = assignQuery.is("student_id", null);
  }

  const { data: assignRows } = await assignQuery;
  const active = ((assignRows ?? []) as Array<{
    sentence_id: string | null;
    unit_id: string | null;
    mem_direction: MemDirectionSetting | null;
  }>).filter((a) => {
    if (!a.mem_direction) return false;
    return (
      a.sentence_id === sentenceId ||
      (unitId && a.unit_id === unitId && !a.sentence_id)
    );
  });

  const sentenceHit = active.find((a) => a.sentence_id === sentenceId);
  const unitHit = active.find((a) => unitId && a.unit_id === unitId && !a.sentence_id);
  const directionSetting =
    sentenceHit?.mem_direction ?? unitHit?.mem_direction ?? unitDirection;

  return { directionSetting, requireRecord, dictationBlankRatio, unitId };
}

/** both 모드에서 현재 진행 중인 트랙 */
export function activeMemTrack(
  setting: MemDirectionSetting,
  memKoToEnDone: boolean,
): MemDirection {
  if (setting === "en_to_ko") return "en_to_ko";
  if (setting === "both" && memKoToEnDone) return "en_to_ko";
  return "ko_to_en";
}

export function displayDirectionLabel(
  setting: MemDirectionSetting,
  track: MemDirection,
): string {
  if (setting === "both") {
    return track === "ko_to_en" ? "양방향 (1/2) 한→영" : "양방향 (2/2) 영→한";
  }
  return MEM_DIRECTION_SETTING_LABEL[setting];
}

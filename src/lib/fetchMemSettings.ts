// ============================================================
// fetchMemSettings — 암기 방향·녹음 필수·옵션단계 (선생님 설정 resolve)
// ============================================================
import { supabase } from "@/integrations/supabase/client";
import { getCurrentUserId } from "@/lib/authState";
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
  includeInterpret: boolean;
  includeTranslate: boolean;
  dictationBlankRatio: number;
  dictationMinScore: number;
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
  let includeInterpret = false;
  let includeTranslate = false;
  let dictationBlankRatio = 0.6;
  let dictationMinScore = 0;
  if (unitId) {
    const { data: unitRow } = await supabase
      .from("textbook_units")
      .select(
        "default_mem_direction, mem_require_record, mem_include_interpret, mem_include_translate, mem_dictation_blank_ratio, mem_dictation_min_score",
      )
      .eq("id", unitId)
      .maybeSingle();
    const u = unitRow as {
      default_mem_direction?: MemDirectionSetting;
      mem_require_record?: boolean;
      mem_include_interpret?: boolean;
      mem_include_translate?: boolean;
      mem_dictation_blank_ratio?: number;
      mem_dictation_min_score?: number;
    } | null;
    unitDirection = u?.default_mem_direction ?? "ko_to_en";
    requireRecord = !!u?.mem_require_record;
    includeInterpret = !!u?.mem_include_interpret;
    includeTranslate = !!u?.mem_include_translate;
    dictationBlankRatio = u?.mem_dictation_blank_ratio ?? 0.6;
    dictationMinScore = u?.mem_dictation_min_score ?? 0;
  }

  let assignQuery = supabase
    .from("assignments")
    .select(
      "sentence_id, unit_id, mem_direction, mem_include_interpret, mem_include_translate, due_at",
    )
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
    mem_include_interpret: boolean | null;
    mem_include_translate: boolean | null;
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

  const overrideInterp = sentenceHit?.mem_include_interpret ?? unitHit?.mem_include_interpret;
  const overrideTrans = sentenceHit?.mem_include_translate ?? unitHit?.mem_include_translate;
  if (overrideInterp != null) includeInterpret = overrideInterp;
  if (overrideTrans != null) includeTranslate = overrideTrans;

  return {
    directionSetting,
    requireRecord,
    includeInterpret,
    includeTranslate,
    dictationBlankRatio,
    dictationMinScore,
    unitId,
  };
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

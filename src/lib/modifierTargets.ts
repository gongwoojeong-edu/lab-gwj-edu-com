// ============================================================
// modifierTargets — 수식 관계(source ownerId → target tokenId)
// localStorage + Supabase modifier_relations 동기화
// ============================================================
import {
  fetchModifierRelations,
  upsertModifierRelation,
  deleteModifierRelation,
} from "@/integrations/supabase/storage";

const STORAGE_KEY = "gwj.modifierTargets.v1";

export interface ModifierTarget {
  /** 수식어(형용사/M) owner id */
  source: string;
  /** 수식 대상 tokenId (단일 인덱스 owner key 그대로 사용 = `${tokenId}::${idx}`) */
  target: string;
}

/** sentenceId → ModifierTarget[] */
export type ModifierTargetMap = Record<string, ModifierTarget[]>;

export const loadModifierTargets = (): ModifierTargetMap => {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as ModifierTargetMap) : {};
  } catch {
    return {};
  }
};

export const saveModifierTargets = (map: ModifierTargetMap) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
};

export const upsertModifierTarget = (
  map: ModifierTargetMap,
  sentenceId: string,
  rel: ModifierTarget,
): ModifierTargetMap => {
  const cur = map[sentenceId] ?? [];
  const next = cur.filter((r) => r.source !== rel.source);
  next.push(rel);
  const merged = { ...map, [sentenceId]: next };
  saveModifierTargets(merged);
  void upsertModifierRelation(sentenceId, {
    source_owner_id: rel.source,
    target_owner_id: rel.target,
  }).catch(() => {});
  return merged;
};

export const removeModifierTargetBySource = (
  map: ModifierTargetMap,
  sentenceId: string,
  source: string,
): ModifierTargetMap => {
  const cur = map[sentenceId] ?? [];
  const next = cur.filter((r) => r.source !== source);
  if (next.length === cur.length) return map;
  const merged = { ...map, [sentenceId]: next };
  saveModifierTargets(merged);
  void deleteModifierRelation(sentenceId, source).catch(() => {});
  return merged;
};

export const getTargetsForSentence = (
  map: ModifierTargetMap,
  sentenceId: string,
): ModifierTarget[] => map[sentenceId] ?? [];

/** 클라우드에서 sentence별 modifier 관계를 가져와 머지 */
export const hydrateModifierTargetsFromCloud = async (
  sentenceId: string,
): Promise<ModifierTargetMap> => {
  try {
    const rows = await fetchModifierRelations(sentenceId);
    const cur = loadModifierTargets();
    const next: ModifierTargetMap = {
      ...cur,
      [sentenceId]: rows.map((r) => ({ source: r.source_owner_id, target: r.target_owner_id })),
    };
    saveModifierTargets(next);
    return next;
  } catch {
    return loadModifierTargets();
  }
};

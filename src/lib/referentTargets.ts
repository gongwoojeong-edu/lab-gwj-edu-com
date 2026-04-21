// ============================================================
// referentTargets — 대명사 지시어 관계(source ownerId → target tokenId)
// localStorage + Supabase referent_relations 동기화
// ============================================================
import {
  fetchReferentRelations,
  upsertReferentRelation,
  deleteReferentRelation,
} from "@/integrations/supabase/storage";

const STORAGE_KEY = "gwj.referentTargets.v1";

export interface ReferentTarget {
  /** 대명사(지시어) owner id */
  source: string;
  /** 가리키는 대상 tokenId (`${tokenId}::${idx}`) */
  target: string;
}

/** sentenceId → ReferentTarget[] */
export type ReferentTargetMap = Record<string, ReferentTarget[]>;

export const loadReferentTargets = (): ReferentTargetMap => {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as ReferentTargetMap) : {};
  } catch {
    return {};
  }
};

export const saveReferentTargets = (map: ReferentTargetMap) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
};

export const upsertReferentTarget = (
  map: ReferentTargetMap,
  sentenceId: string,
  rel: ReferentTarget,
): ReferentTargetMap => {
  const cur = map[sentenceId] ?? [];
  const next = cur.filter((r) => r.source !== rel.source);
  next.push(rel);
  const merged = { ...map, [sentenceId]: next };
  saveReferentTargets(merged);
  void upsertReferentRelation(sentenceId, {
    source_owner_id: rel.source,
    target_owner_id: rel.target,
  }).catch(() => {});
  return merged;
};

export const removeReferentTargetBySource = (
  map: ReferentTargetMap,
  sentenceId: string,
  source: string,
): ReferentTargetMap => {
  const cur = map[sentenceId] ?? [];
  const next = cur.filter((r) => r.source !== source);
  if (next.length === cur.length) return map;
  const merged = { ...map, [sentenceId]: next };
  saveReferentTargets(merged);
  void deleteReferentRelation(sentenceId, source).catch(() => {});
  return merged;
};

export const getReferentsForSentence = (
  map: ReferentTargetMap,
  sentenceId: string,
): ReferentTarget[] => map[sentenceId] ?? [];

/** 클라우드에서 sentence별 referent 관계를 가져와 머지 */
export const hydrateReferentTargetsFromCloud = async (
  sentenceId: string,
  userIdOverride?: string,
): Promise<ReferentTargetMap> => {
  try {
    const rows = await fetchReferentRelations(sentenceId, userIdOverride);
    const cur = userIdOverride ? {} : loadReferentTargets();
    const next: ReferentTargetMap = {
      ...cur,
      [sentenceId]: rows.map((r) => ({ source: r.source_owner_id, target: r.target_owner_id })),
    };
    if (!userIdOverride) saveReferentTargets(next);
    return next;
  } catch {
    return userIdOverride ? {} : loadReferentTargets();
  }
};

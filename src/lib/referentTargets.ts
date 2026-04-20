// ============================================================
// referentTargets — 대명사 지시어 관계(source ownerId → target tokenId)
// modifierTargets.ts 와 동일 패턴, localStorage 분리 키 사용
// ============================================================

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
  return merged;
};

export const getReferentsForSentence = (
  map: ReferentTargetMap,
  sentenceId: string,
): ReferentTarget[] => map[sentenceId] ?? [];

// ============================================================
// idioms — 숙어/구문 마킹 store. SVOC 분석과 완전 독립.
// localStorage + Supabase 양방향 동기화.
// ============================================================
import {
  fetchIdiomsAll,
  upsertIdiomRow,
  deleteIdiomRow,
} from "@/integrations/supabase/storage";

const STORAGE_KEY = "gwj.idioms.v1";

export type IdiomMark = {
  id: string;            // sentenceId + ":" + sortedIndices.join("-")
  sentenceId: string;
  indices: number[];     // wordUnits 인덱스 (정렬됨)
  surface: string;       // 화면에 보이는 phrase
  meaning: string;       // 한국어 뜻
  createdAt: number;
};

export type IdiomMap = Record<string, IdiomMark[]>; // sentenceId -> marks

const makeId = (sentenceId: string, indices: number[]) =>
  `${sentenceId}:${[...indices].sort((a, b) => a - b).join("-")}`;

export const loadIdioms = (): IdiomMap => {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as IdiomMap) : {};
  } catch {
    return {};
  }
};

export const saveIdioms = (map: IdiomMap) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore quota */
  }
};

export const upsertIdiom = (
  sentenceId: string,
  indices: number[],
  surface: string,
  meaning: string,
): IdiomMap => {
  const map = loadIdioms();
  const sorted = [...indices].sort((a, b) => a - b);
  const id = makeId(sentenceId, sorted);
  const existing = map[sentenceId] ?? [];
  const filtered = existing.filter((m) => m.id !== id);
  const next: IdiomMap = {
    ...map,
    [sentenceId]: [
      ...filtered,
      {
        id,
        sentenceId,
        indices: sorted,
        surface,
        meaning,
        createdAt: Date.now(),
      },
    ],
  };
  saveIdioms(next);
  void upsertIdiomRow({
    sentence_id: sentenceId,
    indices: sorted,
    surface,
    meaning,
  }).catch(() => {});
  return next;
};

export const removeIdiom = (sentenceId: string, indices: number[]): IdiomMap => {
  const map = loadIdioms();
  const id = makeId(sentenceId, indices);
  const existing = map[sentenceId] ?? [];
  const next: IdiomMap = {
    ...map,
    [sentenceId]: existing.filter((m) => m.id !== id),
  };
  if (next[sentenceId]?.length === 0) delete next[sentenceId];
  saveIdioms(next);
  void deleteIdiomRow(sentenceId, [...indices].sort((a, b) => a - b)).catch(() => {});
  return next;
};

export const getIdiomsForSentence = (
  map: IdiomMap,
  sentenceId: string,
): IdiomMark[] => map[sentenceId] ?? [];

export const findIdiomCoveringIndex = (
  map: IdiomMap,
  sentenceId: string,
  idx: number,
): IdiomMark | undefined =>
  (map[sentenceId] ?? []).find((m) => m.indices.includes(idx));

export const findIdiomByIndices = (
  map: IdiomMap,
  sentenceId: string,
  indices: number[],
): IdiomMark | undefined => {
  const id = makeId(sentenceId, indices);
  return (map[sentenceId] ?? []).find((m) => m.id === id);
};

/** 모든 문장의 숙어 평탄화 — 추후 어휘 테스트 세션이 사용 */
export const getAllIdiomsFlat = (map?: IdiomMap): IdiomMark[] => {
  const m = map ?? loadIdioms();
  return Object.values(m).flat().sort((a, b) => a.createdAt - b.createdAt);
};

/** 클라우드에서 모든 idiom을 가져와 localStorage와 머지 후 반환 */
export const hydrateIdiomsFromCloud = async (): Promise<IdiomMap> => {
  try {
    const rows = await fetchIdiomsAll();
    const map: IdiomMap = {};
    rows.forEach((r) => {
      const sorted = [...r.indices].sort((a, b) => a - b);
      const id = `${r.sentence_id}:${sorted.join("-")}`;
      const arr = map[r.sentence_id] ?? [];
      arr.push({
        id,
        sentenceId: r.sentence_id,
        indices: sorted,
        surface: r.surface,
        meaning: r.meaning,
        createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
      });
      map[r.sentence_id] = arr;
    });
    saveIdioms(map);
    return map;
  } catch {
    return loadIdioms();
  }
};

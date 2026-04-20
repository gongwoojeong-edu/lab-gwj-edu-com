// ============================================================
// customAnswers — 사용자가 직접 입력한 정답을 localStorage에 저장
// + Supabase owner_progress와 동기화 (오프라인 캐시 + 클라우드 단일 진실).
// 원본 sentences.ts는 건드리지 않고 런타임에 오버레이만 한다.
// ============================================================
import type { WordAnswer } from "@/data/sentences";
import {
  upsertOwnerProgress,
  deleteOwnerProgress,
  fetchOwnerProgressForSentence,
} from "@/integrations/supabase/storage";

const STORAGE_KEY = "gwj.customAnswers.v1";

// tokenId 기준 — 자유 형태로 저장 (POS 변경 시 다른 필드 키들도 들어올 수 있음)
export type CustomAnswerPatch = Record<string, unknown>;
export type CustomAnswerMap = Record<string, CustomAnswerPatch>;

export const loadCustomAnswers = (): CustomAnswerMap => {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as CustomAnswerMap) : {};
  } catch {
    return {};
  }
};

export const saveCustomAnswers = (map: CustomAnswerMap) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore quota errors
  }
};

export const clearCustomAnswers = () => {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
};

// ownerId → sentenceId 추출 (`tokenId::idx` 또는 `__span__::sentenceId::s-e`)
const extractSentenceIdFromOwner = (ownerId: string): string | null => {
  const SPAN_PREFIX = "__span__";
  const SEP = "::";
  if (ownerId.startsWith(`${SPAN_PREFIX}${SEP}`)) {
    return ownerId.split(SEP)[1] ?? null;
  }
  // tokenId 형식은 보통 "{sentenceId}-{n}" 이지만 sentenceId를 ownerId만으로 항상 알 수 없음.
  // 호출 측에서 sentenceId를 명시적으로 넘겨주는 경로(upsertCustomAnswerCloud)를 권장.
  return null;
};

export const upsertCustomAnswer = (
  tokenId: string,
  patch: CustomAnswerPatch,
  sentenceId?: string,
): CustomAnswerMap => {
  const cur = loadCustomAnswers();
  const merged: CustomAnswerMap = {
    ...cur,
    [tokenId]: { ...(cur[tokenId] ?? {}), ...patch },
  };
  saveCustomAnswers(merged);
  // fire-and-forget cloud sync
  const sid = sentenceId ?? extractSentenceIdFromOwner(tokenId);
  if (sid) {
    void upsertOwnerProgress({
      sentence_id: sid,
      owner_id: tokenId,
      progress: merged[tokenId] as unknown,
      custom_answer: merged[tokenId] as unknown,
      completed: true,
    }).catch(() => {});
  }
  return merged;
};

export const removeCustomAnswer = (tokenId: string, sentenceId?: string): CustomAnswerMap => {
  const cur = loadCustomAnswers();
  if (!(tokenId in cur)) return cur;
  const next = { ...cur };
  delete next[tokenId];
  saveCustomAnswers(next);
  const sid = sentenceId ?? extractSentenceIdFromOwner(tokenId);
  if (sid) {
    void deleteOwnerProgress(sid, tokenId).catch(() => {});
  }
  return next;
};

/**
 * Supabase에서 특정 sentence의 owner_progress를 모두 가져와
 * localStorage map에 머지하여 반환. (cloud > local 우선)
 */
export const hydrateCustomAnswersFromCloud = async (
  sentenceId: string,
): Promise<CustomAnswerMap> => {
  try {
    const rows = await fetchOwnerProgressForSentence(sentenceId);
    const cur = loadCustomAnswers();
    const next: CustomAnswerMap = { ...cur };
    rows.forEach((r) => {
      const patch = (r.custom_answer ?? r.progress) as CustomAnswerPatch | null;
      if (patch && typeof patch === "object") {
        next[r.owner_id] = patch;
      }
    });
    saveCustomAnswers(next);
    return next;
  } catch {
    return loadCustomAnswers();
  }
};

// ============================================================
// savedOwners — [정답 저장] 버튼으로 "분석 완료 확정"된 owner 집합
// ============================================================
const SAVED_OWNERS_KEY = "gwj.savedOwners.v1";

export const loadSavedOwners = (): string[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SAVED_OWNERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
};

export const saveSavedOwners = (ids: string[]) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SAVED_OWNERS_KEY, JSON.stringify(Array.from(new Set(ids))));
  } catch {
    // ignore
  }
};

/**
 * 원본 정답에 사용자 입력을 머지.
 * 사용자가 어떤 키를 입력했다면 그 키만 덮어쓴다.
 */
export const mergeAnswer = (
  original: WordAnswer,
  custom: CustomAnswerPatch | undefined,
): WordAnswer => {
  if (!custom) return original;
  return { ...(original as unknown as Record<string, unknown>), ...custom } as unknown as WordAnswer;
};

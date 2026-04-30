// ============================================================
// cacheCleanup — 학원 공용 PC에서 다른 학생/세션의 localStorage 잔재로
// 본인 데이터가 가려지는 사고를 막기 위한 자동 정리 유틸.
//
// 정책:
//   - 모든 `gwj.` 접두 키 중 현재 user_id가 키에 포함되지 않은 것들은
//     "남이 쓰던 잔재"로 간주하고 즉시 삭제.
//   - 단, user_id 스코프가 없는 글로벌 보존 키는 화이트리스트로 보호
//     (예: 미래에 사용할 수 있는 세션/UI 토글 등). 현재는 비어있다.
//   - 학생 로그아웃 시에는 그 학생의 모든 gwj.* 키 일괄 삭제.
// ============================================================

/** 글로벌 보존 키(절대 삭제하지 않음) */
const GLOBAL_KEEP_KEYS: ReadonlySet<string> = new Set<string>([
  // 현재 글로벌 키 없음. 추가 시 정확한 키 이름을 기재.
]);

/** 글로벌 보존 패턴(접두) */
const GLOBAL_KEEP_PREFIXES: readonly string[] = [
  // 예: 'gwj.app.session.' 같은 글로벌 토글이 생기면 추가
];

const isGwjKey = (k: string) => k.startsWith("gwj.");

const isGloballyKept = (k: string): boolean => {
  if (GLOBAL_KEEP_KEYS.has(k)) return true;
  return GLOBAL_KEEP_PREFIXES.some((p) => k.startsWith(p));
};

/** 현재 학생 user_id에 속하지 않는 모든 gwj.* 키 삭제. */
export const purgeForeignGwjKeys = (currentUserId: string): number => {
  if (typeof window === "undefined" || !currentUserId) return 0;
  let removed = 0;
  try {
    const ls = window.localStorage;
    const toRemove: string[] = [];
    for (let i = 0; i < ls.length; i++) {
      const key = ls.key(i);
      if (!key || !isGwjKey(key)) continue;
      if (isGloballyKept(key)) continue;
      // user_id가 키에 포함되어 있으면 본인 데이터 — 보존
      if (key.includes(currentUserId)) continue;
      toRemove.push(key);
    }
    for (const k of toRemove) {
      ls.removeItem(k);
      removed += 1;
    }
    if (removed > 0) {
      // eslint-disable-next-line no-console
      console.info(`[cacheCleanup] purged ${removed} foreign gwj.* keys (user=${currentUserId.slice(0, 8)})`);
    }
  } catch {
    /* ignore */
  }
  return removed;
};

/** 특정 user의 모든 gwj.* 키 삭제 (로그아웃 시). */
export const purgeAllGwjKeysForUser = (userId: string): number => {
  if (typeof window === "undefined" || !userId) return 0;
  let removed = 0;
  try {
    const ls = window.localStorage;
    const toRemove: string[] = [];
    for (let i = 0; i < ls.length; i++) {
      const key = ls.key(i);
      if (!key || !isGwjKey(key)) continue;
      if (isGloballyKept(key)) continue;
      if (!key.includes(userId)) continue;
      toRemove.push(key);
    }
    for (const k of toRemove) {
      ls.removeItem(k);
      removed += 1;
    }
    if (removed > 0) {
      // eslint-disable-next-line no-console
      console.info(`[cacheCleanup] purged ${removed} gwj.* keys for user=${userId.slice(0, 8)} on signout`);
    }
  } catch {
    /* ignore */
  }
  return removed;
};

// ============================================================
// useLevelLabels — DB 오버라이드된 레벨 라벨 + 정적 fallback 합성.
// 책장/사이드바/카드 등 표시용 라벨을 어디서나 동기화한다.
// 매우 자주 호출되므로 모듈 단위 캐시를 둔다.
// ============================================================
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LEVEL_LABEL, type LevelCode } from "@/lib/levels";
import { fetchLevelLabels, type LevelLabelMap } from "@/lib/textbooks";

let cache: LevelLabelMap | null = null;
let inflight: Promise<LevelLabelMap> | null = null;
const listeners = new Set<(m: LevelLabelMap) => void>();

const load = async (force = false): Promise<LevelLabelMap> => {
  if (cache && !force) return cache;
  if (inflight && !force) return inflight;
  inflight = (async () => {
    try {
      const m = await fetchLevelLabels();
      cache = m;
      listeners.forEach((cb) => cb(m));
      return m;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
};

/** 라벨 캐시 무효화 — 편집 후 호출 */
export const invalidateLevelLabels = () => {
  cache = null;
  void load(true);
};

/**
 * 화면에 보여줄 레벨 라벨을 반환.
 * DB 오버라이드 우선, 없으면 levels.ts 의 정적 라벨 사용.
 */
export const useLevelLabels = (): {
  labels: LevelLabelMap;
  /** 코드 → 표시용 라벨 (오버라이드 + 정적 fallback) */
  display: (code: LevelCode) => string;
  loading: boolean;
} => {
  const [labels, setLabels] = useState<LevelLabelMap>(cache ?? {});
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    const cb = (m: LevelLabelMap) => setLabels(m);
    listeners.add(cb);
    if (!cache) {
      load()
        .then((m) => setLabels(m))
        .finally(() => setLoading(false));
    }
    return () => {
      listeners.delete(cb);
    };
  }, []);

  const display = (code: LevelCode) =>
    labels[code] ?? LEVEL_LABEL[code] ?? code;

  return { labels, display, loading };
};

// 인증 변경 시 캐시 초기화 (다른 사용자 로그인 대비)
supabase.auth.onAuthStateChange(() => {
  cache = null;
});

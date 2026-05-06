// ============================================================
// useLevelLabels — DB 오버라이드된 레벨 라벨 + 정적 fallback 합성.
// 책장/사이드바/카드 등 표시용 라벨을 어디서나 동기화한다.
// 매우 자주 호출되므로 모듈 단위 캐시를 둔다.
// ============================================================
import { useEffect, useState } from "react";
import { subscribeAuthState } from "@/lib/authState";
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
 * LevelCode("L04") → Step 번호("Step 4"). 학생 화면 전용.
 * 학년 라벨(중1/고1 등) 노출을 피하고 학습 단계만 보여줄 때 사용.
 */
export const toStudentStepLabel = (code: LevelCode): string => {
  const m = /^L0?(\d+)$/i.exec(code);
  const n = m ? parseInt(m[1], 10) : NaN;
  return Number.isFinite(n) ? `Step ${n}` : code;
};

/**
 * 화면에 보여줄 레벨 라벨을 반환.
 * DB 오버라이드 우선, 없으면 levels.ts 의 정적 라벨 사용.
 *
 * - `display(code)`     : 선생님/관리 화면용 학년 라벨 ("중1", "고1" 등)
 * - `displayStudent(code)`: 학생 화면 전용 ("Step 4") — 학년 표기 숨김
 */
export const useLevelLabels = (): {
  labels: LevelLabelMap;
  display: (code: LevelCode) => string;
  displayStudent: (code: LevelCode) => string;
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
  const displayStudent = (code: LevelCode) => toStudentStepLabel(code);

  return { labels, display, displayStudent, loading };
};

// 인증 변경 시 캐시 초기화 (다른 사용자 로그인 대비)
subscribeAuthState(() => {
  cache = null;
});

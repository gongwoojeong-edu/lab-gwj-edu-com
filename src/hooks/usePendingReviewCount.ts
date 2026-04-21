// ============================================================
// usePendingReviewCount — 첨삭 요청 pending 건수 실시간 구독
// ============================================================
import { useEffect, useState } from "react";
import {
  fetchPendingRequests,
  subscribeToReviewRequests,
} from "@/lib/analysisReview";

export const usePendingReviewCount = (): number => {
  const [count, setCount] = useState<number>(0);

  useEffect(() => {
    let mounted = true;
    const refresh = async () => {
      try {
        const list = await fetchPendingRequests();
        if (mounted) setCount(list.length);
      } catch {
        if (mounted) setCount(0);
      }
    };
    refresh();
    const unsub = subscribeToReviewRequests(() => {
      refresh();
    });
    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  return count;
};

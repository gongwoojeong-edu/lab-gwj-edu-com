// ============================================================
// usePendingPrintCount — 시험지 요청 pending 건수 실시간 구독
// ============================================================
import { useEffect, useState } from "react";
import { fetchPendingPrintRequests, subscribeToPrintRequests } from "@/lib/printRequests";

export const usePendingPrintCount = (): number => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let mounted = true;
    const refresh = async () => {
      try {
        const list = await fetchPendingPrintRequests();
        if (mounted) setCount(list.length);
      } catch {
        if (mounted) setCount(0);
      }
    };
    refresh();
    const unsub = subscribeToPrintRequests(() => refresh());
    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  return count;
};

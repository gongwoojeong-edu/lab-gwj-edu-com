// usePendingApprovalsCount — 한글해석 승인 대기 건수 실시간 구독
import { useEffect, useState } from "react";
import { fetchPendingApprovals, subscribeAllApprovals } from "@/lib/sentenceApprovals";

export const usePendingApprovalsCount = (): number => {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let mounted = true;
    const refresh = async () => {
      try {
        const list = await fetchPendingApprovals();
        if (mounted) setCount(list.length);
      } catch {
        if (mounted) setCount(0);
      }
    };
    refresh();
    const unsub = subscribeAllApprovals(refresh);
    return () => {
      mounted = false;
      unsub();
    };
  }, []);
  return count;
};

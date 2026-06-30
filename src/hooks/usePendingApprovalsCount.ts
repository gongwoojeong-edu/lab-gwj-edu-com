// usePendingApprovalsCount — 한글해석 승인 대기 건수 실시간 구독 + 음성 알림
import { useEffect, useRef, useState } from "react";
import { fetchPendingApprovals, subscribeAllApprovals } from "@/lib/sentenceApprovals";
import { playApprovalChime, primeApprovalChime } from "@/lib/approvalChime";

export const usePendingApprovalsCount = (): number => {
  const [count, setCount] = useState(0);
  const prevRef = useRef<number | null>(null);

  useEffect(() => {
    primeApprovalChime();
    let mounted = true;
    const refresh = async () => {
      try {
        const list = await fetchPendingApprovals();
        if (!mounted) return;
        const next = list.length;
        const prev = prevRef.current;
        // 최초 로드 이후, 대기 건수가 증가한 경우에만 차임 재생
        if (prev !== null && next > prev) {
          playApprovalChime();
        }
        prevRef.current = next;
        setCount(next);
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

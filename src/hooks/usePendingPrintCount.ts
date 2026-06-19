// ============================================================
// usePendingPrintCount — 요청확인 pending 건수 (유닛 인쇄 + 자료열람 + 레거시 지문 인쇄)
// ============================================================
import { useEffect, useState } from "react";
import { fetchPendingPrintRequests, subscribeToPrintRequests } from "@/lib/printRequests";
import { fetchPendingUnitPrintWorkflows, subscribeToUnitWorkflows } from "@/lib/unitWorkflow";
import {
  fetchPendingMaterialViewRequests,
  subscribeToMaterialViewRequests,
} from "@/lib/materialViewRequests";

export const usePendingPrintCount = (): number => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const refresh = async () => {
      try {
        const [prints, units, materials] = await Promise.all([
          fetchPendingPrintRequests(),
          fetchPendingUnitPrintWorkflows(),
          fetchPendingMaterialViewRequests(),
        ]);
        setCount(prints.length + units.length + materials.length);
      } catch {
        setCount(0);
      }
    };
    refresh();
    const u1 = subscribeToPrintRequests(() => refresh());
    const u2 = subscribeToUnitWorkflows(() => refresh());
    const u3 = subscribeToMaterialViewRequests(() => refresh());
    return () => {
      u1?.();
      u2?.();
      u3?.();
    };
  }, []);

  return count;
};

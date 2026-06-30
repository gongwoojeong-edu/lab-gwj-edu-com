// usePendingApprovalsCount — 한글해석 승인 대기 건수 실시간 구독 + 음성 알림
import { useEffect, useRef, useState } from "react";
import {
  fetchPendingApprovals,
  subscribeAllApprovals,
} from "@/lib/sentenceApprovals";
import {
  primeApprovalChime,
  speakApproval,
  unitLabelFromSentenceId,
} from "@/lib/approvalChime";
import { supabase } from "@/integrations/supabase/client";

export const usePendingApprovalsCount = (): number => {
  const [count, setCount] = useState(0);
  const prevIdsRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    primeApprovalChime();
    let mounted = true;

    const announce = async (newRows: { user_id: string; sentence_id: string }[]) => {
      if (newRows.length === 0) return;
      const userIds = Array.from(new Set(newRows.map((r) => r.user_id)));
      const { data: profiles } = await supabase
        .from("student_profiles")
        .select("user_id, display_name, student_no")
        .in("user_id", userIds);
      const nameMap = new Map<string, string>();
      (profiles ?? []).forEach((p: any) => {
        nameMap.set(p.user_id, p.display_name || p.student_no || "학생");
      });
      newRows.forEach((r) => {
        const name = nameMap.get(r.user_id) ?? "학생";
        speakApproval(name, unitLabelFromSentenceId(r.sentence_id));
      });
    };

    const refresh = async () => {
      try {
        const list = await fetchPendingApprovals();
        if (!mounted) return;
        const nextIds = new Set(list.map((r) => r.id));
        const prev = prevIdsRef.current;
        if (prev !== null) {
          const added = list.filter((r) => !prev.has(r.id));
          if (added.length > 0) {
            void announce(added.map((r) => ({ user_id: r.user_id, sentence_id: r.sentence_id })));
          }
        }
        prevIdsRef.current = nextIds;
        setCount(list.length);
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

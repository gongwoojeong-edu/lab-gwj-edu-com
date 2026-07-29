// usePendingApprovalsCount — 한글해석 승인 대기 건수 실시간 구독 + 음성 알림
// 단일 모듈 스토어로 레이아웃/사이드바 중복 구독·응답 레이스(배지 3 vs 목록 0)를 방지한다.
import { useSyncExternalStore } from "react";
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

type Listener = () => void;

let count = 0;
let prevIds: Set<string> | null = null;
let fetchGen = 0;
let started = false;
let unsubRealtime: (() => void) | null = null;
const listeners = new Set<Listener>();

const emit = () => {
  listeners.forEach((l) => l());
};

const announce = async (newRows: { user_id: string; sentence_id: string }[]) => {
  if (newRows.length === 0) return;
  const userIds = Array.from(new Set(newRows.map((r) => r.user_id)));
  const { data: profiles } = await supabase
    .from("student_profiles")
    .select("user_id, display_name, student_no")
    .in("user_id", userIds);
  const nameMap = new Map<string, string>();
  (profiles ?? []).forEach((p: { user_id: string; display_name: string | null; student_no: string | null }) => {
    nameMap.set(p.user_id, p.display_name || p.student_no || "학생");
  });
  newRows.forEach((r) => {
    const name = nameMap.get(r.user_id) ?? "학생";
    speakApproval(name, unitLabelFromSentenceId(r.sentence_id));
  });
};

const refresh = async () => {
  const gen = ++fetchGen;
  try {
    const list = await fetchPendingApprovals();
    if (gen !== fetchGen) return; // 더 최신 요청이 있으면 폐기
    const nextIds = new Set(list.map((r) => r.id));
    if (prevIds !== null) {
      const added = list.filter((r) => !prevIds!.has(r.id));
      if (added.length > 0) {
        void announce(added.map((r) => ({ user_id: r.user_id, sentence_id: r.sentence_id })));
      }
    }
    prevIds = nextIds;
    count = list.length;
    emit();
  } catch {
    if (gen !== fetchGen) return;
    count = 0;
    emit();
  }
};

/** 승인 목록 페이지 등에서 방금 조회한 pending 건수로 배지를 즉시 동기화 */
export const syncPendingApprovalsCount = (next: number) => {
  fetchGen += 1; // 진행 중 refresh 결과 무시
  count = Math.max(0, next);
  emit();
};

const ensureStarted = () => {
  if (started) return;
  started = true;
  primeApprovalChime();
  void refresh();
  unsubRealtime = subscribeAllApprovals(() => {
    void refresh();
  });
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") void refresh();
    });
  }
};

const subscribe = (listener: Listener) => {
  ensureStarted();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getSnapshot = () => count;

export const usePendingApprovalsCount = (): number => {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};

/** 테스트/수동 새로고침용 */
export const refreshPendingApprovalsCount = () => {
  ensureStarted();
  return refresh();
};

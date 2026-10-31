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
import { fetchAllPages, fetchInChunks } from "@/lib/paginatedQuery";
import { toast } from "@/hooks/use-toast";

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
    // 담당 학생 스코핑 — 관리자는 전체, 선생님은 자기 담당 학생만 (승인 대기 화면과 동일 기준)
    let scoped = list;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user && list.length > 0) {
      const { data: roleRows } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      const isAdmin = (roleRows ?? []).some((r: { role: string }) => r.role === "admin");
      if (!isAdmin) {
        const ids = Array.from(new Set(list.map((r) => r.user_id)));
        const profs = await fetchInChunks(ids, users => fetchAllPages((from, to) => supabase
          .from("student_profiles").select("user_id, teacher_id")
          .in("user_id", users).order("user_id").range(from, to)));
        const teacherOf = new Map(
          ((profs ?? []) as { user_id: string; teacher_id: string | null }[]).map((p) => [
            p.user_id,
            p.teacher_id,
          ]),
        );
        scoped = list.filter((r) => {
          const t = teacherOf.get(r.user_id);
          return t == null || t === user.id;
        });
      }
    }
    if (gen !== fetchGen) return;
    const nextIds = new Set(scoped.map((r) => r.id));
    if (prevIds !== null) {
      const previous = prevIds;
      const added = scoped.filter((r) => !previous.has(r.id));
      if (added.length > 0) {
        void announce(added.map((r) => ({ user_id: r.user_id, sentence_id: r.sentence_id })));
      }
    }
    prevIds = nextIds;
    count = scoped.length;
    emit();
  } catch {
    if (gen !== fetchGen) return;
    toast({ title: "승인 대기 숫자를 새로 불러오지 못했습니다",
      description: "기존 숫자를 유지합니다. 승인 대기 화면에서 새로고침해 주세요.", variant: "destructive" });
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

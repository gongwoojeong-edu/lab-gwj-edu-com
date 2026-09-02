// ============================================================
// TeachingOverlay — 선생님이 [티칭 시작] 을 누르면 학생 화면 전체에 뜨는 오버레이
//   · 영어 원문 + 내가 제출한 해석(처음/최종)
//   · 선생님이 승인창에 타이핑하는 메모를 실시간 중계(broadcast, DB 저장 없음)
//   · 한글 정답(마스터 해석)은 표시하지 않는다
//   · 학생은 닫을 수 없고, 선생님이 승인/처리하면 자동으로 닫힌다
// ============================================================
import { useEffect, useState } from "react";
import { GraduationCap } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchActiveTeaching,
  teachingChannelName,
  type TeachingSignal,
} from "@/lib/teachingSession";
import { SentenceReviewDetail } from "@/components/student/SentenceReviewDetail";
import { TeachingQnaPanel } from "@/components/learning/TeachingQnaPanel";
import { isMemoEmpty, parseMemo, type StructuredMemo } from "@/lib/approvalMemo";

export const TeachingOverlay = () => {
  const { user } = useAuth();
  const [signal, setSignal] = useState<TeachingSignal | null>(null);
  const [liveMemo, setLiveMemo] = useState<StructuredMemo | null>(null);

  const uid = user?.id ?? null;

  // teaching 신호 감지 (알림 테이블 실시간 구독)
  useEffect(() => {
    if (!uid) {
      setSignal(null);
      return;
    }
    let alive = true;
    const reload = () => {
      fetchActiveTeaching(uid)
        .then((s) => {
          if (!alive) return;
          setSignal((prev) => {
            if (prev?.id !== s?.id) setLiveMemo(null);
            return s;
          });
        })
        .catch(() => {});
    };
    reload();
    const channel = supabase
      .channel(`teach_sig_${uid}_${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "student_notifications",
          filter: `user_id=eq.${uid}`,
        },
        () => reload(),
      )
      .subscribe();
    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [uid]);

  // 선생님 메모 실시간 중계 수신
  useEffect(() => {
    if (!uid || !signal) return;
    const channel = supabase
      .channel(teachingChannelName(uid), { config: { broadcast: { self: false } } })
      .on("broadcast", { event: "memo" }, (payload) => {
        const memo = parseMemo((payload as { payload?: unknown }).payload as unknown);
        setLiveMemo(isMemoEmpty(memo) ? null : memo);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          // 접속 알림 — 선생님 쪽이 현재 메모를 즉시 다시 보내준다
          channel.send({ type: "broadcast", event: "hello", payload: {} });
        }
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [uid, signal?.id]);

  if (!uid || !signal?.sentence_id) return null;

  return (
    <div className="fixed inset-0 z-[120] bg-background/97 backdrop-blur-sm overflow-y-auto">
      <div className="max-w-3xl mx-auto p-6 space-y-4">
        <div className="flex items-center gap-2 text-primary">
          <GraduationCap className="w-6 h-6" />
          <div>
            <div className="text-lg font-bold text-foreground">선생님과 함께 보는 중이에요</div>
            <p className="text-xs text-muted-foreground">
              선생님 설명이 끝나고 승인하면 자동으로 학습 화면으로 돌아갑니다.
            </p>
          </div>
        </div>

        <SentenceReviewDetail
          sentenceId={signal.sentence_id}
          userId={uid}
          memo={liveMemo ?? undefined}
          showEmptyMemo
        />

        <TeachingQnaPanel
          studentUserId={uid}
          sentenceId={signal.sentence_id}
          role="student"
        />

        {!liveMemo && (
          <div className="text-xs text-muted-foreground text-center py-2">
            선생님이 첨삭을 입력하면 이곳에 실시간으로 표시됩니다.
          </div>
        )}
      </div>
    </div>
  );
};

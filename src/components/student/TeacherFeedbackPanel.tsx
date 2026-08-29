// ============================================================
// TeacherFeedbackPanel — 학생 학습화면에서 선생님 첨삭 내용을 바로 확인
//   (알림함까지 들어가지 않아도 되도록 문장 학습 화면 상단에 상시 노출)
//   · 같은 문장에 대한 모든 첨삭 회차를 최신순으로 표시
//   · 선생님이 "해결됨" 체크한 항목은 ✅ 해결, 아니면 ⚠️ 미해결 로 구분
// ============================================================
import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, CheckCircle2, AlertTriangle, MessageSquareText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { StructuredMemoView } from "@/components/learning/StructuredMemoView";
import { isMemoEmpty, parseMemo } from "@/lib/approvalMemo";
import { GRADE_LABEL, GRADE_BADGE_CLASS, type ApprovalGrade } from "@/lib/sentenceApprovals";
import { cn } from "@/lib/utils";

interface FeedbackRow {
  id: string;
  attempt_no: number;
  grade: string | null;
  memo: string | null;
  at: string | null;
  resolved: boolean;
}

interface Props {
  sentenceId: string | null | undefined;
  /** 값이 바뀌면 다시 조회 (승인/보류 직후 갱신용) */
  refreshKey?: unknown;
}

export const TeacherFeedbackPanel = ({ sentenceId, refreshKey }: Props) => {
  const [rows, setRows] = useState<FeedbackRow[]>([]);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (!sentenceId) {
      setRows([]);
      return;
    }
    let mounted = true;
    (async () => {
      const uid = (await supabase.auth.getUser()).data.user?.id;
      if (!uid) return;
      const { data } = await supabase
        .from("sentence_approvals")
        .select("id, attempt_no, grade, memo, held_memo, approved_at, held_at, requested_at, feedback_resolved")
        .eq("user_id", uid)
        .eq("sentence_id", sentenceId)
        .order("attempt_no", { ascending: false });
      if (!mounted) return;
      const list: FeedbackRow[] = (data ?? [])
        .map((r: any) => ({
          id: r.id,
          attempt_no: Number(r.attempt_no) || 1,
          grade: r.grade ?? null,
          memo: (r.memo ?? "").trim() ? r.memo : r.held_memo,
          at: r.approved_at ?? r.held_at ?? r.requested_at ?? null,
          resolved: !!r.feedback_resolved,
        }))
        .filter((r) => !isMemoEmpty(parseMemo(r.memo)));
      setRows(list);
    })();
    return () => {
      mounted = false;
    };
  }, [sentenceId, refreshKey]);

  if (!rows.length) return null;

  const unresolved = rows.filter((r) => !r.resolved).length;

  return (
    <Card className="border-2 border-sky-500/40 bg-sky-50/50 dark:bg-sky-500/5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        <MessageSquareText className="h-5 w-5 shrink-0 text-sky-600 dark:text-sky-400" />
        <span className="text-sm font-extrabold text-foreground">선생님 첨삭 피드백</span>
        <span className="rounded-md border border-sky-500/30 px-1.5 py-0.5 text-[11px] font-bold text-sky-700 dark:text-sky-300">
          {rows.length}회
        </span>
        {unresolved > 0 ? (
          <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[11px] font-bold text-amber-800 dark:bg-amber-500/20 dark:text-amber-200">
            미해결 {unresolved}
          </span>
        ) : (
          <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[11px] font-bold text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200">
            모두 해결됨
          </span>
        )}
        <span className="ml-auto text-muted-foreground">
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>

      {open && (
        <div className="space-y-2 px-4 pb-4">
          {rows.map((r) => (
            <div
              key={r.id}
              className={cn(
                "rounded-md border bg-background/70 px-3 py-2",
                r.resolved ? "border-emerald-500/30" : "border-amber-500/40",
              )}
            >
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-bold text-muted-foreground">
                  {r.attempt_no}회차
                </span>
                {r.grade && GRADE_LABEL[r.grade as ApprovalGrade] && (
                  <span
                    className={cn(
                      "rounded-md border px-1.5 py-0.5 text-[11px] font-bold",
                      GRADE_BADGE_CLASS[r.grade as ApprovalGrade],
                    )}
                  >
                    {GRADE_LABEL[r.grade as ApprovalGrade]}
                  </span>
                )}
                {r.resolved ? (
                  <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 className="h-3.5 w-3.5" /> 해결됨
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[11px] font-bold text-amber-700 dark:text-amber-300">
                    <AlertTriangle className="h-3.5 w-3.5" /> 미해결 — 이번에 꼭 반영하기
                  </span>
                )}
                {r.at && (
                  <span className="ml-auto text-[11px] text-muted-foreground">
                    {new Date(r.at).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" })}
                  </span>
                )}
              </div>
              <StructuredMemoView memo={r.memo} />
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};

export default TeacherFeedbackPanel;

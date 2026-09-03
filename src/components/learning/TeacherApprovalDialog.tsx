import { useEffect, useMemo, useRef, useState } from "react";
import { Lock, ShieldCheck, PauseCircle, Trash2, Eye, EyeOff, GraduationCap, BookOpen, History, RefreshCw, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { StructuredMemoInput } from "@/components/learning/StructuredMemoInput";
import { StructuredMemoView } from "@/components/learning/StructuredMemoView";
import { TeachingQnaPanel } from "@/components/learning/TeachingQnaPanel";
import { emptyMemo, isMemoEmpty, parseMemo, serializeMemo, MEMO_FIELD_KEYS, type StructuredMemo } from "@/lib/approvalMemo";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { fetchTeacherPin } from "@/lib/teacherPin";
import { startTeaching, stopTeaching, teachingChannelName } from "@/lib/teachingSession";
import { supabase } from "@/integrations/supabase/client";
import {
  approveSentenceRequest,
  deleteApprovalRequest,
  holdApprovalRequest,
  GRADE_LABEL,
  GRADE_BADGE_CLASS,
  GRADE_ORDER,
  type ApprovalGrade,
} from "@/lib/sentenceApprovals";
import { fetchPassageSource, type PassageSource } from "@/lib/textbooks";


interface Props {
  approvalId: string;
  sentenceId: string;
  /** 학생 한글해석 (참고용 표시) */
  studentTranslation?: string | null;
  englishSentence?: string;
  /** 교재에 등록된 한글해석 정답 (참고용) */
  koreanAnswer?: string | null;
  /** 대상 학생 user_id (선생님 화면에서 승인할 때 필수) */
  studentUserId?: string;
  /** 학생 이름 (헤더 표시용) */
  studentName?: string | null;
  /** 학생 번호 (헤더 표시용) */
  studentNo?: string | null;
  /** true 면 PIN 입력을 생략 (선생님 로그인 상태에서 사용) */
  skipPin?: boolean;
  /** 재오픈 시 초기 메모값 (예: 이전 보류 메모) */
  initialMemo?: string;
  /** 다이얼로그 모드 — pending: 대기중 승인 / held: 보류함 최종 처리 */
  mode?: "pending" | "held";
  /** 문장 출처(시리즈·권·유닛) — 미전달 시 내부에서 조회 */
  sourceInfo?: PassageSource | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApproved: (grade: ApprovalGrade) => void;
}


/**
 * 한글해석 제출 후 선생님이 승인하는 다이얼로그.
 * 5단계 등급(매우잘함/잘함/보통/미흡/재학습) + 메모.
 * - 학생 PIN 흐름: skipPin=false, studentUserId 미전달 (현재 세션 = 학생 본인)
 * - 선생님 승인 페이지: skipPin=true, studentUserId 전달
 */
interface PastFeedback {
  id: string;
  attempt_no: number;
  grade: string | null;
  status: string;
  memo: string | null;
  at: string;
  resolved?: boolean;
}



export const TeacherApprovalDialog = ({
  approvalId,
  sentenceId,
  studentTranslation,
  englishSentence,
  koreanAnswer,
  studentUserId,
  studentName,
  studentNo,
  skipPin = false,
  initialMemo,
  mode = "pending",
  sourceInfo: initialSource,
  open,
  onOpenChange,
  onApproved,
}: Props) => {


  const [pin, setPin] = useState("");
  const [storedPin, setStoredPin] = useState<string | null | undefined>(undefined);
  const [grade, setGrade] = useState<ApprovalGrade | null>(null);
  const [memo, setMemo] = useState<StructuredMemo>(emptyMemo());
  const [saving, setSaving] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const [teaching, setTeaching] = useState(false);
  const [source, setSource] = useState<PassageSource | null | undefined>(initialSource);
  const [history, setHistory] = useState<PastFeedback[]>([]);
  const [resolved, setResolved] = useState<Record<string, boolean>>({});

  const redoCount = useMemo(() => history.filter((h) => h.grade === "redo").length, [history]);
  const roundNo = history.length + 1;
  const unresolved = useMemo(
    () => history.filter((h) => !resolved[h.id]),
    [history, resolved],
  );

  const pullUnresolved = () => {
    const next = { ...memo };
    unresolved.forEach((h) => {
      const parsed = parseMemo(h.memo);
      MEMO_FIELD_KEYS.forEach((k) => {
        const v = parsed[k].trim();
        if (!v) return;
        if (next[k].includes(v)) return;
        next[k] = next[k].trim() ? `${next[k].trim()}\n${v}` : v;
      });
    });
    setMemo(next);
    toast({ title: "미해결 첨삭을 메모로 가져왔어요" });
  };




  const beginTeaching = async () => {
    if (!studentUserId) return;
    try {
      await startTeaching(studentUserId, sentenceId);
      setTeaching(true);
      toast({
        title: "학생 화면에 문장을 띄웠어요",
        description: "메모 타이핑이 실시간으로 중계되고, 완료 시 자동으로 닫힙니다.",
      });
    } catch (e: any) {
      toast({ title: "티칭 시작 실패", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  const isHeldMode = mode === "held";

  useEffect(() => {
    if (!open) return;
    setPin("");
    setGrade(null);
    setMemo(parseMemo(initialMemo));
    setShowAnswer(false);
    setTeaching(false);
    if (skipPin) {
      setStoredPin("__skip__");
      return;
    }
    let mounted = true;
    fetchTeacherPin()
      .then((p) => mounted && setStoredPin(p))
      .catch(() => mounted && setStoredPin(null));
    return () => {
      mounted = false;
    };
  }, [open, skipPin, initialMemo]);

  useEffect(() => {
    if (!open || initialSource !== undefined) return;
    let mounted = true;
    fetchPassageSource(sentenceId)
      .then((s) => mounted && setSource(s))
      .catch(() => mounted && setSource(null));
    return () => {
      mounted = false;
    };
  }, [open, sentenceId, initialSource]);

  // ── 이전 선생님 첨삭 이력 (같은 문장 · 같은 학생) ──
  useEffect(() => {
    if (!open) return;
    let mounted = true;
    (async () => {
      const uid =
        studentUserId ?? (await supabase.auth.getUser()).data.user?.id ?? null;
      if (!uid) return;
      const { data } = await supabase
        .from("sentence_approvals")
        .select("id, attempt_no, grade, status, memo, held_memo, approved_at, held_at, requested_at, feedback_resolved")
        .eq("user_id", uid)
        .eq("sentence_id", sentenceId)
        .order("attempt_no", { ascending: true });
      if (!mounted) return;
      const rows: PastFeedback[] = (data ?? [])
        .filter((r: any) => r.id !== approvalId)
        .map((r: any) => ({
          id: r.id,
          attempt_no: Number(r.attempt_no) || 1,
          grade: r.grade ?? null,
          status: r.status,
          memo: (r.memo ?? "").trim() ? r.memo : r.held_memo,
          at: r.approved_at ?? r.held_at ?? r.requested_at,
          resolved: !!r.feedback_resolved,
        }))
        .filter((r) => !isMemoEmpty(parseMemo(r.memo)) || r.grade === "redo");
      setHistory(rows);
      // DB에 저장된 해결 여부를 초기값으로 — 재학습 때 체크가 풀리지 않는다.
      const init: Record<string, boolean> = {};
      rows.forEach((r) => { if (r.resolved) init[r.id] = true; });
      setResolved(init);
    })();
    return () => {
      mounted = false;
    };
  }, [open, sentenceId, studentUserId, approvalId]);




  // ── 티칭 모드: 메모 타이핑을 학생 화면으로 실시간 중계 (DB 저장 없음) ──
  const memoChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const readyRef = useRef(false);
  const memoRef = useRef(memo);
  memoRef.current = memo;

  useEffect(() => {
    if (!open || !studentUserId) return;
    readyRef.current = false;
    const ch = supabase.channel(teachingChannelName(studentUserId), {
      config: { broadcast: { self: false } },
    });
    // 학생 오버레이가 접속하면 현재 메모를 즉시 다시 보낸다
    ch.on("broadcast", { event: "hello" }, () => {
      ch.send({ type: "broadcast", event: "memo", payload: memoRef.current });
    });
    ch.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        readyRef.current = true;
        ch.send({ type: "broadcast", event: "memo", payload: memoRef.current });
      }
    });
    memoChannelRef.current = ch;
    // 재전송 하트비트 — 구독 타이밍 어긋남으로 인한 유실 방지
    const hb = setInterval(() => {
      if (readyRef.current) {
        ch.send({ type: "broadcast", event: "memo", payload: memoRef.current });
      }
    }, 1500);
    return () => {
      clearInterval(hb);
      readyRef.current = false;
      memoChannelRef.current = null;
      supabase.removeChannel(ch);
    };
  }, [open, studentUserId]);

  useEffect(() => {
    if (!open || !studentUserId) return;
    const t = setTimeout(() => {
      if (readyRef.current) {
        memoChannelRef.current?.send({ type: "broadcast", event: "memo", payload: memo });
      }
    }, 250);
    return () => clearTimeout(t);
  }, [memo, open, studentUserId]);

  const endTeaching = async () => {
    if (!studentUserId) return;
    try {
      await stopTeaching(studentUserId);
    } catch {
      /* 무시 */
    }
  };

  const submit = async () => {
    if (saving) return;
    if (!grade) {
      toast({ title: "평가 등급을 선택하세요", variant: "destructive" });
      return;
    }
    if (!skipPin) {
      let pinToCheck = storedPin;
      if (!pinToCheck) {
        pinToCheck = await fetchTeacherPin().catch(() => null);
        setStoredPin(pinToCheck);
      }
      if (!pinToCheck) {
        toast({
          title: "PIN이 설정되지 않았어요",
          description: "선생님께 패스키 설정을 요청하세요.",
          variant: "destructive",
        });
        return;
      }
      if (pin.trim() !== pinToCheck.trim()) {
        toast({ title: "PIN이 일치하지 않습니다", variant: "destructive" });
        setPin("");
        return;
      }
    }

    setSaving(true);
    try {
      await approveSentenceRequest({
        approvalId,
        sentenceId,
        grade,
        memo: serializeMemo(memo) ?? "",
        studentUserId,
      });
      await endTeaching();
      toast({
        title: grade === "redo" ? "추가학습 요청을 보냈어요" : `승인 완료 — ${GRADE_LABEL[grade]}`,
        description:
          grade === "redo"
            ? "기존 통과 기록은 유지되며, 학생이 한 번 더 제출하게 됩니다."
            : "다음 문장으로 진행합니다",
      });

      onOpenChange(false);
      onApproved(grade);
    } catch (e: any) {
      toast({
        title: "승인 저장 실패",
        description: e?.message ?? String(e),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const hold = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await holdApprovalRequest({
        approvalId,
        studentUserId,
        sentenceId,
        memo: serializeMemo(memo) ?? "",
      });
      await endTeaching();
      toast({
        title: "보류 처리했어요",
        description: "이 문장은 '보류' 탭에 남습니다. 나중에 자세히 첨삭 후 최종 승인하세요.",
      });
      onOpenChange(false);
      onApproved("fair"); // trigger list refresh in parent; grade unused since target closes
    } catch (e: any) {
      toast({ title: "보류 저장 실패", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await deleteApprovalRequest(approvalId);
      await endTeaching();
      toast({
        title: "보류 항목을 삭제했어요",
        description: "학생의 진도 기록은 유지됩니다.",
      });
      onOpenChange(false);
      onApproved("fair"); // trigger list refresh in parent
    } catch (e: any) {
      toast({
        title: "삭제 실패",
        description: e?.message ?? String(e),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[95vw] h-[92vh] max-h-[92vh] top-[4vh] translate-y-0 sm:top-[4vh] sm:translate-y-0 flex flex-col gap-0 overflow-hidden">
        <DialogHeader className="shrink-0 bg-background border-b border-border pb-3 pt-1">
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <ShieldCheck className="w-5 h-5 text-primary" />
            {isHeldMode ? "보류함 — 최종 처리" : "선생님 승인 — 평가"}
            {(studentName || studentNo) && (
              <span className="inline-flex items-center gap-1 text-sm font-semibold px-2 py-0.5 rounded-md bg-primary/10 text-primary">
                {studentNo && <span className="font-mono text-xs">{studentNo}</span>}
                {studentName}
              </span>
            )}
            {redoCount > 0 && (
              <span
                className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/40"
                title="이 문장의 재학습 지정 횟수"
              >
                <RefreshCw className="w-3 h-3" /> 재학습 {redoCount}회 · {roundNo}회차
              </span>
            )}
            {redoCount === 0 && roundNo > 1 && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-md bg-muted text-muted-foreground">
                {roundNo}회차
              </span>
            )}
          </DialogTitle>

          <DialogDescription>
            한글해석을 확인하고 평가 등급과 메모를 입력해 주세요.
          </DialogDescription>
          {source !== undefined && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
              <BookOpen className="w-3.5 h-3.5" />
              {source ? (
                <span className="truncate">
                  {[
                    source.level,
                    source.seriesTitle,
                    source.textbookTitle,
                    source.volumeNo ? `${source.volumeNo}권` : null,
                    source.unitTitle,
                    source.unitNo ? `유닛 ${source.unitNo}` : null,
                    source.passageNo ? `${source.passageNo}번 문장` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              ) : (
                <span>{sentenceId}</span>
              )}
            </div>
          )}
        </DialogHeader>


        {(koreanAnswer || englishSentence || studentTranslation !== undefined) && (
          <div className="relative shrink-0 bg-background border-b border-border p-3 space-y-2 text-sm">
            {koreanAnswer && (
              <div className="flex items-start justify-between gap-2">
                {showAnswer ? (
                  <>
                    <div className="whitespace-pre-wrap leading-snug">{koreanAnswer}</div>
                    <button
                      type="button"
                      onClick={() => setShowAnswer(false)}
                      className="shrink-0 inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:bg-muted"
                      title="가리기"
                      aria-label="가리기"
                    >
                      <EyeOff className="w-3 h-3" />
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowAnswer(true)}
                    className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:bg-muted"
                    title="정답 보기"
                    aria-label="정답 보기"
                  >
                    <Eye className="w-3 h-3" />
                  </button>
                )}
              </div>
            )}
            {englishSentence && (
              <div>
                <div className="text-[11px] text-muted-foreground">원문</div>
                <div className="font-medium leading-snug">{englishSentence}</div>
              </div>
            )}
            {studentTranslation && (
              <div>
                <div className="text-[11px] text-muted-foreground">학생 한글해석</div>
                <div className="whitespace-pre-wrap">{studentTranslation}</div>
              </div>
            )}
          </div>
        )}

        <div className="overflow-y-auto flex-1 min-h-0 space-y-4 pr-1 p-3">
          {!skipPin && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                <Lock className="w-3 h-3" /> 선생님 PIN
              </div>
              <Input
                inputMode="numeric"
                maxLength={6}
                placeholder="••••"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="text-center text-xl tracking-[0.5em] font-mono"
                autoFocus
              />
            </div>
          )}

          <div className="space-y-2">
            <div className="text-xs font-semibold text-muted-foreground">평가 등급</div>
            <div className="grid grid-cols-5 gap-1.5">
              {GRADE_ORDER.map((g) => {
                const selected = grade === g;
                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGrade(g)}
                    className={cn(
                      "px-2 py-2 rounded-md border text-xs font-bold transition-all",
                      selected
                        ? GRADE_BADGE_CLASS[g] + " scale-105 shadow-md"
                        : "bg-card hover:bg-muted border-border text-foreground",
                    )}
                  >
                    {GRADE_LABEL[g]}
                  </button>
                );
              })}
            </div>
          </div>

          {history.length > 0 && (
            <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="text-xs font-bold text-amber-700 dark:text-amber-300 flex items-center gap-1">
                  <History className="w-3.5 h-3.5" /> 이전 선생님 첨삭 {history.length}건
                  {unresolved.length > 0 && (
                    <span className="ml-1 text-[11px] font-semibold text-rose-600 dark:text-rose-300">
                      · 미해결 {unresolved.length}건
                    </span>
                  )}
                </div>
                {unresolved.length > 0 && (
                  <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={pullUnresolved}>
                    미해결 항목 메모로 가져오기
                  </Button>
                )}
              </div>
              <div className="space-y-2">
                {history.map((h) => {
                  const done = !!resolved[h.id];
                  return (
                    <div
                      key={h.id}
                      className={cn(
                        "rounded-md border bg-card p-2 space-y-1",
                        done ? "border-emerald-500/50 opacity-70" : "border-border",
                      )}
                    >
                      <div className="flex items-center gap-2 flex-wrap text-[11px]">
                        <span className="px-1.5 py-0.5 rounded bg-muted font-bold">{h.attempt_no}회차</span>
                        {h.grade && (
                          <span
                            className={cn(
                              "px-1.5 py-0.5 rounded font-bold",
                              GRADE_BADGE_CLASS[h.grade as ApprovalGrade] ?? "bg-muted",
                            )}
                          >
                            {GRADE_LABEL[h.grade as ApprovalGrade] ?? h.grade}
                          </span>
                        )}
                        {h.status === "held" && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300 font-semibold">
                            보류
                          </span>
                        )}
                        <span className="text-muted-foreground">
                          {h.at ? new Date(h.at).toLocaleString("ko-KR") : ""}
                        </span>
                        <label className="ml-auto inline-flex items-center gap-1 cursor-pointer select-none font-semibold">
                          <input
                            type="checkbox"
                            checked={done}
                            onChange={(e) => {
                              const v = e.target.checked;
                              setResolved((prev) => ({ ...prev, [h.id]: v }));
                              // 해결 여부를 DB에 저장 — 다음 회차 재학습 때도 유지된다.
                              supabase
                                .from("sentence_approvals")
                                .update({ feedback_resolved: v } as never)
                                .eq("id", h.id)
                                .then(({ error }) => {
                                  if (error) {
                                    console.warn("[TeacherApprovalDialog] feedback_resolved save failed", error);
                                    toast({ title: "해결 체크 저장에 실패했어요", variant: "destructive" });
                                  }
                                });
                            }}
                            className="accent-emerald-600"
                          />
                          <CheckCircle2
                            className={cn("w-3.5 h-3.5", done ? "text-emerald-600" : "text-muted-foreground")}
                          />
                          해결됨
                        </label>
                      </div>
                      <StructuredMemoView memo={h.memo} emptyText="메모 없이 재학습 지정" />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <StructuredMemoInput value={memo} onChange={setMemo} disabled={saving} />

          {studentUserId && (
            <TeachingQnaPanel
              studentUserId={studentUserId}
              sentenceId={sentenceId}
              role="teacher"
            />
          )}
        </div>

        <DialogFooter className="shrink-0 bg-background border-t border-border flex-wrap gap-2 sm:justify-between pt-3 pb-1">
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              취소
            </Button>
            {studentUserId && (
              <Button
                variant={teaching ? "secondary" : "outline"}
                className={teaching ? "" : "border-sky-500/60 text-sky-700 hover:bg-sky-500/10 dark:text-sky-300"}
                onClick={beginTeaching}
                disabled={saving}
                title="학생 화면에 원문·학생 해석을 띄우고 메모를 실시간 중계합니다"
              >
                <GraduationCap className="w-4 h-4 mr-1" /> {teaching ? "티칭 중" : "티칭 시작"}
              </Button>
            )}
            {isHeldMode ? (
              <Button
                variant="outline"
                className="border-rose-500/60 text-rose-700 hover:bg-rose-500/10 dark:text-rose-300"
                onClick={remove}
                disabled={saving}
                title="보류 항목 삭제"
              >
                <Trash2 className="w-4 h-4 mr-1" /> 삭제
              </Button>
            ) : (
              <Button
                variant="outline"
                className="border-amber-500/60 text-amber-700 hover:bg-amber-500/10 dark:text-amber-300"
                onClick={hold}
                disabled={saving}
                title="지금 판정하지 않고 나중에 자세히 첨삭"
              >
                <PauseCircle className="w-4 h-4 mr-1" /> 보류 (나중에 첨삭)
              </Button>
            )}
          </div>
          <Button onClick={submit} disabled={saving || (!skipPin && pin.length < 4) || !grade}>
            {saving
              ? "저장 중..."
              : grade === "redo"
                ? "추가학습 요청 보내기"
                : isHeldMode
                  ? "완료 (최종승인)"
                  : "승인하고 다음 문장으로"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

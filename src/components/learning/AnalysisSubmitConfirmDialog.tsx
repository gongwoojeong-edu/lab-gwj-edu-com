// ============================================================
// AnalysisSubmitConfirmDialog — 분석 → 한글해석 전환 직전 게이트
// ============================================================
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { gradeAnalysis, rateLabel, type AnalysisGradeResult } from "@/lib/analysisGrading";
import { decideTrack } from "@/lib/analysisReview";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sentenceId: string;
  /** 현재 sentence_progress.status (이미 미통이면 fail_assist 트랙 안내) */
  currentStatus: "pending" | "pass" | "fail" | "hold";
  /** "제출 →" 클릭 시 */
  onConfirmSubmit: () => void | Promise<void>;
  /** 마스터 없을 때 fallback 표기에 쓰는 단어 분석률 (0~1) */
  wordAnalysisRate?: number;
  /** 분석 가능한 owner 총 개수 (마스터 없을 때 표기용) */
  analyzableTotal?: number;
  /** 분석 완료된 owner 개수 (마스터 없을 때 표기용) */
  analyzedFilled?: number;
}

const rateBarClass = (rate: number) => {
  if (rate >= 0.3) return "bg-emerald-500";
  if (rate >= 0.5) return "bg-amber-500";
  return "bg-destructive";
};

export const AnalysisSubmitConfirmDialog = ({
  open,
  onOpenChange,
  sentenceId,
  currentStatus,
  onConfirmSubmit,
  wordAnalysisRate,
  analyzableTotal,
  analyzedFilled,
}: Props) => {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [grade, setGrade] = useState<AnalysisGradeResult | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  // 🚨 임시방편: supabase auth lock 충돌로 gradeAnalysis가 무한대기할 때 학생이 갇히지 않도록
  // 5초 후 강제로 [제출 →] 버튼을 활성화한다. (채점 실패해도 진행 허용)
  const [timeoutFallback, setTimeoutFallback] = useState(false);

  useEffect(() => {
    if (!open) {
      setTimeoutFallback(false);
      return;
    }
    let mounted = true;
    setLoading(true);
    setShowDiff(false);
    setTimeoutFallback(false);
    const tid = window.setTimeout(() => {
      if (mounted) setTimeoutFallback(true);
    }, 5000);
    gradeAnalysis(sentenceId, { fallbackRate: wordAnalysisRate })
      .then((g) => {
        if (mounted) setGrade(g);
      })
      .catch((e) => {
        console.warn("[AnalysisSubmitConfirmDialog] gradeAnalysis failed", e);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
      window.clearTimeout(tid);
    };
  }, [open, sentenceId, wordAnalysisRate]);

  const hasMaster = !!grade?.hasMaster;
  // hasMaster=true → 마스터 기준 정답률, false → 단어 대비 분석률(외부 props 우선)
  const displayRate = hasMaster
    ? grade!.rate
    : (wordAnalysisRate ??
        (analyzableTotal && analyzableTotal > 0
          ? (analyzedFilled ?? 0) / analyzableTotal
          : 0));
  const ratePct = Math.round(displayRate * 100);
  const filledCount = grade
    ? grade.masterCount - grade.diffs.filter((d) => d.status === "missing").length
    : 0;
  const track = grade && hasMaster
    ? decideTrack({
        rate: grade.rate,
        requiredFilled: grade.requiredOwnersFilled,
        sentenceStatus: currentStatus,
      })
    : null;
  const label = rateLabel(hasMaster);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            📊 분석 제출 확인
          </DialogTitle>
          <DialogDescription>
            지금까지 분석한 정도를 확인하고 한글 해석으로 넘어갈지 결정하세요.
          </DialogDescription>
        </DialogHeader>

        {(loading || !grade) && !timeoutFallback ? (
          <div className="py-10 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        ) : !grade ? (
          <div className="space-y-3 py-4">
            <div className="rounded-lg border-2 border-amber-400 bg-amber-50 dark:bg-amber-950/40 p-3 text-sm text-amber-900 dark:text-amber-100">
              <div className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" /> 채점 결과를 불러오지 못했어요
              </div>
              <div className="text-xs opacity-80 mt-1">
                네트워크가 느리거나 일시적인 오류입니다. 분석한 내용은 이미 저장되어 있으니
                바로 한글 해석으로 넘어가도 괜찮아요.
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              현재 분석률(단어 기준): <span className="font-mono font-bold">{Math.round((wordAnalysisRate ?? 0) * 100)}%</span>
              {analyzableTotal ? ` · ${analyzedFilled ?? 0}/${analyzableTotal}` : null}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* 진행률 막대 */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-foreground">현재 {label}</span>
                <span className="font-mono font-extrabold text-foreground">{ratePct}%</span>
              </div>
              <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={cn("h-full transition-all", rateBarClass(displayRate))}
                  style={{ width: `${ratePct}%` }}
                />
              </div>
              <div className="text-[11px] text-muted-foreground">
                {hasMaster
                  ? `정답 owner ${grade.masterCount}개 · 분석 완료 ${filledCount}개`
                  : analyzableTotal
                    ? `전체 단어 ${analyzableTotal}개 · 분석 완료 ${analyzedFilled ?? 0}개`
                    : null}
              </div>
            </div>

            {/* 마스터 있을 때만: 필수 owner 체크리스트 + 트랙 + diff */}
            {hasMaster && (
              <>
                <div className="rounded-lg border border-border bg-card/50 p-3 space-y-1.5">
                  <div className="text-xs font-bold text-foreground">필수 owner 충족 여부</div>
                  {grade.requiredOwnersFilled ? (
                    <div className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5" /> 모든 필수 owner 분석 완료
                    </div>
                  ) : (
                    <ul className="space-y-1">
                      {grade.missingRequiredOwnerIds.map((id) => (
                        <li
                          key={id}
                          className="flex items-center gap-1.5 text-xs text-destructive"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span className="font-mono">{id}</span> 미입력
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1">
                  <div className="text-xs font-bold text-foreground">자기 첨삭 요청 가능 여부</div>
                  {track === "normal" && (
                    <div className="text-xs text-emerald-700 dark:text-emerald-400">
                      🟢 정상 트랙 — 지금 제출 후 결과 화면에서 선생님분석본보기 요청이 가능합니다.
                    </div>
                  )}
                  {track === "fail_assist" && (
                    <div className="text-xs text-amber-700 dark:text-amber-400">
                      🟡 미통 보조 트랙 — 미통 상태이므로 결과 화면에서 선생님분석본보기 요청이 가능합니다.
                    </div>
                  )}
                  {track === null && grade.rate < 0.3 && (
                    <div className="text-xs text-muted-foreground">
                      🔒 분석률이 30% 미만이라 선생님분석본보기 요청을 받을 수 없어요. 더 분석한 뒤 제출하세요.
                    </div>
                  )}
                  {track === null && grade.rate >= 0.3 && (
                    <div className="text-xs text-muted-foreground">
                      🟡 미통이 되면 미통 보조 트랙으로 선생님분석본보기 요청이 가능해집니다. (현재{" "}
                      {currentStatus === "pending" ? "첫 시도" : currentStatus.toUpperCase()})
                    </div>
                  )}
                </div>

                {grade.diffs.length > 0 && (
                  <div className="space-y-1">
                    <button
                      type="button"
                      onClick={() => setShowDiff((v) => !v)}
                      className="text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                    >
                      {showDiff ? "세부 보기 닫기" : `놓친 owner ${grade.diffs.length}개 보기 (id만 노출)`}
                    </button>
                    {showDiff && (
                      <div className="rounded border border-dashed border-muted-foreground/30 p-2 max-h-32 overflow-y-auto space-y-0.5">
                        {grade.diffs.map((d) => (
                          <div key={d.owner_id} className="text-[10px] font-mono text-muted-foreground">
                            <span
                              className={cn(
                                "inline-block w-14 font-bold",
                                d.status === "missing" && "text-destructive",
                                d.status === "miss" && "text-destructive",
                                d.status === "partial" && "text-amber-600 dark:text-amber-400",
                              )}
                            >
                              {d.status}
                            </span>
                            {d.owner_id}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {grade.rate < 0.3 && (
                  <div className="flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded p-2">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>정답률이 매우 낮아요. 더 진행한 뒤 제출하는 것을 권장합니다.</span>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ← 더 분석하기
          </Button>
          <Button
            onClick={async () => {
              setSubmitting(true);
              try {
                await onConfirmSubmit();
              } catch (e) {
                // proceedToTranslation 등에서 throw돼도 다이얼로그가 멈춰버리면 안 됨.
                // 호출자가 toast로 사용자에게 알림 → 여기서는 다이얼로그를 닫아 재시도 가능 상태로.
                console.error("[AnalysisSubmitConfirmDialog] onConfirmSubmit failed", e);
              } finally {
                setSubmitting(false);
                onOpenChange(false);
              }
            }}
            disabled={loading || submitting}
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "제출 →"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

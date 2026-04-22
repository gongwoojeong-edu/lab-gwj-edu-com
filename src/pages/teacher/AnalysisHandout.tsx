// ============================================================
// AnalysisHandout — 학생본 단독 인쇄 (marked/blank)
// 라우트: /teacher/handout/analysis/:sentenceId/:studentId?mode=marked|blank
// ============================================================
import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Index from "@/pages/Index";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { computeCompareDiff, type CompareDiffResult } from "@/lib/analysisCompare";

interface StudentProfile {
  display_name: string | null;
  student_no: string;
}

const AnalysisHandout = () => {
  const { sentenceId, studentId } = useParams<{ sentenceId: string; studentId: string }>();
  const [params] = useSearchParams();
  const mode = (params.get("mode") ?? "marked") as "marked" | "blank";
  const autoprint = params.get("autoprint") === "1";
  const embed = params.get("embed") === "1";
  const [student, setStudent] = useState<StudentProfile | null>(null);
  const [diff, setDiff] = useState<CompareDiffResult | null>(null);
  const [loading, setLoading] = useState(true);

  // autoprint 처리 — 데이터 로드 + 두 번 rAF 후 인쇄
  useEffect(() => {
    if (!autoprint || loading) return;
    let cancelled = false;
    const fire = () => {
      if (cancelled) return;
      requestAnimationFrame(() => {
        if (cancelled) return;
        requestAnimationFrame(() => {
          if (cancelled) return;
          try {
            window.print();
          } catch (e) {
            console.error("[AnalysisHandout] auto-print failed", e);
          }
        });
      });
    };
    const t = window.setTimeout(fire, 100);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [autoprint, loading]);

  useEffect(() => {
    if (!sentenceId || !studentId) return;
    let cancelled = false;
    Promise.all([
      supabase
        .from("student_profiles")
        .select("display_name, student_no")
        .eq("user_id", studentId)
        .maybeSingle(),
      mode === "marked" ? computeCompareDiff(sentenceId, studentId) : Promise.resolve(null),
    ])
      .then(([{ data: s }, d]) => {
        if (cancelled) return;
        setStudent((s as StudentProfile | null) ?? null);
        setDiff(d);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sentenceId, studentId, mode]);

  const today = useMemo(
    () => new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" }),
    [],
  );

  if (!sentenceId || !studentId) {
    return <div className="p-8 text-sm">잘못된 경로입니다.</div>;
  }

  return (
    <div className={`min-h-screen ${embed ? "" : "bg-muted/30"}`}>
      <style>{`
        @page { size: B5 portrait; margin: 8mm; }
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .handout-sheet {
            box-shadow: none !important;
            margin: 0 !important;
            page-break-after: always;
          }
          .handout-sheet:last-child { page-break-after: auto; }
        }
        .handout-rule {
          background-image: repeating-linear-gradient(
            to bottom,
            transparent 0,
            transparent 9mm,
            hsl(var(--border)) 9mm,
            hsl(var(--border)) calc(9mm + 1px)
          );
        }
        .handout-sheet {
          width: 162mm;
          min-height: 237mm;
          background: white;
          margin: 16px auto;
          box-shadow: 0 2px 12px rgba(0,0,0,0.08);
          font-family: 'Noto Sans KR', 'Plus Jakarta Sans', system-ui, sans-serif;
        }
      `}</style>

      {!autoprint && !embed && (
        <div className="no-print sticky top-0 z-50 border-b bg-background/95 backdrop-blur px-4 py-2 flex items-center justify-between">
          <div className="text-sm font-bold">
            학생본 핸드아웃 — {mode === "marked" ? "채점본 (틀린 부분 음영)" : "blank (재분석용)"}
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              · 양면 인쇄 권장 (1장 2페이지)
            </span>
          </div>
          <Button size="sm" onClick={() => window.print()}>
            <Printer className="size-4" /> 인쇄
          </Button>
        </div>
      )}

      {loading ? (
        <div className="p-12 text-center text-sm text-muted-foreground">불러오는 중...</div>
      ) : (
        <>
          {/* ===== Page 1: 분석 본문 ===== */}
          <main className="handout-sheet p-6 print:p-0">
            <header className="border-b-[3px] border-primary pb-2 mb-4 px-1">
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-[9px] font-bold tracking-[0.2em] text-primary uppercase">
                    Gongwoojeong · Sentence Analysis
                  </div>
                  <div className="text-lg font-extrabold tracking-tight">
                    공우정바른학원 · 구문 분석 학습지
                  </div>
                </div>
                <div className="text-right text-[10px] font-mono text-muted-foreground leading-tight">
                  <div>{sentenceId}</div>
                  <div>{today}</div>
                  <div className="font-bold text-primary">1 / 2</div>
                </div>
              </div>
              <div className="flex items-center justify-between mt-2 text-xs">
                <div className="flex items-center gap-4">
                  <div>
                    학생{" "}
                    <span className="font-bold text-primary border-b border-primary pb-0.5 px-2">
                      {student?.display_name ?? "____________"}
                    </span>
                  </div>
                  <div>
                    번호{" "}
                    <span className="font-bold text-primary border-b border-primary pb-0.5 px-2">
                      {student?.student_no ?? "____"}
                    </span>
                  </div>
                </div>
                <div className="text-[10px] font-bold text-primary tracking-wide">
                  {mode === "marked" ? "채점본" : "재분석본"}
                </div>
              </div>
            </header>

            <section className="mb-3">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="inline-block w-1 h-3.5 bg-primary rounded-sm" />
                <span className="text-[11px] font-bold tracking-wide text-primary">
                  ① 분석 본문
                </span>
              </div>
              <div className="border border-border rounded-md p-3 bg-card leading-[2.5] shadow-sm">
                <Index
                  embedMode
                  studentMode={false}
                  embedSentenceId={sentenceId}
                  hydrateUserId={studentId}
                  compareMode
                  diffOwnerIds={mode === "marked" ? diff?.diffOwnerIds : undefined}
                  missingOwnerIds={mode === "marked" ? diff?.missingOwnerIds : undefined}
                />
              </div>
            </section>

            {mode === "marked" && (
              <p className="text-xs font-bold text-center mb-2 text-primary">
                ※ 위 분석에서 표시(빨강 음영 / 회색 점선)된 부분에 유의하여 다음 페이지에 다시 분석하세요.
              </p>
            )}

            <footer className="mt-3 pt-2 border-t border-border text-[9px] text-muted-foreground text-center">
              뒷면 ② 재분석 영역에 다시 분석해 보세요. · 공우정바른학원
            </footer>
          </main>

          {/* ===== Page 2: 재분석 영역 (양면 인쇄 시 뒷면) ===== */}
          <main className="handout-sheet p-6 print:p-0">
            <header className="border-b-[3px] border-primary pb-2 mb-4 px-1">
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-[9px] font-bold tracking-[0.2em] text-primary uppercase">
                    Gongwoojeong · Re-analysis
                  </div>
                  <div className="text-lg font-extrabold tracking-tight">
                    ② 재분석 영역
                  </div>
                </div>
                <div className="text-right text-[10px] font-mono text-muted-foreground leading-tight">
                  <div>{sentenceId}</div>
                  <div>{today}</div>
                  <div className="font-bold text-primary">2 / 2</div>
                </div>
              </div>
              <div className="flex items-center justify-between mt-2 text-xs">
                <div className="flex items-center gap-4">
                  <div>
                    학생{" "}
                    <span className="font-bold text-primary border-b border-primary pb-0.5 px-2">
                      {student?.display_name ?? "____________"}
                    </span>
                  </div>
                  <div>
                    번호{" "}
                    <span className="font-bold text-primary border-b border-primary pb-0.5 px-2">
                      {student?.student_no ?? "____"}
                    </span>
                  </div>
                </div>
                <div className="text-[10px] font-bold text-primary tracking-wide">
                  자기첨삭
                </div>
              </div>
            </header>

            <section>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="inline-block w-1 h-3.5 bg-primary rounded-sm" />
                <span className="text-[11px] font-bold tracking-wide text-primary">
                  본문을 다시 옮겨 적고 구문 기호로 분석하세요
                </span>
              </div>
              <div className="handout-rule border border-border rounded-md min-h-[200mm] shadow-sm" />
            </section>

            <footer className="mt-3 pt-2 border-t border-border text-[9px] text-muted-foreground text-center">
              도저히 막힐 때만 선생님께 [정답 보기 요청]을 보내세요. · 공우정바른학원
            </footer>
          </main>
        </>
      )}
    </div>
  );
};

export default AnalysisHandout;

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
  const [student, setStudent] = useState<StudentProfile | null>(null);
  const [diff, setDiff] = useState<CompareDiffResult | null>(null);
  const [loading, setLoading] = useState(true);

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
    <div className="min-h-screen bg-background">
      <style>{`
        @page { size: B5 portrait; margin: 8mm; }
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
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
      `}</style>

      <div className="no-print sticky top-0 z-50 border-b bg-background/95 backdrop-blur px-4 py-2 flex items-center justify-between">
        <div className="text-sm font-bold">
          학생본 핸드아웃 — {mode === "marked" ? "채점본 (틀린 부분 음영)" : "blank (재분석용)"}
        </div>
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="size-4" /> 인쇄
        </Button>
      </div>

      {loading ? (
        <div className="p-12 text-center text-sm text-muted-foreground">불러오는 중...</div>
      ) : (
        <main className="max-w-[210mm] mx-auto p-6 print:p-0">
          {/* 헤더: 보라 액센트 */}
          <header className="border-b-2 border-primary pb-2 mb-4">
            <div className="flex items-center justify-between">
              <div className="text-base font-bold tracking-tight">공우정바른학원</div>
              <div className="text-[10px] font-mono text-muted-foreground">{sentenceId}</div>
            </div>
            <div className="flex items-center justify-between mt-1 text-xs">
              <div>
                학생 <span className="font-bold">{student?.display_name ?? "____________"}</span>
                <span className="ml-3">번호 <span className="font-bold">{student?.student_no ?? "____"}</span></span>
              </div>
              <div className="text-muted-foreground">{today}</div>
            </div>
          </header>

          {/* 본문: 학생 분석 그래픽 — 메모용 줄간격 2.5x */}
          <section className="border border-border rounded-md p-3 mb-3 bg-card leading-[2.5]">
            <Index
              embedMode
              studentMode={false}
              embedSentenceId={sentenceId}
              hydrateUserId={studentId}
              compareMode
              diffOwnerIds={mode === "marked" ? diff?.diffOwnerIds : undefined}
              missingOwnerIds={mode === "marked" ? diff?.missingOwnerIds : undefined}
            />
          </section>

          {mode === "marked" && (
            <p className="text-xs font-bold text-center mb-3">
              ※ 위 분석에서 표시(빨강 음영/회색 점선)된 부분에 유의하여 다시 분석해 보세요.
            </p>
          )}

          {/* 재분석 필기 영역 — 하단 1/3 */}
          <section>
            <div className="text-[10px] text-muted-foreground mb-1 font-bold">재분석 영역</div>
            <div className="handout-rule border border-border rounded-md min-h-[80mm]" />
          </section>

          <footer className="mt-3 text-[9px] text-muted-foreground text-center">
            도저히 막힐 때만 선생님께 [정답 보기 요청]을 보내세요.
          </footer>
        </main>
      )}
    </div>
  );
};

export default AnalysisHandout;

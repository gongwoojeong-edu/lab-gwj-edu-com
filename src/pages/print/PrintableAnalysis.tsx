// ============================================================
// PrintableAnalysis — 경량 분석 핸드아웃 (학생본 채점/blank)
// 라우트: /print/analysis/:sentenceId/:studentId?mode=marked|blank
//
// 주의: 분석 본문 자체는 인터랙티브 Index 컴포넌트가 필요하므로
//   기존 AnalysisHandout 와 동일하게 Index 를 임베드. 단 toolbar/Button/lucide 제거.
// ============================================================
import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Index from "@/pages/Index";
import { computeCompareDiff, type CompareDiffResult } from "@/lib/analysisCompare";

interface StudentProfile {
  display_name: string | null;
  student_no: string;
}

const PrintableAnalysis = () => {
  const { sentenceId, studentId } = useParams<{ sentenceId: string; studentId: string }>();
  const [params] = useSearchParams();
  const mode = (params.get("mode") ?? "marked") as "marked" | "blank";
  const autoprint = params.get("autoprint") === "1";
  const embed = params.get("embed") === "1";

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

  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    const fire = async () => {
      try {
        if (
          typeof document !== "undefined" &&
          (document as unknown as { fonts?: { ready?: Promise<unknown> } }).fonts?.ready
        ) {
          await (document as unknown as { fonts: { ready: Promise<unknown> } }).fonts.ready;
        }
      } catch {
        /* ignore */
      }
      // Index 컴포넌트 내부 fetch 가 끝날 시간을 좀 더 줌
      await new Promise((r) => window.setTimeout(r, 250));
      if (cancelled) return;
      requestAnimationFrame(() => {
        if (cancelled) return;
        requestAnimationFrame(() => {
          if (cancelled) return;
          (window as unknown as { __LOVABLE_PRINT_READY?: boolean }).__LOVABLE_PRINT_READY = true;
          if (autoprint && !embed) {
            try {
              window.print();
            } catch (e) {
              console.error("[PrintableAnalysis] auto-print failed", e);
            }
          }
        });
      });
    };
    fire();
    return () => {
      cancelled = true;
    };
  }, [autoprint, embed, loading]);

  const today = useMemo(
    () =>
      new Date().toLocaleDateString("ko-KR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }),
    [],
  );

  if (!sentenceId || !studentId) {
    return <div style={{ padding: 16, fontSize: 12 }}>잘못된 경로입니다.</div>;
  }

  return (
    <div className="pa-root">
      <style>{`
        @page { size: B5 portrait; margin: 8mm; }
        html, body, #root { background: white; }
        .pa-root { background: white; color: black; font-family: 'Noto Sans KR', system-ui, sans-serif; }
        .pa-sheet {
          width: 162mm; min-height: 237mm; background: white;
          margin: 0 auto; padding: 6mm;
          page-break-after: always;
        }
        .pa-sheet:last-child { page-break-after: auto; }
        .pa-header {
          border-bottom: 2.5pt solid #000;
          padding-bottom: 2mm; margin-bottom: 3mm;
          display: flex; justify-content: space-between; align-items: flex-end;
        }
        .pa-title { font-size: 13pt; font-weight: 800; }
        .pa-eyebrow {
          font-size: 7.5pt; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase;
        }
        .pa-meta { font-size: 8.5pt; color: #333; text-align: right; line-height: 1.4; }
        .pa-section-title { font-size: 9pt; font-weight: 700; margin-bottom: 1.5mm; }
        .pa-body {
          border: 0.5pt solid #000; border-radius: 2mm; padding: 3mm;
          line-height: 2.2;
        }
        .pa-rule {
          border: 0.5pt solid #000; border-radius: 2mm; min-height: 200mm;
          background-image: repeating-linear-gradient(
            to bottom, transparent 0, transparent 9mm, #999 9mm, #999 calc(9mm + 0.3pt)
          );
        }
        @media print {
          body { background: white !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      `}</style>

      {loading ? (
        <div style={{ padding: 24, fontSize: 12 }}>불러오는 중…</div>
      ) : (
        <>
          <main className="pa-sheet">
            <header className="pa-header">
              <div>
                <div className="pa-eyebrow">Gongwoojeong · Sentence Analysis</div>
                <div className="pa-title">공우정바른학원 · 구문 분석 학습지</div>
                <div style={{ fontSize: 9, marginTop: 2 }}>
                  학생 <b>{student?.display_name ?? "____________"}</b>{" "}
                  ({student?.student_no ?? "____"}) ·{" "}
                  {mode === "marked" ? "채점본" : "재분석본"}
                </div>
              </div>
              <div className="pa-meta">
                <div>{sentenceId}</div>
                <div>{today}</div>
                <div>1 / 2</div>
              </div>
            </header>

            <div className="pa-section-title">① 분석 본문</div>
            <div className="pa-body">
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

            {mode === "marked" && (
              <p style={{ fontSize: 8.5, fontWeight: 700, textAlign: "center", marginTop: 8 }}>
                ※ 위 분석에서 표시된 부분에 유의하여 다음 페이지에 다시 분석하세요.
              </p>
            )}
          </main>

          <main className="pa-sheet">
            <header className="pa-header">
              <div>
                <div className="pa-eyebrow">Gongwoojeong · Re-analysis</div>
                <div className="pa-title">② 재분석 영역</div>
                <div style={{ fontSize: 9, marginTop: 2 }}>
                  학생 <b>{student?.display_name ?? "____________"}</b>{" "}
                  ({student?.student_no ?? "____"})
                </div>
              </div>
              <div className="pa-meta">
                <div>{sentenceId}</div>
                <div>{today}</div>
                <div>2 / 2</div>
              </div>
            </header>

            <div className="pa-section-title">본문을 다시 옮겨 적고 구문 기호로 분석하세요</div>
            <div className="pa-rule" />
          </main>
        </>
      )}
    </div>
  );
};

export default PrintableAnalysis;

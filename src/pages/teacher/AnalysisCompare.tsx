// ============================================================
// AnalysisCompare — 마스터키 vs 학생 분석 그래픽 좌우 병렬 비교
// 라우트: /teacher/compare/:sentenceId/:studentId
// ============================================================
import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Index from "@/pages/Index";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Printer, ArrowLeft, FileText } from "lucide-react";
import {
  computeCompareDiff,
  type CompareDiffResult,
} from "@/lib/analysisCompare";
import { fetchPassageByCode } from "@/lib/textbooks";

interface AdminProfile {
  user_id: string;
}

interface StudentProfile {
  display_name: string | null;
  student_no: string;
}

interface TranslationRow {
  text: string;
  submitted_at: string;
}

const SS_KEY = (sid: string, uid: string) => `gwj.compareToggle.${sid}.${uid}`;

const loadToggleSet = (sid: string, uid: string): Set<string> => {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.sessionStorage.getItem(SS_KEY(sid, uid));
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
};

const saveToggleSet = (sid: string, uid: string, s: Set<string>) => {
  try {
    window.sessionStorage.setItem(SS_KEY(sid, uid), JSON.stringify(Array.from(s)));
  } catch {
    /* ignore */
  }
};

const AnalysisCompare = () => {
  const { sentenceId, studentId } = useParams<{ sentenceId: string; studentId: string }>();
  const navigate = useNavigate();
  const [adminId, setAdminId] = useState<string | null>(null);
  const [student, setStudent] = useState<StudentProfile | null>(null);
  const [translation, setTranslation] = useState<TranslationRow | null>(null);
  const [diff, setDiff] = useState<CompareDiffResult | null>(null);
  const [manualToggles, setManualToggles] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sentenceId || !studentId) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      supabase.from("user_roles").select("user_id").eq("role", "admin").limit(1).maybeSingle(),
      supabase
        .from("student_profiles")
        .select("display_name, student_no")
        .eq("user_id", studentId)
        .maybeSingle(),
      supabase
        .from("sentence_translations")
        .select("text, submitted_at")
        .eq("sentence_id", sentenceId)
        .eq("user_id", studentId)
        .order("submitted_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      computeCompareDiff(sentenceId, studentId),
    ])
      .then(([{ data: a }, { data: s }, { data: t }, d]) => {
        if (cancelled) return;
        setAdminId(((a as AdminProfile | null)?.user_id) ?? null);
        setStudent((s as StudentProfile | null) ?? null);
        setTranslation((t as TranslationRow | null) ?? null);
        setDiff(d);
        setManualToggles(loadToggleSet(sentenceId, studentId));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sentenceId, studentId]);

  // 자동 diff XOR 수동 토글 = 최종 강조 집합
  const finalDiffOwnerIds = useMemo(() => {
    if (!diff) return new Set<string>();
    const out = new Set<string>(diff.diffOwnerIds);
    manualToggles.forEach((id) => {
      if (out.has(id)) out.delete(id);
      else out.add(id);
    });
    return out;
  }, [diff, manualToggles]);

  const handleOwnerToggle = (ownerId: string) => {
    if (!sentenceId || !studentId) return;
    setManualToggles((prev) => {
      const next = new Set(prev);
      if (next.has(ownerId)) next.delete(ownerId);
      else next.add(ownerId);
      saveToggleSet(sentenceId, studentId, next);
      return next;
    });
  };

  if (!sentenceId || !studentId) {
    return <div className="p-8 text-sm text-muted-foreground">잘못된 경로입니다.</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <style>{`
        @page { size: B4 portrait; margin: 8mm; }
        @media print {
          .no-print { display: none !important; }
          .compare-grid { grid-template-columns: 1fr !important; gap: 12mm !important; }
          .compare-panel { page-break-inside: avoid; box-shadow: none !important; border: 1px solid #ccc !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      `}</style>

      {/* 상단 바 */}
      <div className="no-print sticky top-0 z-50 border-b bg-background/95 backdrop-blur px-4 lg:px-6 py-3">
        <div className="max-w-[1600px] mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
              <ArrowLeft className="size-4" /> 뒤로
            </Button>
            <div className="text-sm">
              <span className="font-bold">정답 확인</span>
              <span className="text-muted-foreground ml-2">·</span>
              <span className="font-bold ml-2">{student?.display_name ?? "학생"}</span>
              <span className="text-muted-foreground ml-1">#{student?.student_no ?? ""}</span>
              <span className="text-muted-foreground ml-3 font-mono text-xs">{sentenceId}</span>
            </div>
            {diff && (
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="font-bold">
                  일치율 {Math.round(diff.rate * 100)}%
                </Badge>
                <Badge variant="destructive" className="font-bold">
                  불일치 {diff.diffOwnerIds.size}
                </Badge>
                {manualToggles.size > 0 && (
                  <Badge variant="outline" className="font-bold">
                    수동 ±{manualToggles.size}
                  </Badge>
                )}
                <Badge variant="outline">미입력 {diff.missingOwnerIds.size}</Badge>
                {diff.extraOwnerIds.size > 0 && (
                  <Badge variant="outline" className="border-amber-500 text-amber-700">
                    추가 {diff.extraOwnerIds.size}
                  </Badge>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to={`/teacher/handout/analysis/${sentenceId}/${studentId}?mode=marked`} target="_blank">
                <FileText className="size-4" /> 핸드아웃(채점)
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to={`/teacher/handout/analysis/${sentenceId}/${studentId}?mode=blank`} target="_blank">
                <FileText className="size-4" /> 핸드아웃(blank)
              </Link>
            </Button>
            <Button size="sm" onClick={() => window.print()}>
              <Printer className="size-4" /> 둘 다 인쇄
            </Button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center text-sm text-muted-foreground">불러오는 중...</div>
      ) : (
        <main className="max-w-[1600px] mx-auto p-4 lg:p-6">
          {!diff?.hasMaster && (
            <Card className="p-4 mb-4 bg-amber-500/10 border-amber-500/40 text-sm">
              ⚠️ 이 문장에는 아직 마스터키(원장 정답)가 등록되지 않았습니다. 차이 계산이 불가합니다.
            </Card>
          )}
          {/* 학생 한글해석 카드 */}
          <Card className="p-4 mb-4">
            <div className="flex items-baseline justify-between mb-2">
              <h3 className="text-sm font-bold">✍️ 학생 한글해석</h3>
              {translation?.submitted_at && (
                <span className="text-[10px] text-muted-foreground">
                  제출: {new Date(translation.submitted_at).toLocaleString("ko-KR")}
                </span>
              )}
            </div>
            {translation?.text ? (
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{translation.text}</p>
            ) : (
              <p className="text-xs text-muted-foreground italic">한글해석 미제출</p>
            )}
          </Card>
          <div className="compare-grid grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* 좌: 마스터키 */}
            <Card className="compare-panel p-3 lg:p-4">
              <div className="flex items-center justify-between mb-2 pb-2 border-b">
                <h2 className="text-sm font-bold">📘 마스터키 (정답)</h2>
                <Badge variant="secondary" className="text-[10px]">읽기 전용</Badge>
              </div>
              {adminId ? (
                <Index
                  embedMode
                  studentMode={false}
                  embedSentenceId={sentenceId}
                  hydrateUserId={adminId}
                  compareMode
                />
              ) : (
                <div className="text-xs text-muted-foreground p-4">관리자(마스터키 작성자) 계정을 찾을 수 없습니다.</div>
              )}
            </Card>

            {/* 우: 학생 */}
            <Card className="compare-panel p-3 lg:p-4">
              <div className="flex items-center justify-between mb-2 pb-2 border-b">
                <h2 className="text-sm font-bold">✏️ 학생 분석</h2>
                <Badge variant="outline" className="text-[10px]">클릭으로 마킹 토글</Badge>
              </div>
              <Index
                embedMode
                studentMode={false}
                embedSentenceId={sentenceId}
                hydrateUserId={studentId}
                compareMode
                diffOwnerIds={finalDiffOwnerIds}
                missingOwnerIds={diff?.missingOwnerIds}
                onOwnerToggle={handleOwnerToggle}
              />
            </Card>
          </div>

          {/* 차이 요약 */}
          {diff && diff.details.length > 0 && (
            <Card className="no-print p-4 mt-4">
              <h3 className="text-sm font-bold mb-3">차이 요약</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-left text-[10px] text-muted-foreground">
                      <th className="py-1.5 pr-2">상태</th>
                      <th className="py-1.5 pr-2">단어/요지</th>
                      <th className="py-1.5 pr-2">정답 POS</th>
                      <th className="py-1.5 pr-2">학생 POS</th>
                      <th className="py-1.5 pr-2">owner_id</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diff.details
                      .filter((d) => d.status !== "exact")
                      .map((d) => {
                        // owner_id 형식: tokenId::idx 또는 span::sid::start-end
                        // 간이 surface 추출: 마지막 segment에서 idx 또는 range
                        const parts = d.ownerId.split("::");
                        const last = parts[parts.length - 1];
                        const surface = last.includes("-") ? `(${last})` : last;
                        const variant =
                          d.status === "missing"
                            ? "outline"
                            : d.status === "extra"
                              ? "secondary"
                              : "destructive";
                        return (
                          <tr key={d.ownerId} className="border-b border-border/40">
                            <td className="py-1.5 pr-2">
                              <Badge variant={variant} className="text-[9px] px-1.5 py-0 font-bold">
                                {d.status}
                              </Badge>
                            </td>
                            <td className="py-1.5 pr-2 font-mono text-[10px]">{surface}</td>
                            <td className="py-1.5 pr-2">{d.masterPos ?? "—"}</td>
                            <td className="py-1.5 pr-2">{d.studentPos ?? "—"}</td>
                            <td className="py-1.5 pr-2 font-mono text-[10px] text-muted-foreground">
                              {d.ownerId}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </main>
      )}
    </div>
  );
};

export default AnalysisCompare;

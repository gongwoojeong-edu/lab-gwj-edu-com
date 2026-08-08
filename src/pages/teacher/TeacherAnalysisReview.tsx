// ============================================================
// TeacherAnalysisReview — 선생님 전용 사이드바이사이드 검토 화면
// 좌: 학생 답안 / 우: 마스터 답안. 헤더에서 즉시 승인/반려.
// ============================================================
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { TeacherLayout } from "@/components/teacher/TeacherLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ShieldCheck,
  KeyRound,
  RefreshCw,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SENTENCES, type Sentence } from "@/data/sentences";
import { hydrateSentencesFromDb } from "@/lib/sentenceSource";
import {
  fetchMasterAnswers,
  fetchStudentAnswersByUserId,
} from "@/lib/analysisGrading";
import { approveReviewRequest, rejectReviewRequest } from "@/lib/analysisReview";
import { fetchIdiomsAll } from "@/integrations/supabase/storage";
import { LEVEL_LABEL } from "@/lib/levels";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

interface AnyProgress {
  pos: string | null;
  noun?: { form: string | null; element: string | null; role: string | null; subrole?: string | null };
  adj?: { form: string | null; element: string | null; role: string | null };
  adv?: { form: string | null; subtype?: string | null; role: string | null };
  etc?: { kind: string | null; role: string | null };
  verb?: { number?: string | null; tense?: string | null; aspect?: string | null; voice?: string | null; proverb?: string | null };
}

const POS_LABEL: Record<string, string> = {
  noun: "명",
  adj: "형",
  adv: "부",
  verb: "동",
  etc: "기타",
};

const formatProgress = (p: AnyProgress | undefined): string => {
  if (!p || !p.pos) return "—";
  const tag = POS_LABEL[p.pos] ?? p.pos;
  switch (p.pos) {
    case "noun":
      return `${tag} · ${p.noun?.form ?? "?"} · ${p.noun?.element ?? "?"}${p.noun?.role ? ` · ${p.noun.role}` : ""}${p.noun?.subrole ? ` · ${p.noun.subrole}` : ""}`;
    case "adj":
      return `${tag} · ${p.adj?.form ?? "?"} · ${p.adj?.element ?? "?"}${p.adj?.role ? ` · ${p.adj.role}` : ""}`;
    case "adv":
      return `${tag} · ${p.adv?.form ?? "?"} · ${p.adv?.role ?? "?"}`;
    case "verb": {
      const bits = [p.verb?.tense, p.verb?.aspect, p.verb?.voice, p.verb?.number].filter(Boolean);
      return `${tag}${bits.length ? " · " + bits.join(" / ") : ""}`;
    }
    case "etc":
      return `${tag} · ${p.etc?.kind ?? "?"}${p.etc?.role ? ` · ${p.etc.role}` : ""}`;
    default:
      return tag;
  }
};

const isMatch = (
  a: AnyProgress | undefined,
  b: AnyProgress | undefined,
): "exact" | "partial" | "miss" | "missing" => {
  if (!a) return "missing";
  if (!b) return "missing";
  if (a.pos !== b.pos) return "miss";
  if (formatProgress(a) === formatProgress(b)) return "exact";
  return "partial";
};

interface ReviewReq {
  id: string;
  user_id: string;
  sentence_id: string;
  attempt_no: number;
  analysis_rate: number;
  track: string;
  status: string;
}

interface StudentInfo {
  display_name: string | null;
  student_no: string;
}

const TeacherAnalysisReview = () => {
  const { requestId } = useParams<{ requestId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<"approve" | "reject" | null>(null);
  const [req, setReq] = useState<ReviewReq | null>(null);
  const [student, setStudent] = useState<StudentInfo | null>(null);
  const [sentence, setSentence] = useState<Sentence | null>(null);
  const [master, setMaster] = useState<Record<string, AnyProgress>>({});
  const [studentAns, setStudentAns] = useState<Record<string, AnyProgress>>({});
  const [idioms, setIdioms] = useState<{ surface: string; meaning: string }[]>([]);
  const { roles } = useAuth();
  const isAdmin = roles.includes("admin");

  const reloadMaster = async () => {
    if (!req) return;
    const m = await fetchMasterAnswers(req.sentence_id);
    setMaster(m);
    toast({
      title: Object.keys(m).length > 0 ? "마스터키가 등록되어 있습니다" : "아직 마스터키가 없습니다",
    });
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      if (!requestId) {
        setLoading(false);
        return;
      }
      const { data: r } = await supabase
        .from("analysis_review_requests")
        .select("id, user_id, sentence_id, attempt_no, analysis_rate, track, status")
        .eq("id", requestId)
        .maybeSingle();
      if (!mounted || !r) {
        setLoading(false);
        return;
      }
      const reqRow = r as ReviewReq;
      setReq(reqRow);

      await hydrateSentencesFromDb();
      const s = SENTENCES.find((x) => x.id === reqRow.sentence_id) ?? null;
      if (!mounted) return;
      setSentence(s);

      const [{ data: sp }, m, sa, idi] = await Promise.all([
        supabase
          .from("student_profiles")
          .select("display_name, student_no")
          .eq("user_id", reqRow.user_id)
          .maybeSingle(),
        fetchMasterAnswers(reqRow.sentence_id),
        fetchStudentAnswersByUserId(reqRow.sentence_id, reqRow.user_id),
        fetchIdiomsAll(),
      ]);
      if (!mounted) return;
      setStudent(sp as StudentInfo | null);
      setMaster(m);
      setStudentAns(sa);
      setIdioms(
        idi
          .filter((x) => x.sentence_id === reqRow.sentence_id)
          .map((x) => ({ surface: x.surface, meaning: x.meaning })),
      );
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [requestId]);

  const ownerIds = useMemo(() => {
    const set = new Set<string>([...Object.keys(master), ...Object.keys(studentAns)]);
    return Array.from(set).sort();
  }, [master, studentAns]);

  const ownerToSurface = useMemo(() => {
    const map: Record<string, string> = {};
    if (!sentence) return map;
    sentence.tokens.forEach((t) => {
      if (t.type === "analyzable") map[t.id] = t.text;
    });
    return map;
  }, [sentence]);

  const handleApprove = async () => {
    if (!req) return;
    setActing("approve");
    try {
      await approveReviewRequest(req.id);
      toast({ title: "승인 완료" });
      navigate("/teacher/requests");
    } catch (e) {
      toast({ title: "승인 실패", description: String(e), variant: "destructive" });
      setActing(null);
    }
  };

  const handleReject = async () => {
    if (!req) return;
    const note = window.prompt("반려 사유 (선택):") ?? undefined;
    setActing("reject");
    try {
      await rejectReviewRequest(req.id, note);
      toast({ title: "반려 처리됨" });
      navigate("/teacher/requests");
    } catch (e) {
      toast({ title: "반려 실패", description: String(e), variant: "destructive" });
      setActing(null);
    }
  };

  if (loading) {
    return (
      <TeacherLayout>
        <div className="min-h-[60vh] flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </TeacherLayout>
    );
  }

  if (!req || !sentence) {
    return (
      <TeacherLayout>
        <div className="max-w-md mx-auto p-6">
          <Card className="p-8 text-center space-y-4">
            <AlertCircle className="w-10 h-10 text-amber-500 mx-auto" />
            <div className="font-bold">요청 또는 Passage를 찾을 수 없어요</div>
            <Button onClick={() => navigate("/teacher/requests")}>
              <ArrowLeft className="w-4 h-4 mr-1" /> 요청 목록으로
            </Button>
          </Card>
        </div>
      </TeacherLayout>
    );
  }

  const isFailAssist = req.track === "fail_assist";
  const ratePct = Math.round(Number(req.analysis_rate) * 100);
  const studentLabel = student?.display_name ?? student?.student_no ?? req.user_id.slice(0, 8);

  return (
    <TeacherLayout>
      <div className="max-w-6xl mx-auto p-5 space-y-5">
        <Card className="p-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/teacher/requests")}
              className="shrink-0"
            >
              <ArrowLeft className="w-4 h-4 mr-1" /> 요청 목록
            </Button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2 py-0.5 rounded-md bg-primary text-primary-foreground text-xs font-extrabold">
                  학생: {studentLabel}
                </span>
                {student?.student_no && (
                  <span className="text-xs text-muted-foreground font-mono">
                    ({student.student_no})
                  </span>
                )}
                <span className="px-2 py-0.5 rounded-md bg-secondary text-secondary-foreground text-xs font-bold">
                  📊 {Object.keys(master).length === 0 ? "분석률" : "정답률"} {ratePct}%
                </span>
                <span
                  className={cn(
                    "px-2 py-0.5 rounded-md text-xs font-extrabold",
                    isFailAssist ? "bg-amber-500 text-white" : "bg-emerald-600 text-white",
                  )}
                >
                  {isFailAssist ? "🟡 미통 보조" : "🟢 정상"}
                </span>
                {req.status !== "pending" && (
                  <span className="px-2 py-0.5 rounded-md bg-muted text-muted-foreground text-xs font-bold uppercase">
                    {req.status}
                  </span>
                )}
                {Object.keys(master).length === 0 && (
                  <>
                    <span className="px-2 py-0.5 rounded-md bg-muted text-muted-foreground text-xs font-bold">
                      마스터 미등록
                    </span>
                    <Button
                      size="sm"
                      className="h-6 px-2 text-xs bg-amber-500 hover:bg-amber-600 text-white"
                      disabled={!isAdmin}
                      title={
                        isAdmin
                          ? "이 지문의 마스터키(정답)를 등록합니다"
                          : "마스터 등록은 관리자 계정에서 가능합니다"
                      }
                      onClick={() =>
                        window.open(
                          `/learn/sentence/${encodeURIComponent(req.sentence_id)}?master=1`,
                          "_blank",
                        )
                      }
                    >
                      <KeyRound className="w-3 h-3 mr-1" /> 마스터 등록
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-xs"
                      title="마스터 등록 여부 다시 확인"
                      onClick={() => void reloadMaster()}
                    >
                      <RefreshCw className="w-3 h-3" />
                    </Button>
                  </>
                )}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {LEVEL_LABEL[sentence.level]} · {sentence.id} · 시도 {req.attempt_no}회
              </div>
              <div className="text-sm font-bold text-foreground truncate max-w-[60vw] mt-0.5">
                {sentence.english}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => window.open(`/teacher/compare/${req.sentence_id}/${req.user_id}`, "_blank")}
              title="정답 확인 (마스터 vs 학생, 새 탭)"
            >
              🖼 정답 확인
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={handleReject}
              disabled={acting !== null || req.status !== "pending"}
            >
              <XCircle className="w-4 h-4 mr-1" /> 반려
            </Button>
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleApprove}
              disabled={acting !== null || req.status !== "pending" || Object.keys(master).length === 0}
              title={Object.keys(master).length === 0 ? "마스터 등록 후 승인 가능" : undefined}
            >
              <CheckCircle2 className="w-4 h-4 mr-1" /> 승인
            </Button>
          </div>
        </Card>

        {idioms.length > 0 && (
          <Card className="p-4 border-emerald-500/30 bg-emerald-500/5">
            <div className="text-xs font-bold text-emerald-700 dark:text-emerald-400 mb-2">
              📖 관용구 (참고용 · 분석 대상 아님)
            </div>
            <ul className="space-y-1 text-sm">
              {idioms.map((i, idx) => (
                <li key={idx}>
                  <span className="font-bold text-foreground">{i.surface}</span>{" "}
                  <span className="text-muted-foreground">— {i.meaning}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-2">
          <div className="text-center text-sm font-extrabold text-primary">🧑‍🎓 학생 답안</div>
          <div className="w-5" />
          <div className="text-center text-sm font-extrabold text-emerald-700 dark:text-emerald-400">
            🏛️ 마스터 답안
          </div>
        </div>

        <div className="space-y-2">
          {ownerIds.length === 0 && (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              비교할 분석 데이터가 없습니다.
            </Card>
          )}
          {ownerIds.map((oid) => {
            const sa = studentAns[oid];
            const m = master[oid];
            const status = isMatch(m, sa);
            const surface = ownerToSurface[oid] ?? oid;
            return (
              <div
                key={oid}
                className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-2 items-stretch"
              >
                <Card
                  className={cn(
                    "p-3 border",
                    sa
                      ? status === "exact"
                        ? "border-emerald-500/30 bg-emerald-50/20 dark:bg-emerald-500/5"
                        : status === "partial"
                          ? "border-amber-500/30 bg-amber-50/20 dark:bg-amber-500/5"
                          : "border-destructive/30 bg-destructive/5"
                      : "border-dashed border-muted-foreground/30",
                  )}
                >
                  <div className="text-xs font-mono text-muted-foreground">{oid}</div>
                  <div className="font-bold text-foreground">{surface}</div>
                  <div className="text-sm mt-1 text-foreground/90">{formatProgress(sa)}</div>
                </Card>
                <div className="flex items-center justify-center">
                  {status === "exact" && <CheckCircle2 className="w-5 h-5 text-emerald-600" />}
                  {status === "partial" && <AlertCircle className="w-5 h-5 text-amber-500" />}
                  {status === "miss" && <XCircle className="w-5 h-5 text-destructive" />}
                  {status === "missing" && <span className="text-xs text-muted-foreground">—</span>}
                </div>
                <Card
                  className={cn(
                    "p-3 border",
                    m
                      ? "border-emerald-500/30 bg-emerald-50/20 dark:bg-emerald-500/5"
                      : "border-dashed border-muted-foreground/30",
                  )}
                >
                  <div className="text-xs font-mono text-muted-foreground">{oid}</div>
                  <div className="font-bold text-foreground">{surface}</div>
                  <div className="text-sm mt-1 text-foreground/90">{formatProgress(m)}</div>
                </Card>
              </div>
            );
          })}
        </div>

        <Card className="p-3 text-[11px] text-muted-foreground bg-muted/30 flex items-center gap-2">
          <ShieldCheck className="w-3.5 h-3.5" />
          검토 전용(Read-only). 승인 시 학생의 자기 첨삭 모드가 잠금 해제됩니다.
        </Card>
      </div>
    </TeacherLayout>
  );
};

export default TeacherAnalysisReview;

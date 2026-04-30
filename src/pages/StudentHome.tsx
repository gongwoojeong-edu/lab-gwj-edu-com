import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, LogOut, Play, Trophy, Sparkles, Flame, Gem, ClipboardList, Clock, Bell, Printer, Eye, Hourglass, CheckCircle2, XCircle, FileText, RotateCcw } from "lucide-react";
import RetestBanner, { useRetestAlertsCount } from "@/components/student/RetestBanner";
import DailyTestSummary from "@/components/teacher/DailyTestSummary";
import { resolveNextSentence } from "@/lib/nextSentence";
import { signOut, useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { SENTENCES, type Sentence } from "@/data/sentences";
import { LEVEL_LABEL } from "@/lib/levels";
import { useLevelLabels } from "@/hooks/useLevelLabels";
import { fetchStudentRewards, type StudentRewards } from "@/lib/rewards";
import type { StudentProfile } from "@/lib/studentProfile";
import { useViewMode } from "@/hooks/useViewMode";
import { cn } from "@/lib/utils";
import {
  cancelMyPrintRequest,
  createPrintRequest,
  createAnalysisPrintRequest,
  fetchMyPendingPrintRequests,
  type PrintRequest,
} from "@/lib/printRequests";
import {
  cancelReviewRequest,
  createReviewRequest,
  fetchOpenRequest,
  type AnalysisReviewRequest,
} from "@/lib/analysisReview";
import { gradeAnalysis } from "@/lib/analysisGrading";
import { getAnalysisPdfSignedUrl } from "@/lib/textbooks";
import { toast } from "@/hooks/use-toast";
import gwjEduLogo from "@/assets/gwj-edu-logo.png";
import AssignmentStepBadges from "@/components/teacher/AssignmentStepBadges";

interface RecentItem {
  sentence: Sentence;
  status: "pass" | "fail" | "hold" | "pending";
  updated_at: string;
}

interface AssignmentRow {
  id: string;
  title: string;
  description: string | null;
  sentence_id: string | null;
  due_at: string;
  include_pre: boolean;
  include_analysis: boolean;
  include_translation: boolean;
  include_wordtest: boolean;
}

interface AssignmentGroup {
  key: string;
  title: string;
  description: string | null;
  due_at: string;
  unit_prefix: string | null;
  include_pre: boolean;
  include_analysis: boolean;
  include_translation: boolean;
  include_wordtest: boolean;
  rows: AssignmentRow[];
  totalCount: number;
  doneCount: number;
  inProgressCount: number;
  nextSentenceId: string | null;
}

/** sentence_id에서 유닛 prefix 추출. 'L08-U260338-001' → 'L08-U260338'. 매칭 안 되면 null. */
const extractUnitPrefix = (sentenceId: string | null): string | null => {
  if (!sentenceId) return null;
  const m = sentenceId.match(/^(.*)-\d{3}$/);
  return m ? m[1] : null;
};

const StudentHome = () => {
  const navigate = useNavigate();
  const { user, roles } = useAuth();
  const { setMode } = useViewMode();
  const { displayStudent: levelDisplay } = useLevelLabels();
  const retestCount = useRetestAlertsCount(user?.id);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [rewards, setRewards] = useState<StudentRewards | null>(null);
  const [next, setNext] = useState<Sentence | null>(null);
  const [done, setDone] = useState(false);
  const [noContent, setNoContent] = useState(false);
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [assignmentGroups, setAssignmentGroups] = useState<AssignmentGroup[]>([]);
  const [assignmentProgress, setAssignmentProgress] = useState<
    Map<string, { pre: boolean; wt: boolean; an: boolean; tr: boolean }>
  >(new Map());
  const [resumeTarget, setResumeTarget] = useState<{ sentenceId: string; title: string } | null>(null);
  const [printReqs, setPrintReqs] = useState<Record<string, PrintRequest>>({});
  const [analysisPrintReqs, setAnalysisPrintReqs] = useState<Record<string, PrintRequest>>({});
  const [reviewReqs, setReviewReqs] = useState<Record<string, AnalysisReviewRequest>>({});
  const [handoutDoneSet, setHandoutDoneSet] = useState<Set<string>>(new Set());
  const [analysisPdfMap, setAnalysisPdfMap] = useState<
    Record<string, { storagePath: string; name: string | null }>
  >({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      const [r, rw] = await Promise.all([resolveNextSentence(), fetchStudentRewards()]);
      if (!mounted) return;
      setProfile(r.profile);
      setNext(r.sentence);
      setDone(r.done);
      setRewards(rw);

      if (user) {
        const [{ data: progressData }, { data: assignData }] = await Promise.all([
          supabase
            .from("sentence_progress")
            .select("sentence_id, status, updated_at, passed_at")
            .eq("user_id", user.id)
            .in("status", ["pass", "fail", "hold", "pending"])
            .order("updated_at", { ascending: false }),
          supabase
            .from("assignments")
            .select("id, title, description, sentence_id, due_at, include_pre, include_analysis, include_translation, include_wordtest")
            .or(`student_id.eq.${user.id},student_id.is.null`)
            .gte("due_at", new Date().toISOString())
            .order("due_at", { ascending: true })
            .limit(200),
        ]);
        const rows = (progressData ?? []) as { sentence_id: string; status: "pass" | "fail" | "hold" | "pending"; updated_at: string; passed_at: string | null }[];

        // 정적 SENTENCES에 없는 코드(textbook_passages 기반)는 DB에서 fallback 조회
        const missingIds = rows
          .map((r) => r.sentence_id)
          .filter((id) => !SENTENCES.find((x) => x.id === id));
        const passageMap = new Map<string, { english: string; korean: string | null }>();
        if (missingIds.length > 0) {
          const { data: passages } = await supabase
            .from("textbook_passages")
            .select("code, english, korean")
            .in("code", missingIds);
          (passages ?? []).forEach((p: { code: string; english: string; korean: string | null }) => {
            passageMap.set(p.code, { english: p.english, korean: p.korean });
          });
        }

        const enriched: RecentItem[] = rows
          .map((row) => {
            const s = SENTENCES.find((x) => x.id === row.sentence_id);
            if (s) {
              return { sentence: s, status: row.status, updated_at: row.passed_at ?? row.updated_at };
            }
            const p = passageMap.get(row.sentence_id);
            if (p) {
              const fakeSentence = {
                id: row.sentence_id,
                english: p.english,
                korean: p.korean ?? "",
                tokens: [],
              } as unknown as Sentence;
              return { sentence: fakeSentence, status: row.status, updated_at: row.passed_at ?? row.updated_at };
            }
            return null;
          })
          .filter(Boolean) as RecentItem[];

        // 완료된 특별과제(해당 sentence가 PASS) 카드는 숨김
        const allAssignments = (assignData ?? []) as AssignmentRow[];
        const assignSentenceIds = allAssignments
          .map((a) => a.sentence_id)
          .filter(Boolean) as string[];
        const progressFlags = new Map<string, { pre: boolean; wt: boolean; an: boolean; tr: boolean }>();
        if (assignSentenceIds.length > 0) {
          const { data: progRows } = await supabase
            .from("sentence_progress")
            .select("sentence_id, status, pre_done, word_test_done, analysis_done, translation_done")
            .eq("user_id", user.id)
            .in("sentence_id", assignSentenceIds);
          ((progRows ?? []) as Array<{
            sentence_id: string;
            status: string;
            pre_done: boolean | null;
            word_test_done: boolean | null;
            analysis_done: boolean | null;
            translation_done: boolean | null;
          }>).forEach((r) => {
            progressFlags.set(r.sentence_id, {
              pre: !!r.pre_done,
              wt: !!r.word_test_done,
              an: !!r.analysis_done,
              tr: !!r.translation_done,
            });
          });
        }
        // 한 sentence가 "완료"인지 판정 (그 과제의 ON 단계 전부 완료)
        const isSentenceDone = (a: AssignmentRow): boolean => {
          if (!a.sentence_id) return false;
          const pf = progressFlags.get(a.sentence_id);
          if (!pf) return false;
          const preOk = !a.include_pre || pf.pre;
          const wtOk = !a.include_wordtest || pf.wt;
          const anOk = !a.include_analysis || pf.an;
          const trOk = !a.include_translation || pf.tr;
          return preOk && wtOk && anOk && trOk;
        };
        const isSentenceStarted = (a: AssignmentRow): boolean => {
          if (!a.sentence_id) return false;
          const pf = progressFlags.get(a.sentence_id);
          return !!pf && (pf.pre || pf.wt || pf.an || pf.tr);
        };

        // sentence_id → unit_id 매핑 조회 (DB 기반 정확한 그룹핑)
        const codeToUnit = new Map<string, string>();
        if (assignSentenceIds.length > 0) {
          const { data: passageRows } = await supabase
            .from("textbook_passages")
            .select("code, unit_id")
            .in("code", assignSentenceIds);
          ((passageRows ?? []) as { code: string; unit_id: string | null }[]).forEach((p) => {
            if (p.unit_id) codeToUnit.set(p.code, p.unit_id);
          });
        }

        // 같은 title|due_at|unit_id (또는 정규식 prefix 폴백) 로 그룹핑
        const groupMap = new Map<string, AssignmentRow[]>();
        allAssignments.forEach((a) => {
          const unitId = a.sentence_id ? codeToUnit.get(a.sentence_id) ?? null : null;
          const fallbackPrefix = extractUnitPrefix(a.sentence_id);
          const groupId = unitId ?? fallbackPrefix ?? a.sentence_id ?? a.id;
          const key = `${a.title}|${a.due_at}|${groupId}`;
          if (!groupMap.has(key)) groupMap.set(key, []);
          groupMap.get(key)!.push(a);
        });

        const groups: AssignmentGroup[] = Array.from(groupMap.entries())
          .map(([key, rows]) => {
            // sentence_id 오름차순으로 정렬
            const sorted = rows
              .slice()
              .sort((x, y) => (x.sentence_id ?? "").localeCompare(y.sentence_id ?? ""));
            const head = sorted[0];
            const doneList = sorted.filter(isSentenceDone);
            const startedList = sorted.filter(
              (a) => !isSentenceDone(a) && isSentenceStarted(a),
            );
            const nextRow = sorted.find((a) => !isSentenceDone(a));
            return {
              key,
              title: head.title,
              description: head.description,
              due_at: head.due_at,
              unit_prefix: extractUnitPrefix(head.sentence_id),
              include_pre: head.include_pre,
              include_analysis: head.include_analysis,
              include_translation: head.include_translation,
              include_wordtest: head.include_wordtest,
              rows: sorted,
              totalCount: sorted.length,
              doneCount: doneList.length,
              inProgressCount: startedList.length,
              nextSentenceId: nextRow?.sentence_id ?? null,
            } as AssignmentGroup;
          })
          // 모든 sentence 완료된 그룹은 숨김
          .filter((g) => g.doneCount < g.totalCount)
          // 마감일 가까운 순
          .sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime());

        if (mounted) {
          setRecent(enriched);
          setAssignmentGroups(groups);
          setAssignmentProgress(progressFlags);
        }

        // 본인의 pending 시험지/분석자료 요청 + 각 sentence별 정답대조 요청 상태 로드
        const sentenceIds = enriched.map((e) => e.sentence.id);
        const pendingPrints = await fetchMyPendingPrintRequests();
        const printMap: Record<string, PrintRequest> = {};
        const analysisPrintMap: Record<string, PrintRequest> = {};
        pendingPrints.forEach((p) => {
          if (!sentenceIds.includes(p.sentence_id)) return;
          if (p.kind === "analysis") analysisPrintMap[p.sentence_id] = p;
          else printMap[p.sentence_id] = p;
        });
        const reviewPairs = await Promise.all(
          sentenceIds.map(async (sid) => [sid, await fetchOpenRequest(sid, 1)] as const),
        );
        const reviewMap: Record<string, AnalysisReviewRequest> = {};
        reviewPairs.forEach(([sid, r]) => {
          if (r) reviewMap[sid] = r;
        });

        // Hand out 학습 완료 여부 (handout_results 행 존재)
        let handoutSet = new Set<string>();
        if (sentenceIds.length > 0) {
          const { data: hoRows } = await supabase
            .from("handout_results")
            .select("sentence_id")
            .eq("user_id", user.id)
            .in("sentence_id", sentenceIds);
          handoutSet = new Set(
            ((hoRows ?? []) as { sentence_id: string | null }[])
              .map((r) => r.sentence_id)
              .filter((x): x is string => !!x),
          );
        }

        // 분석자료 PDF 메타 — 지문(code=sentence id) → 유닛(unit_id) → PDF
        const pdfMap: Record<string, { storagePath: string; name: string | null }> = {};
        if (sentenceIds.length > 0) {
          const { data: pgRows } = await supabase
            .from("textbook_passages")
            .select("code, unit_id")
            .in("code", sentenceIds);
          const codeToUnit = new Map<string, string>();
          ((pgRows ?? []) as { code: string; unit_id: string }[]).forEach((r) => {
            if (r.unit_id) codeToUnit.set(r.code, r.unit_id);
          });
          const unitIds = Array.from(new Set(codeToUnit.values()));
          if (unitIds.length > 0) {
            const { data: unitRows } = await supabase
              .from("textbook_units")
              .select("id, analysis_pdf_url, analysis_pdf_name")
              .in("id", unitIds);
            const unitPdf = new Map<
              string,
              { storagePath: string; name: string | null }
            >();
            ((unitRows ?? []) as {
              id: string;
              analysis_pdf_url: string | null;
              analysis_pdf_name: string | null;
            }[]).forEach((u) => {
              if (u.analysis_pdf_url) {
                unitPdf.set(u.id, {
                  storagePath: u.analysis_pdf_url,
                  name: u.analysis_pdf_name,
                });
              }
            });
            codeToUnit.forEach((unitId, code) => {
              const meta = unitPdf.get(unitId);
              if (meta) pdfMap[code] = meta;
            });
          }
        }

        if (mounted) {
          setPrintReqs(printMap);
          setAnalysisPrintReqs(analysisPrintMap);
          setReviewReqs(reviewMap);
          setHandoutDoneSet(handoutSet);
          setAnalysisPdfMap(pdfMap);
        }
      }
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [user?.id]);

  const setBusyFor = (id: string, v: boolean) =>
    setBusy((prev) => ({ ...prev, [id]: v }));

  const handleRequestPrint = async (sentenceId: string) => {
    setBusyFor(`print:${sentenceId}`, true);
    try {
      const row = await createPrintRequest({ sentence_id: sentenceId });
      setPrintReqs((prev) => ({ ...prev, [sentenceId]: row }));
      toast({ title: "선생님께 시험지 요청을 보냈어요" });
    } catch (e) {
      const msg = String(e);
      toast({
        title: "요청 실패",
        description: msg.includes("print_requests_pending_unique")
          ? "이미 요청 중입니다."
          : msg,
        variant: "destructive",
      });
    } finally {
      setBusyFor(`print:${sentenceId}`, false);
    }
  };

  const handleCancelPrint = async (sentenceId: string) => {
    const cur = printReqs[sentenceId];
    if (!cur) return;
    setBusyFor(`print:${sentenceId}`, true);
    try {
      await cancelMyPrintRequest(cur.id);
      setPrintReqs((prev) => {
        const next = { ...prev };
        delete next[sentenceId];
        return next;
      });
      toast({ title: "요청을 취소했어요" });
    } finally {
      setBusyFor(`print:${sentenceId}`, false);
    }
  };

  const handleViewAnalysisPdf = async (sentenceId: string) => {
    const meta = analysisPdfMap[sentenceId];
    if (!meta) return;
    setBusyFor(`analysis:${sentenceId}`, true);
    try {
      const url = await getAnalysisPdfSignedUrl(meta.storagePath);
      if (!url) {
        toast({ title: "분석자료 열람 실패", variant: "destructive" });
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
    } finally {
      setBusyFor(`analysis:${sentenceId}`, false);
    }
  };

  const handleRequestAnalysisPrint = async (sentenceId: string) => {
    const meta = analysisPdfMap[sentenceId];
    if (!meta) return;
    setBusyFor(`analysis-print:${sentenceId}`, true);
    try {
      const row = await createAnalysisPrintRequest(sentenceId, meta.storagePath);
      setAnalysisPrintReqs((prev) => ({ ...prev, [sentenceId]: row }));
      toast({ title: "분석자료 인쇄 요청을 보냈어요" });
    } catch (e) {
      toast({ title: "요청 실패", description: String(e), variant: "destructive" });
    } finally {
      setBusyFor(`analysis-print:${sentenceId}`, false);
    }
  };

  const handleCancelAnalysisPrint = async (sentenceId: string) => {
    const cur = analysisPrintReqs[sentenceId];
    if (!cur) return;
    setBusyFor(`analysis-print:${sentenceId}`, true);
    try {
      await cancelMyPrintRequest(cur.id);
      setAnalysisPrintReqs((prev) => {
        const next = { ...prev };
        delete next[sentenceId];
        return next;
      });
      toast({ title: "요청을 취소했어요" });
    } finally {
      setBusyFor(`analysis-print:${sentenceId}`, false);
    }
  };

  const handleRequestReview = async (sentenceId: string) => {
    setBusyFor(`review:${sentenceId}`, true);
    try {
      const grade = await gradeAnalysis(sentenceId);
      if (grade.rate < 0.5) {
        toast({
          title: `${grade.hasMaster ? "정답률" : "분석률"}이 부족해요`,
          description: `현재 ${Math.round(grade.rate * 100)}% — 50% 이상 분석 후 요청 가능`,
          variant: "destructive",
        });
        return;
      }
      const cur = recent.find((r) => r.sentence.id === sentenceId);
      const isPass = cur?.status === "pass";
      const isFail = cur?.status === "fail";
      // 마스터 없음(hold 또는 hasMaster=false): 50% 이상이면 normal 트랙으로 허용
      const track: "normal" | "fail_assist" | null =
        grade.rate >= 0.8 && grade.requiredOwnersFilled
          ? "normal"
          : !grade.hasMaster && grade.rate >= 0.5
            ? "normal"
            : isFail && grade.rate >= 0.5
              ? "fail_assist"
              : null;
      if (!track) {
        toast({
          title: "요청 조건 미충족",
          description: "80%(필수 owner 충족) 또는 미통 + 50% 이상이어야 합니다.",
          variant: "destructive",
        });
        return;
      }
      const row = await createReviewRequest({
        sentence_id: sentenceId,
        attempt_no: 1,
        analysis_rate: grade.rate,
        required_filled: grade.requiredOwnersFilled,
        track,
      });
      if (row) setReviewReqs((prev) => ({ ...prev, [sentenceId]: row }));
      toast({ title: "선생님분석본보기 요청을 보냈어요" });
    } catch (e) {
      const msg = String(e);
      toast({
        title: "요청 실패",
        description: msg.includes("uq_arr_open_per_attempt") ? "이미 진행 중인 요청이 있어요." : msg,
        variant: "destructive",
      });
    } finally {
      setBusyFor(`review:${sentenceId}`, false);
    }
  };

  const handleCancelReview = async (sentenceId: string) => {
    const cur = reviewReqs[sentenceId];
    if (!cur) return;
    setBusyFor(`review:${sentenceId}`, true);
    try {
      await cancelReviewRequest(cur.id);
      setReviewReqs((prev) => {
        const next = { ...prev };
        delete next[sentenceId];
        return next;
      });
      toast({ title: "요청을 취소했어요" });
    } finally {
      setBusyFor(`review:${sentenceId}`, false);
    }
  };

  const handleStart = () => {
    if (next) navigate(`/learn/sentence/${encodeURIComponent(next.id)}`);
  };

  const startLabel = next ? `${next.id} 학습 시작` : "다음 Passage 없음";

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-secondary/40">
      {/* Header */}
      <header className="sticky top-0 z-30 backdrop-blur-md bg-background/70 border-b border-border">
        <div className="max-w-5xl mx-auto px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img
              src={gwjEduLogo}
              alt="공우정에듀 로고"
              width={32}
              height={32}
              loading="lazy"
              className="w-8 h-8 object-contain"
            />
            <div>
              <div className="text-sm font-bold text-foreground leading-none">공우정에듀</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                {profile?.student_no ?? "—"} · {profile?.display_name ?? ""}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            {user && retestCount > 0 && (
              <a
                href="#retest-banner"
                className="relative inline-flex items-center justify-center w-8 h-8 rounded-full hover:bg-muted transition-colors"
                aria-label={`재시 알림 ${retestCount}건`}
              >
                <Bell className="w-4 h-4 text-amber-600" />
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {retestCount}
                </span>
              </a>
            )}
            {rewards && (
              <>
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-streak/15 text-streak text-xs font-bold">
                  <Flame className="w-3.5 h-3.5" />
                  {rewards.current_streak}
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-primary/15 text-primary text-xs font-bold">
                  <Gem className="w-3.5 h-3.5" />
                  {rewards.points}
                </span>
              </>
            )}
            {(roles.includes("teacher") || roles.includes("admin")) && (
              <button
                type="button"
                onClick={() => {
                  setMode("teacher");
                  navigate("/teacher");
                }}
                className="text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
              >
                선생님 화면으로 이동
              </button>
            )}
            <Button variant="ghost" size="sm" onClick={() => signOut()}>
              <LogOut className="w-4 h-4 mr-1" /> 로그아웃
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-10 space-y-8">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : done ? (
          <Card className="p-10 text-center space-y-4 bg-gradient-to-br from-primary/10 to-accent/10 border-primary/30">
            <Trophy className="w-16 h-16 mx-auto text-primary" />
            <h1 className="text-3xl font-extrabold text-primary">학습 완료! 🎓</h1>
            <p className="text-muted-foreground">
              모든 레벨을 통과했어요. 정말 수고 많았습니다.
            </p>
          </Card>
        ) : (
          <>
            {user && (
              <div id="retest-banner">
                <RetestBanner userId={user.id} />
              </div>
            )}

            {user && (
              <Card className="p-5 sm:p-6 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-bold text-foreground/80 uppercase tracking-wider">
                      종합점수
                    </h2>
                    <p className="text-xs text-muted-foreground mt-1">
                      최근 온라인·오프라인 합산 기록입니다.
                    </p>
                  </div>
                  <ClipboardList className="w-4 h-4 text-muted-foreground" />
                </div>
                <DailyTestSummary userId={user.id} days={7} />
              </Card>
            )}

            {/* 특별과제 (유닛 단위로 그룹핑) */}
            {assignmentGroups.length > 0 && (
              <Card className="p-5 sm:p-6 space-y-4 border-amber-500/40 bg-gradient-to-br from-amber-500/5 to-transparent">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <ClipboardList className="w-4 h-4 text-amber-600" />
                    <h2 className="text-sm font-bold text-foreground/80 uppercase tracking-wider">
                      특별과제
                    </h2>
                    <span className="px-2 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-extrabold">
                      {assignmentGroups.length}
                    </span>
                  </div>
                </div>
                <ul className="space-y-3">
                  {assignmentGroups.map((g) => {
                    const dueMs = new Date(g.due_at).getTime() - Date.now();
                    const totalH = Math.max(0, Math.floor(dueMs / 3_600_000));
                    const days = Math.floor(totalH / 24);
                    const hours = totalH % 24;
                    const urgent = dueMs < 24 * 3_600_000;
                    const remainText = days > 0 ? `${days}일 ${hours}시간 남음` : `${hours}시간 남음`;
                    const isInProgress = g.inProgressCount > 0 || g.doneCount > 0;
                    const progressPct = g.totalCount > 0 ? Math.round((g.doneCount / g.totalCount) * 100) : 0;
                    return (
                      <li
                        key={g.key}
                        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 rounded-lg border border-border bg-card"
                      >
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold truncate">{g.title}</span>
                            {g.totalCount > 1 && (
                              <span className="inline-flex items-center text-[11px] font-bold px-1.5 py-0.5 rounded bg-primary/15 text-primary">
                                완료 {g.doneCount}/{g.totalCount}
                              </span>
                            )}
                            {isInProgress && g.doneCount < g.totalCount && (
                              <span className="inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300">
                                진행중
                              </span>
                            )}
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 text-[11px] font-bold px-1.5 py-0.5 rounded",
                                urgent
                                  ? "bg-destructive/15 text-destructive"
                                  : "bg-muted text-muted-foreground",
                              )}
                            >
                              <Clock className="w-3 h-3" />
                              {remainText}
                            </span>
                          </div>
                          {g.totalCount > 1 && (
                            <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-primary transition-all"
                                style={{ width: `${progressPct}%` }}
                              />
                            </div>
                          )}
                          <AssignmentStepBadges
                            includePre={g.include_pre}
                            includeAnalysis={g.include_analysis}
                            includeTranslation={g.include_translation}
                            includeWordtest={g.include_wordtest}
                          />
                          {g.description && (
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {g.description}
                            </p>
                          )}
                        </div>
                        {g.nextSentenceId && (() => {
                          const nextSid = g.nextSentenceId;
                          const pf = assignmentProgress.get(nextSid);
                          const startedNext = !!pf && (pf.pre || pf.wt || pf.an || pf.tr);
                          if (startedNext) {
                            return (
                              <Button
                                size="sm"
                                onClick={() =>
                                  setResumeTarget({ sentenceId: nextSid, title: g.title })
                                }
                                className="shrink-0"
                              >
                                <Play className="w-3 h-3 mr-1" />
                                {g.totalCount > 1 ? `이어하기 (${g.doneCount + 1}/${g.totalCount})` : "이어하기"}
                              </Button>
                            );
                          }
                          return (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => navigate(`/learn/sentence/${nextSid}`)}
                              className="shrink-0"
                            >
                              <Play className="w-3 h-3 mr-1" />
                              {g.doneCount > 0 && g.totalCount > 1
                                ? `다음 학습 (${g.doneCount + 1}/${g.totalCount})`
                                : "학습 시작"}
                            </Button>
                          );
                        })()}
                      </li>
                    );
                  })}
                </ul>
              </Card>
            )}

            {/* Hero start card */}
            <Card className="relative overflow-hidden p-8 sm:p-10 bg-gradient-to-br from-primary to-accent text-primary-foreground border-0 shadow-2xl">
              <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-white/10 blur-2xl" />
              <div className="absolute -bottom-16 -left-10 w-56 h-56 rounded-full bg-white/5 blur-3xl" />
              <div className="relative space-y-6">
                <div className="space-y-1">
                  <div className="text-xs uppercase tracking-widest opacity-80">오늘의 학습</div>
                  <h1 className="text-3xl sm:text-4xl font-extrabold">
                    {next ? levelDisplay(next.level) : "—"}
                  </h1>
                  <div className="text-sm opacity-90">
                    {next ? `${next.id} · Passage ${next.no}` : "다음 Passage가 없습니다"}
                  </div>
                </div>
                {next && (
                  <p className="text-base sm:text-lg leading-relaxed font-medium opacity-95 line-clamp-3">
                    {next.english}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    size="lg"
                    onClick={handleStart}
                    disabled={!next}
                    className="bg-white text-primary hover:bg-white/90 font-bold text-base h-12 px-8 shadow-lg"
                  >
                    <Play className="w-5 h-5 mr-2 fill-primary" />
                    {startLabel}
                  </Button>
                  <span className="text-xs opacity-80">
                    1단어 학습 → 2구문 분석 + 해석 → 3단어 테스트
                  </span>
                </div>
              </div>
            </Card>

            {/* Recent */}
            <section className="space-y-3">
              <h2 className="text-sm font-bold text-foreground/80 uppercase tracking-wider">
                내 학습 카드 ({recent.length})
              </h2>
              {recent.length === 0 ? (
                <Card className="p-6 text-center text-sm text-muted-foreground">
                  아직 학습한 Passage가 없어요. 위 버튼을 눌러 시작하세요.
                </Card>
              ) : (
                <div className="grid gap-3 sm:grid-cols-3">
                  {recent.map(({ sentence, status, updated_at }) => {
                    const isFail = status === "fail";
                    const isHold = status === "hold";
                    const isPending = status === "pending";
                    return (
                      <Card
                        key={sentence.id}
                        className={cn(
                          "p-4 space-y-2 transition-colors",
                          isPending
                            ? "border-sky-500/40 hover:border-sky-500/60"
                            : isHold
                              ? "border-muted hover:border-muted-foreground/40"
                              : isFail
                                ? "border-amber-500/40 hover:border-amber-500/60"
                                : "border-primary/20 hover:border-primary/40",
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className="text-[10px] font-mono text-muted-foreground/60 truncate min-w-0 flex-1"
                            title={sentence.id}
                          >
                            {sentence.id}
                          </span>
                          <span
                            className={cn(
                              "shrink-0 px-2 py-0.5 rounded-full text-[10px] font-extrabold whitespace-nowrap",
                              isPending
                                ? "bg-sky-500 text-white"
                                : isHold
                                  ? "bg-muted text-muted-foreground"
                                  : isFail
                                    ? "bg-amber-500 text-white"
                                    : "bg-emerald-500 text-white",
                            )}
                          >
                            {isPending ? "채점전" : isHold ? "보류" : isFail ? "미통" : "PASS"}
                          </span>
                        </div>
                        <p className="text-xs text-foreground/80 line-clamp-2 min-h-[2.5em]">
                          {sentence.english}
                        </p>
                        <div className="flex flex-col gap-2">
                          <div className="text-[10px] text-muted-foreground">
                            {new Date(updated_at).toLocaleString("ko-KR", {
                              month: "2-digit",
                              day: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {/* 시험지 요청 */}
                            {printReqs[sentence.id] ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-[11px] px-2 border-amber-500/50 text-amber-700 dark:text-amber-300"
                                onClick={() => handleCancelPrint(sentence.id)}
                                disabled={!!busy[`print:${sentence.id}`]}
                                title="요청 취소"
                              >
                                <Hourglass className="w-3 h-3 mr-1 animate-pulse" />
                                시험지 요청됨
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-[11px] px-2"
                                onClick={() => handleRequestPrint(sentence.id)}
                                disabled={!!busy[`print:${sentence.id}`]}
                                title="선생님께 시험지 인쇄 요청"
                              >
                                <Printer className="w-3 h-3 mr-1" />
                                시험지 요청
                              </Button>
                            )}

                            {/* 정답보기 요청 */}
                            {reviewReqs[sentence.id]?.status === "approved" ? (
                              <Button
                                size="sm"
                                className="h-7 text-[11px] px-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                                onClick={() =>
                                  navigate(`/learn/sentence/${encodeURIComponent(sentence.id)}/review`)
                                }
                              >
                                <CheckCircle2 className="w-3 h-3 mr-1" />
                                정답보기
                              </Button>
                            ) : reviewReqs[sentence.id]?.status === "pending" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-[11px] px-2 border-amber-500/50 text-amber-700 dark:text-amber-300"
                                onClick={() => handleCancelReview(sentence.id)}
                                disabled={!!busy[`review:${sentence.id}`]}
                                title="요청 취소"
                              >
                                <Hourglass className="w-3 h-3 mr-1 animate-pulse" />
                                정답보기 대기중
                              </Button>
                            ) : reviewReqs[sentence.id]?.status === "rejected" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-[11px] px-2"
                                onClick={() => handleRequestReview(sentence.id)}
                                disabled={!!busy[`review:${sentence.id}`]}
                                title="다시 요청"
                              >
                                <XCircle className="w-3 h-3 mr-1 text-destructive" />
                                재요청
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-[11px] px-2"
                                onClick={() => handleRequestReview(sentence.id)}
                                disabled={!!busy[`review:${sentence.id}`]}
                                title="선생님 정답과 대조 요청"
                              >
                                <Eye className="w-3 h-3 mr-1" />
                                정답보기 요청
                              </Button>
                            )}

                            {/* [분석자료 보기] / [분석 인쇄 요청] 버튼은 학생 화면에서
                                동작하지 않아 사용자 요청으로 제거됨 */}

                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-[11px] px-2"
                              onClick={() =>
                                navigate(`/learn/sentence/${encodeURIComponent(sentence.id)}?restart=1`)
                              }
                              title="1단계부터 다시 학습"
                            >
                              <RotateCcw className="w-3 h-3 mr-1" />
                              {isFail ? "다시 도전" : "다시 하기"}
                            </Button>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </main>

      <AlertDialog open={!!resumeTarget} onOpenChange={(o) => !o && setResumeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>학습을 이어서 할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              {resumeTarget?.title} — 진행 중인 단계가 있어요. 이어서 하면 마지막 단계부터,
              처음부터 다시하면 1단계부터 시작합니다. (이전 작성 내용은 유지됩니다)
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel>취소</AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => {
                if (!resumeTarget) return;
                navigate(`/learn/sentence/${resumeTarget.sentenceId}?restart=1`);
                setResumeTarget(null);
              }}
            >
              처음부터 다시
            </Button>
            <AlertDialogAction
              onClick={() => {
                if (!resumeTarget) return;
                navigate(`/learn/sentence/${resumeTarget.sentenceId}`);
                setResumeTarget(null);
              }}
            >
              이어하기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default StudentHome;

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, LogOut, Play, Trophy, Sparkles, Flame, Gem, ClipboardList, Clock, Bell, Printer, Eye, Hourglass, CheckCircle2, XCircle } from "lucide-react";
import RetestBanner, { useRetestAlertsCount } from "@/components/student/RetestBanner";
import DailyTestSummary from "@/components/teacher/DailyTestSummary";
import { resolveNextSentence } from "@/lib/nextSentence";
import { signOut, useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { SENTENCES, type Sentence } from "@/data/sentences";
import { LEVEL_LABEL } from "@/lib/levels";
import { fetchStudentRewards, type StudentRewards } from "@/lib/rewards";
import type { StudentProfile } from "@/lib/studentProfile";
import { useViewMode } from "@/hooks/useViewMode";
import { cn } from "@/lib/utils";
import {
  cancelMyPrintRequest,
  createPrintRequest,
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
import { toast } from "@/hooks/use-toast";
import gwjEduLogo from "@/assets/gwj-edu-logo.png";

interface RecentItem {
  sentence: Sentence;
  status: "pass" | "fail";
  updated_at: string;
}

interface AssignmentRow {
  id: string;
  title: string;
  description: string | null;
  sentence_id: string | null;
  due_at: string;
}

const StudentHome = () => {
  const navigate = useNavigate();
  const { user, roles } = useAuth();
  const { setMode } = useViewMode();
  const retestCount = useRetestAlertsCount(user?.id);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [rewards, setRewards] = useState<StudentRewards | null>(null);
  const [next, setNext] = useState<Sentence | null>(null);
  const [done, setDone] = useState(false);
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [printReqs, setPrintReqs] = useState<Record<string, PrintRequest>>({});
  const [reviewReqs, setReviewReqs] = useState<Record<string, AnalysisReviewRequest>>({});
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
            .in("status", ["pass", "fail"])
            .order("updated_at", { ascending: false })
            .limit(5),
          supabase
            .from("assignments")
            .select("id, title, description, sentence_id, due_at")
            .or(`student_id.eq.${user.id},student_id.is.null`)
            .gte("due_at", new Date().toISOString())
            .order("due_at", { ascending: true })
            .limit(5),
        ]);
        const rows = (progressData ?? []) as { sentence_id: string; status: "pass" | "fail"; updated_at: string; passed_at: string | null }[];
        const enriched: RecentItem[] = rows
          .map((row) => {
            const s = SENTENCES.find((x) => x.id === row.sentence_id);
            return s ? { sentence: s, status: row.status, updated_at: row.passed_at ?? row.updated_at } : null;
          })
          .filter(Boolean) as RecentItem[];
        if (mounted) {
          setRecent(enriched);
          setAssignments((assignData ?? []) as AssignmentRow[]);
        }

        // 본인의 pending 시험지 요청 + 각 sentence별 정답대조 요청 상태 로드
        const sentenceIds = enriched.map((e) => e.sentence.id);
        const pendingPrints = await fetchMyPendingPrintRequests();
        const printMap: Record<string, PrintRequest> = {};
        pendingPrints.forEach((p) => {
          if (sentenceIds.includes(p.sentence_id)) printMap[p.sentence_id] = p;
        });
        const reviewPairs = await Promise.all(
          sentenceIds.map(async (sid) => [sid, await fetchOpenRequest(sid, 1)] as const),
        );
        const reviewMap: Record<string, AnalysisReviewRequest> = {};
        reviewPairs.forEach(([sid, r]) => {
          if (r) reviewMap[sid] = r;
        });
        if (mounted) {
          setPrintReqs(printMap);
          setReviewReqs(reviewMap);
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

  const handleRequestReview = async (sentenceId: string) => {
    setBusyFor(`review:${sentenceId}`, true);
    try {
      const grade = await gradeAnalysis(sentenceId);
      if (grade.rate < 0.5) {
        toast({
          title: "분석률이 부족해요",
          description: `현재 ${Math.round(grade.rate * 100)}% — 50% 이상 분석 후 요청 가능`,
          variant: "destructive",
        });
        return;
      }
      const isPass = recent.find((r) => r.sentence.id === sentenceId)?.status === "pass";
      const track = grade.rate >= 0.8 && grade.requiredOwnersFilled
        ? "normal"
        : (!isPass && grade.rate >= 0.5 ? "fail_assist" : null);
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
      toast({ title: "정답 대조 요청을 보냈어요" });
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

            {/* 특별과제 */}
            {assignments.length > 0 && (
              <Card className="p-5 sm:p-6 space-y-4 border-amber-500/40 bg-gradient-to-br from-amber-500/5 to-transparent">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <ClipboardList className="w-4 h-4 text-amber-600" />
                    <h2 className="text-sm font-bold text-foreground/80 uppercase tracking-wider">
                      특별과제
                    </h2>
                    <span className="px-2 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-extrabold">
                      {assignments.length}
                    </span>
                  </div>
                </div>
                <ul className="space-y-3">
                  {assignments.map((a) => {
                    const dueMs = new Date(a.due_at).getTime() - Date.now();
                    const totalH = Math.max(0, Math.floor(dueMs / 3_600_000));
                    const days = Math.floor(totalH / 24);
                    const hours = totalH % 24;
                    const urgent = dueMs < 24 * 3_600_000;
                    const remainText = days > 0 ? `${days}일 ${hours}시간 남음` : `${hours}시간 남음`;
                    return (
                      <li
                        key={a.id}
                        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 rounded-lg border border-border bg-card"
                      >
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold truncate">{a.title}</span>
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
                          {a.description && (
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {a.description}
                            </p>
                          )}
                        </div>
                        {a.sentence_id && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => navigate(`/learn/sentence/${a.sentence_id}`)}
                            className="shrink-0"
                          >
                            <Play className="w-3 h-3 mr-1" /> 학습 시작
                          </Button>
                        )}
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
                    {next ? LEVEL_LABEL[next.level] ?? next.level : "—"}
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
                최근 학습 Passage
              </h2>
              {recent.length === 0 ? (
                <Card className="p-6 text-center text-sm text-muted-foreground">
                  아직 학습한 Passage가 없어요. 위 버튼을 눌러 시작하세요.
                </Card>
              ) : (
                <div className="grid gap-3 sm:grid-cols-3">
                  {recent.map(({ sentence, status, updated_at }) => {
                    const isFail = status === "fail";
                    return (
                      <Card
                        key={sentence.id}
                        className={cn(
                          "p-4 space-y-2 transition-colors",
                          isFail
                            ? "border-amber-500/40 hover:border-amber-500/60"
                            : "border-primary/20 hover:border-primary/40",
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-primary">{sentence.id}</span>
                          <span
                            className={cn(
                              "px-2 py-0.5 rounded-full text-[10px] font-extrabold",
                              isFail ? "bg-amber-500 text-white" : "bg-emerald-500 text-white",
                            )}
                          >
                            {isFail ? "미통" : "PASS"}
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

                            {isFail && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-[11px] px-2"
                                onClick={() =>
                                  navigate(`/learn/sentence/${encodeURIComponent(sentence.id)}`)
                                }
                              >
                                다시 도전
                              </Button>
                            )}
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
    </div>
  );
};

export default StudentHome;

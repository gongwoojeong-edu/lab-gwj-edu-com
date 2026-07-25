import { useEffect, useMemo, useState } from "react";
import { TeacherLayout } from "@/components/teacher/TeacherLayout";
import { Card } from "@/components/ui/card";
import { Link } from "react-router-dom";
import {
  BookOpen,
  Users,
  RefreshCcw,
  ClipboardList,
  ClipboardCheck,
  Clock,
  Settings2,
  AlertTriangle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllStudents, type StudentProfile } from "@/lib/studentProfile";
import { usePendingReviewCount } from "@/hooks/usePendingReviewCount";
import { Button } from "@/components/ui/button";
import AssignmentStepBadges from "@/components/teacher/AssignmentStepBadges";
import ClassKpiCards from "@/components/stats/ClassKpiCards";
import {
  fetchAssignmentProgress,
  type AssignmentProgressMap,
} from "@/lib/assignmentProgress";
import {
  fetchLongStalled,
  fetchImminentIncomplete,
  STALL_THRESHOLD_DAYS,
  type StalledStudent,
  type StalledAssignmentTarget,
} from "@/lib/stalledStudents";

const TILES = [
  { to: "/teacher/requests", title: "요청확인", desc: "분석승인·인쇄·자료열람", icon: ClipboardCheck, badgeKey: "pending" as const },
  { to: "/teacher/assignments", title: "과제출제", desc: "학생에게 과제 출제", icon: ClipboardList },
  { to: "/teacher/results", title: "학습결과", desc: "학습완료 처리·HO 성적 입력", icon: RefreshCcw },
  { to: "/teacher/roster", title: "학생목록", desc: "재원생·선생님 계정 (Orbit)", icon: Users },
  { to: "/teacher/students", title: "학습 설정", desc: "통과기준·PIN·시작 레벨", icon: Settings2 },
  { to: "/teacher/bookshelf", title: "책장", desc: "레벨별 교재 관리", icon: BookOpen },
];

interface UpcomingAssignment {
  id: string;
  title: string;
  due_at: string | null;
  sentence_id: string | null;
  student_id: string | null;
  include_pre: boolean;
  include_analysis: boolean;
  include_translation: boolean;
  include_wordtest: boolean;
}

const TeacherHome = () => {
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const pendingCount = usePendingReviewCount();

  const [upcoming, setUpcoming] = useState<UpcomingAssignment[]>([]);
  const [progressByAsg, setProgressByAsg] = useState<Record<string, AssignmentProgressMap>>({});
  const [progressTick, setProgressTick] = useState(0);
  const [longStalled, setLongStalled] = useState<StalledStudent[]>([]);
  const [imminent, setImminent] = useState<StalledAssignmentTarget[]>([]);

  const studentNameMap = useMemo(() => {
    const m = new Map<string, string>();
    students.forEach((s) => m.set(s.user_id, s.display_name ?? s.student_no));
    return m;
  }, [students]);

  useEffect(() => {
    const nowIso = new Date().toISOString();
    const inSevenDays = new Date(Date.now() + 7 * 24 * 3_600_000).toISOString();
    void supabase
      .from("assignments")
      .select(
        "id, title, due_at, sentence_id, student_id, include_pre, include_analysis, include_translation, include_wordtest",
      )
      .or(`and(due_at.gte.${nowIso},due_at.lte.${inSevenDays}),due_at.is.null`)
      .order("due_at", { ascending: true, nullsFirst: false })
      .limit(8)
      .then(({ data }) => setUpcoming((data ?? []) as UpcomingAssignment[]));
  }, []);

  useEffect(() => {
    let mounted = true;
    fetchAllStudents().then((s) => {
      if (mounted) setStudents(s);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (upcoming.length === 0 || students.length === 0) return;
    const allIds = students.map((s) => s.user_id);
    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        upcoming
          .filter((a) => a.sentence_id)
          .map(async (a) => {
            const targets = a.student_id ? [a.student_id] : allIds;
            const m = await fetchAssignmentProgress(a.sentence_id!, targets);
            return [a.id, m] as const;
          }),
      );
      if (cancelled) return;
      const next: Record<string, AssignmentProgressMap> = {};
      entries.forEach(([id, m]) => {
        next[id] = m;
      });
      setProgressByAsg(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [upcoming, students, progressTick]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [a, b] = await Promise.all([fetchLongStalled(), fetchImminentIncomplete()]);
      if (cancelled) return;
      setLongStalled(a);
      setImminent(b);
    })();
    return () => {
      cancelled = true;
    };
  }, [progressTick]);

  useEffect(() => {
    const sentenceIds = upcoming.map((a) => a.sentence_id).filter(Boolean) as string[];
    if (sentenceIds.length === 0) return;
    const channel = supabase
      .channel("teacher-home-progress")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sentence_progress" },
        () => setProgressTick((t) => t + 1),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "word_test_results" },
        () => setProgressTick((t) => t + 1),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [upcoming]);

  return (
    <TeacherLayout>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold">대시보드</h1>
          <p className="text-sm text-muted-foreground mt-1">
            오늘의 학습 진행 현황을 확인하세요. 인쇄·자료열람 요청은 <Link to="/teacher/requests" className="text-primary hover:underline">요청확인</Link>, 학습완료 처리·HO 성적 입력은 <Link to="/teacher/results" className="text-primary hover:underline">학습결과</Link>에서 진행합니다.
          </p>
        </div>

        {/* 반 전체 통계 KPI */}
        <ClassKpiCards />

        {/* Quick tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {TILES.map((t) => {
            const Icon = t.icon;
            const showBadge = t.badgeKey === "pending" && pendingCount > 0;
            return (
              <Link key={t.to} to={t.to}>
                <Card className="relative p-3 hover:border-primary/50 hover:shadow-md transition-all cursor-pointer h-full">
                  <Icon className="size-5 text-primary mb-2" />
                  <div className="text-sm font-bold">{t.title}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">{t.desc}</div>
                  {showBadge && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center shadow">
                      {pendingCount}
                    </span>
                  )}
                </Card>
              </Link>
            );
          })}
        </div>

        {/* 정체 학생 요약 알림 */}
        {(longStalled.length > 0 || imminent.length > 0) && (
          <Card className="p-4 border-2 border-amber-500/40 bg-amber-50/40 dark:bg-amber-500/5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="size-5 text-amber-600 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="text-sm font-bold text-foreground">
                    독려가 필요한 학생이 있어요
                  </div>
                  <Link
                    to="/teacher/stalled"
                    className="text-xs text-primary hover:underline whitespace-nowrap"
                  >
                    전체 보기 →
                  </Link>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-500/15 text-amber-800 dark:text-amber-200 font-bold">
                    🐢 장기 정체 ({STALL_THRESHOLD_DAYS}일+) {longStalled.length}명
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-destructive/15 text-destructive font-bold">
                    ⏰ 마감 24h 미완료 {imminent.length}명
                  </span>
                </div>
                {longStalled.slice(0, 5).length > 0 && (
                  <ul className="text-xs text-muted-foreground space-y-0.5">
                    {longStalled.slice(0, 5).map((s, i) => (
                      <li key={`${s.user_id}-${s.sentence_id}-${i}`} className="truncate">
                        <span className="font-medium text-foreground">
                          {studentNameMap.get(s.user_id) ?? "—"}
                        </span>
                        {" · "}
                        <span className="font-mono">{s.sentence_id}</span>
                        {" · "}
                        {s.word_test_score != null && (
                          <span className="font-bold">단어 {s.word_test_score}% · </span>
                        )}
                        <span className="text-amber-700 dark:text-amber-300">
                          {Math.floor((Date.now() - new Date(s.last_activity_at).getTime()) / (24 * 3_600_000))}일 정체
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </Card>
        )}

        {/* 오늘의 학습 진행 현황 (마감 임박 특별과제) */}
        <Card className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ClipboardList className="size-4 text-amber-600" />
              <h2 className="text-sm font-bold">오늘의 학습 진행 현황</h2>
              <span className="text-xs text-muted-foreground">(마감 임박 특별과제 · 향후 7일 · 무기한 포함)</span>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setProgressTick((t) => t + 1)}
                title="진척 새로고침"
              >
                <RefreshCcw className="size-3 mr-1" />
                새로고침
              </Button>
              <Link
                to="/teacher/assignments/box"
                className="text-xs text-primary hover:underline"
              >
                전체 보기 →
              </Link>
            </div>
          </div>
          {upcoming.length === 0 ? (
            <div className="text-xs text-muted-foreground py-3">
              표시할 과제 없음 — <Link to="/teacher/assignments/box" className="text-primary hover:underline">과제함</Link>에서 전체 목록을 확인하세요.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {upcoming.map((a) => {
                const dueMs = a.due_at
                  ? new Date(a.due_at).getTime() - Date.now()
                  : null;
                const totalH = dueMs != null ? Math.max(0, Math.floor(dueMs / 3_600_000)) : 0;
                const days = Math.floor(totalH / 24);
                const hours = totalH % 24;
                const urgent = dueMs != null && dueMs < 24 * 3_600_000;
                const remainText =
                  dueMs == null ? "무기한" : days > 0 ? `${days}일 ${hours}시간` : `${hours}시간`;
                const target = a.student_id
                  ? studentNameMap.get(a.student_id) ?? "—"
                  : "전체 학생";

                const targetIds = a.student_id
                  ? [a.student_id]
                  : students.map((s) => s.user_id);
                const progressMap = progressByAsg[a.id];
                const isStepDone = (st: { status: string }) =>
                  st.status === "pass" || st.status === "done";
                const isUserComplete = (uid: string) => {
                  const p = progressMap?.get(uid);
                  if (!p) return false;
                  if (a.include_pre && !isStepDone(p.pre)) return false;
                  if (a.include_analysis && !isStepDone(p.analysis)) return false;
                  if (a.include_translation && !isStepDone(p.translation)) return false;
                  if (a.include_wordtest && !isStepDone(p.wordtest)) return false;
                  return true;
                };
                const completedCount = progressMap
                  ? targetIds.filter(isUserComplete).length
                  : 0;
                const allComplete =
                  progressMap != null && targetIds.length > 0 && completedCount === targetIds.length;
                const partial = completedCount > 0 && !allComplete;

                return (
                  <li
                    key={a.id}
                    className="py-2 flex items-center gap-3 text-sm"
                  >
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="font-medium truncate">{a.title}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {target}
                        {a.sentence_id && ` · ${a.sentence_id}`}
                      </div>
                      <AssignmentStepBadges
                        includePre={a.include_pre}
                        includeAnalysis={a.include_analysis}
                        includeTranslation={a.include_translation}
                        includeWordtest={a.include_wordtest}
                        size="xs"
                        progress={progressByAsg[a.id]}
                        studentNameMap={studentNameMap}
                        targetUserIds={targetIds}
                      />
                    </div>
                    {allComplete ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-1.5 py-0.5 rounded bg-primary/15 text-primary">
                        ✓ 학습완료
                      </span>
                    ) : partial ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-1.5 py-0.5 rounded bg-muted text-foreground">
                        {completedCount}/{targetIds.length} 완료
                      </span>
                    ) : null}
                    <span
                      className={
                        urgent
                          ? "inline-flex items-center gap-1 text-[11px] font-bold px-1.5 py-0.5 rounded bg-destructive/15 text-destructive"
                          : "inline-flex items-center gap-1 text-[11px] font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                      }
                    >
                      <Clock className="w-3 h-3" />
                      {remainText} 남음
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </TeacherLayout>
  );
};

export default TeacherHome;

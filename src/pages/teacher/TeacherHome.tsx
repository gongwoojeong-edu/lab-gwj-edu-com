import React, { useEffect, useMemo, useState } from "react";
import { TeacherLayout } from "@/components/teacher/TeacherLayout";
import { Card } from "@/components/ui/card";
import { Link } from "react-router-dom";
import {
  BookOpen,
  Users,
  ClipboardList,
  ClipboardCheck,
  Settings2,
  RefreshCcw,
  AlertTriangle,
} from "lucide-react";
import { fetchAllStudents, type StudentProfile } from "@/lib/studentProfile";
import { useAuth } from "@/hooks/useAuth";
import { useStaff } from "@/lib/staff-context";
import { usePendingReviewCount } from "@/hooks/usePendingReviewCount";
import DailyTestSummary from "@/components/teacher/DailyTestSummary";
import ClassKpiCards from "@/components/stats/ClassKpiCards";
import TodayAttendeesPanel from "@/components/teacher/TodayAttendeesPanel";
import {
  fetchLongStalled,
  fetchImminentIncomplete,
  STALL_THRESHOLD_DAYS,
  type StalledStudent,
  type StalledAssignmentTarget,
} from "@/lib/stalledStudents";

const TILES = [
  {
    to: "/teacher/inbox",
    title: "요청확인",
    desc: "인쇄·자료·분석 요청",
    icon: ClipboardCheck,
    badgeKey: "pending" as const,
  },
  { to: "/teacher/bookshelf", title: "책장", desc: "레벨별 교재 관리", icon: BookOpen },
  { to: "/teacher/roster", title: "학생목록", desc: "재원생·선생님 계정", icon: Users },
  { to: "/teacher/students", title: "학습 설정", desc: "통과기준·PIN·시작 레벨", icon: Settings2 },
  { to: "/teacher/assignments", title: "과제출제", desc: "특별과제 발행", icon: ClipboardList },
  {
    to: "/teacher/results",
    title: "학습결과",
    desc: "HO·학습완료·솔루션",
    icon: RefreshCcw,
  },
];

const TeacherHome = () => {
  const { user, roles } = useAuth();
  const { isDirector, effectiveTeacherAuthUserId, isViewingAsOther } = useStaff();
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const pendingCount = usePendingReviewCount();
  const [longStalled, setLongStalled] = useState<StalledStudent[]>([]);
  const [imminent, setImminent] = useState<StalledAssignmentTarget[]>([]);

  const canToggleScope = roles.includes("admin") || isDirector;
  const teacherAuthUserId =
    effectiveTeacherAuthUserId ?? user?.id ?? null;

  const studentNameMap = useMemo(() => {
    const m = new Map<string, string>();
    students.forEach((s) => m.set(s.user_id, s.display_name ?? s.student_no));
    return m;
  }, [students]);

  useEffect(() => {
    let mounted = true;
    fetchAllStudents().then((s) => {
      if (mounted) {
        setStudents(s);
        setLoading(false);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    void Promise.all([fetchLongStalled(), fetchImminentIncomplete()]).then(
      ([stalled, imm]) => {
        if (!mounted) return;
        setLongStalled(stalled);
        setImminent(imm);
      },
    );
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <TeacherLayout>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold">대시보드</h1>
          <p className="text-sm text-muted-foreground mt-1">
            오늘 등원자 진도·상태를 보고, 인쇄는 요청확인 · 채점·완료는 학습결과에서
            처리하세요.
          </p>
        </div>

        <ClassKpiCards />

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
                        <span className="text-amber-700 dark:text-amber-300">
                          {Math.floor(
                            (Date.now() - new Date(s.last_activity_at).getTime()) /
                              (24 * 3_600_000),
                          )}
                          일 정체
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </Card>
        )}

        {!loading && (
          <TodayAttendeesPanel
            students={students}
            teacherAuthUserId={teacherAuthUserId}
            canToggleScope={canToggleScope && !isViewingAsOther}
          />
        )}

        <DailyTestSummary />
      </div>
    </TeacherLayout>
  );
};

export default TeacherHome;

import React, { useEffect, useState } from "react";
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
} from "lucide-react";
import { fetchActiveStudents, type StudentProfile } from "@/lib/studentProfile";
import { useAuth } from "@/hooks/useAuth";
import { useStaff } from "@/lib/staff-context";
import { usePendingReviewCount } from "@/hooks/usePendingReviewCount";
import DailyTestSummary from "@/components/teacher/DailyTestSummary";
import ClassKpiCards from "@/components/stats/ClassKpiCards";
import TodayAttendeesPanel from "@/components/teacher/TodayAttendeesPanel";

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
  const [showDeferredWidgets, setShowDeferredWidgets] = useState(false);

  const canToggleScope = roles.includes("admin") || isDirector;
  const teacherAuthUserId =
    effectiveTeacherAuthUserId ?? user?.id ?? null;

  useEffect(() => {
    let mounted = true;
    fetchActiveStudents().then((s) => {
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
    const timer = window.setTimeout(() => setShowDeferredWidgets(true), 1200);
    return () => {
      window.clearTimeout(timer);
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

        {!loading && showDeferredWidgets && (
          <TodayAttendeesPanel
            students={students}
            teacherAuthUserId={teacherAuthUserId}
            canToggleScope={canToggleScope && !isViewingAsOther}
          />
        )}

        {teacherAuthUserId && showDeferredWidgets && <DailyTestSummary userId={teacherAuthUserId} />}
      </div>
    </TeacherLayout>
  );
};

export default TeacherHome;

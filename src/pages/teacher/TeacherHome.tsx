import { useEffect, useMemo, useRef, useState } from "react";
import { TeacherLayout } from "@/components/teacher/TeacherLayout";
import { Card } from "@/components/ui/card";
import { Link } from "react-router-dom";
import {
  BookOpen,
  ChevronDown,
  Users,
  Printer,
  RefreshCcw,
  ClipboardList,
  ClipboardCheck,
  Clock,
  PenLine,
} from "lucide-react";
import { LEVEL_LABEL } from "@/lib/levels";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllStudents, type StudentProfile } from "@/lib/studentProfile";
import { useAuth } from "@/hooks/useAuth";
import SessionDateBar from "@/components/teacher/SessionDateBar";
import WordHoInput from "@/components/teacher/WordHoInput";
import SyntaxHoToggle from "@/components/teacher/SyntaxHoToggle";
import {
  fetchHandoutResultsByDate,
  toIsoDate,
  type HandoutResult,
} from "@/lib/handoutResults";
import { usePendingReviewCount } from "@/hooks/usePendingReviewCount";
import { Button } from "@/components/ui/button";
import DailyTestSummary from "@/components/teacher/DailyTestSummary";
import AssignmentStepBadges from "@/components/teacher/AssignmentStepBadges";
import ClassKpiCards from "@/components/stats/ClassKpiCards";

const TILES = [
  { to: "/teacher/requests", title: "정답 대조 요청", desc: "학생 자기첨삭 승인", icon: ClipboardCheck, badgeKey: "pending" as const },
  { to: "/teacher/bookshelf", title: "책장", desc: "레벨별 교재 관리", icon: BookOpen },
  { to: "/teacher/students", title: "학생 목록", desc: "학생 진행/권한 관리", icon: Users },
  { to: "/teacher/assignments", title: "특별과제", desc: "학생에게 특별과제 부여", icon: ClipboardList },
  { to: "/teacher/print-queue", title: "인쇄 대기열", desc: "시험지 승인·출력", icon: Printer },
  { to: "/teacher/retests", title: "재시험 관리", desc: "단어 테스트 재시도", icon: RefreshCcw },
];

interface UpcomingAssignment {
  id: string;
  title: string;
  due_at: string;
  sentence_id: string | null;
  student_id: string | null;
  include_pre: boolean;
  include_analysis: boolean;
  include_translation: boolean;
  include_wordtest: boolean;
}

const TeacherHome = () => {
  const { user } = useAuth();
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const pendingCount = usePendingReviewCount();

  const [testDate, setTestDate] = useState<Date>(new Date());
  const testDateIso = useMemo(() => toIsoDate(testDate), [testDate]);
  const [handoutMap, setHandoutMap] = useState<Record<string, HandoutResult>>({});
  const inputRefs = useRef<Map<string, HTMLInputElement | null>>(new Map());
  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null);
  const [upcoming, setUpcoming] = useState<UpcomingAssignment[]>([]);

  const studentNameMap = useMemo(() => {
    const m = new Map<string, string>();
    students.forEach((s) => m.set(s.user_id, s.display_name ?? s.student_no));
    return m;
  }, [students]);

  useEffect(() => {
    const inSevenDays = new Date(Date.now() + 7 * 24 * 3_600_000).toISOString();
    supabase
      .from("assignments")
      .select("id, title, due_at, sentence_id, student_id, include_pre, include_analysis, include_translation, include_wordtest")
      .gte("due_at", new Date().toISOString())
      .lte("due_at", inSevenDays)
      .order("due_at", { ascending: true })
      .limit(5)
      .then(({ data }) => setUpcoming((data ?? []) as UpcomingAssignment[]));
  }, []);

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
    fetchHandoutResultsByDate(testDateIso)
      .then(setHandoutMap)
      .catch(() => setHandoutMap({}));
  }, [testDateIso]);

  const filledCount = useMemo(
    () =>
      Object.values(handoutMap).filter(
        (r) => r.word_ho_score != null || r.syntax_ho_result != null,
      ).length,
    [handoutMap],
  );

  const handleHandoutSaved = (row: HandoutResult) => {
    setHandoutMap((prev) => ({ ...prev, [row.user_id]: row }));
  };

  const registerInput = (userId: string, el: HTMLInputElement | null) => {
    if (el) inputRefs.current.set(userId, el);
    else inputRefs.current.delete(userId);
  };

  const focusNext = (currentUserId: string) => {
    const ids = students.map((s) => s.user_id);
    const idx = ids.indexOf(currentUserId);
    for (let i = idx + 1; i < ids.length; i++) {
      const el = inputRefs.current.get(ids[i]);
      if (el) {
        el.focus();
        el.select();
        return;
      }
    }
  };

  return (
    <TeacherLayout>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold">대시보드</h1>
          <p className="text-sm text-muted-foreground mt-1">
            오늘의 핸드아웃 점수를 입력하거나 좌측 메뉴에서 교재·학습관리를 선택하세요.
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

        {/* 마감 임박 특별과제 */}
        <Card className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ClipboardList className="size-4 text-amber-600" />
              <h2 className="text-sm font-bold">마감 임박 특별과제</h2>
              <span className="text-xs text-muted-foreground">(향후 7일)</span>
            </div>
            <Link
              to="/teacher/assignments"
              className="text-xs text-primary hover:underline"
            >
              전체 보기 →
            </Link>
          </div>
          {upcoming.length === 0 ? (
            <div className="text-xs text-muted-foreground py-3">
              예정된 과제 없음 — 새 과제는 '특별과제'에서 만드세요.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {upcoming.map((a) => {
                const dueMs = new Date(a.due_at).getTime() - Date.now();
                const totalH = Math.max(0, Math.floor(dueMs / 3_600_000));
                const days = Math.floor(totalH / 24);
                const hours = totalH % 24;
                const urgent = dueMs < 24 * 3_600_000;
                const remainText = days > 0 ? `${days}일 ${hours}시간` : `${hours}시간`;
                const target = a.student_id
                  ? studentNameMap.get(a.student_id) ?? "—"
                  : "전체 학생";
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
                      />
                    </div>
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

        {/* Handout input */}
        <div className="space-y-3">
          <div>
            <h2 className="text-lg font-bold">오늘의 핸드아웃 성적 입력</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              단어HO 점수와 구문HO P/F를 입력하면 자동 저장됩니다. Enter 키로 다음 학생 칸으로 이동합니다.
            </p>
          </div>

          <SessionDateBar
            date={testDate}
            onDateChange={setTestDate}
            studentCount={students.length}
            filledCount={filledCount}
          />

          {loading ? (
            <Card className="p-8 text-sm text-muted-foreground text-center">
              불러오는 중…
            </Card>
          ) : students.length === 0 ? (
            <Card className="p-8 text-sm text-muted-foreground text-center">
              등록된 학생이 없습니다.
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {students.map((s) => {
                const isExpanded = expandedStudentId === s.user_id;
                const row = handoutMap[s.user_id] ?? null;
                const filled =
                  row?.word_ho_score != null || row?.syntax_ho_result != null;
                return (
                  <Card
                    key={s.user_id}
                    className={`p-4 shadow-sm rounded-xl border transition-colors bg-card ${
                      filled ? "border-primary/30" : "border-border"
                    }`}
                  >
                    {/* Header: 학번 · 이름 · 진행 */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="font-mono text-xs text-muted-foreground">
                            {s.student_no}
                          </span>
                          <span className="font-bold text-sm truncate">
                            {s.display_name ?? "-"}
                          </span>
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          {LEVEL_LABEL[s.current_level]} · {s.current_no}번
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-[11px] text-muted-foreground hover:text-primary"
                        onClick={() =>
                          setExpandedStudentId(isExpanded ? null : s.user_id)
                        }
                      >
                        <ChevronDown
                          className={`size-3.5 transition-transform mr-1 ${
                            isExpanded ? "rotate-180" : ""
                          }`}
                        />
                        이력
                      </Button>
                    </div>

                    {/* 입력: 단어 HO / 구문 HO */}
                    <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border/60">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground uppercase tracking-wide">
                          <BookOpen className="size-3.5 text-primary" />
                          단어 HO
                          <span className="text-[9px] font-normal text-muted-foreground/70 normal-case tracking-normal">
                            ≥80
                          </span>
                        </div>
                        <WordHoInput
                          userId={s.user_id}
                          teacherId={user?.id ?? null}
                          testDate={testDateIso}
                          current={row}
                          onSaved={handleHandoutSaved}
                          onEnterNext={() => focusNext(s.user_id)}
                          registerInput={registerInput}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground uppercase tracking-wide">
                          <PenLine className="size-3.5 text-primary" />
                          구문 HO
                          <span className="text-[9px] font-normal text-muted-foreground/70 normal-case tracking-normal">
                            P/F
                          </span>
                        </div>
                        <SyntaxHoToggle
                          userId={s.user_id}
                          teacherId={user?.id ?? null}
                          testDate={testDateIso}
                          current={row}
                          onSaved={handleHandoutSaved}
                        />
                      </div>
                    </div>

                    {/* 펼친 이력 */}
                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-border/60">
                        <DailyTestSummary userId={s.user_id} days={14} />
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </TeacherLayout>
  );
};

export default TeacherHome;

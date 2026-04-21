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
} from "lucide-react";
import { LEVEL_LABEL } from "@/lib/levels";
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

const TILES = [
  { to: "/teacher/requests", title: "정답 대조 요청", desc: "학생 자기첨삭 승인", icon: ClipboardCheck, badgeKey: "pending" as const },
  { to: "/teacher/bookshelf", title: "책장", desc: "레벨별 교재 관리", icon: BookOpen },
  { to: "/teacher/students", title: "학생 목록", desc: "학생 진행/권한 관리", icon: Users },
  { to: "/teacher/assignments", title: "교재 부여", desc: "학생에게 교재 배정", icon: ClipboardList },
  { to: "/teacher/print-queue", title: "인쇄 대기열", desc: "시험지 승인·출력", icon: Printer },
  { to: "/teacher/retests", title: "재시험 관리", desc: "단어 테스트 재시도", icon: RefreshCcw },
];

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

          <Card className="p-4">
            {loading ? (
              <div className="text-sm text-muted-foreground py-8 text-center">불러오는 중…</div>
            ) : students.length === 0 ? (
              <div className="text-sm text-muted-foreground py-8 text-center">
                등록된 학생이 없습니다.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="py-2 pr-3">학번</th>
                      <th className="py-2 pr-3">이름</th>
                      <th className="py-2 pr-3">현재 진행</th>
                      <th className="py-2 pr-3">
                        단어HO <span className="text-[10px] text-muted-foreground/70">(≥80)</span>
                      </th>
                      <th className="py-2 pr-3">
                        구문HO <span className="text-[10px] text-muted-foreground/70">(P/F)</span>
                      </th>
                      <th className="py-2 pr-3 text-right">종합점수</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((s) => {
                      const isExpanded = expandedStudentId === s.user_id;
                      return (
                        <>
                          <tr key={s.user_id} className="border-b border-border/50">
                            <td className="py-2 pr-3 font-mono">{s.student_no}</td>
                            <td className="py-2 pr-3">{s.display_name ?? "-"}</td>
                            <td className="py-2 pr-3 text-muted-foreground">
                              {LEVEL_LABEL[s.current_level]} · {s.current_no}번
                            </td>
                            <td className="py-2 pr-3">
                              <WordHoInput
                                userId={s.user_id}
                                teacherId={user?.id ?? null}
                                testDate={testDateIso}
                                current={handoutMap[s.user_id] ?? null}
                                onSaved={handleHandoutSaved}
                                onEnterNext={() => focusNext(s.user_id)}
                                registerInput={registerInput}
                              />
                            </td>
                            <td className="py-2 pr-3">
                              <SyntaxHoToggle
                                userId={s.user_id}
                                teacherId={user?.id ?? null}
                                testDate={testDateIso}
                                current={handoutMap[s.user_id] ?? null}
                                onSaved={handleHandoutSaved}
                              />
                            </td>
                            <td className="py-2 pr-3 text-right">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setExpandedStudentId(isExpanded ? null : s.user_id)}
                              >
                                <ChevronDown className={`size-4 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                                보기
                              </Button>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr className="border-b border-border/50 bg-muted/20">
                              <td colSpan={6} className="py-4 pr-3">
                                <DailyTestSummary userId={s.user_id} days={14} />
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>
    </TeacherLayout>
  );
};

export default TeacherHome;

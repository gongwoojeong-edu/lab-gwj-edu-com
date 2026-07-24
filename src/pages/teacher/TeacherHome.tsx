import React, { useEffect, useMemo, useRef, useState } from "react";
import { TeacherLayout } from "@/components/teacher/TeacherLayout";
import { Card } from "@/components/ui/card";
import { Link } from "react-router-dom";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Users,
  Printer,
  RefreshCcw,
  ClipboardList,
  ClipboardCheck,
  Clock,
  Settings2,
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
  ensureHandoutRow,
  toIsoDate,
  type HandoutResult,
} from "@/lib/handoutResults";
import { usePendingReviewCount } from "@/hooks/usePendingReviewCount";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Plus } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import DailyTestSummary from "@/components/teacher/DailyTestSummary";
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
import { AlertTriangle } from "lucide-react";

const TILES = [
  { to: "/teacher/requests", title: "선생님분석본보기요청", desc: "학생 자기첨삭 승인", icon: ClipboardCheck, badgeKey: "pending" as const },
  { to: "/teacher/bookshelf", title: "책장", desc: "레벨별 교재 관리", icon: BookOpen },
  { to: "/teacher/roster", title: "학생목록", desc: "재원생·선생님 계정 (Orbit)", icon: Users },
  { to: "/teacher/students", title: "학습 설정", desc: "통과기준·PIN·시작 레벨", icon: Settings2 },
  { to: "/teacher/assignments", title: "과제출제", desc: "학생에게 과제 출제", icon: ClipboardList },
  { to: "/teacher/print-queue", title: "인쇄 대기열", desc: "시험지 승인·출력", icon: Printer },
  { to: "/teacher/results", title: "학습결과", desc: "오늘 학습 결과·HO 입력", icon: RefreshCcw },
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
  const [addOpen, setAddOpen] = useState(false);
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
      if (mounted) {
        setStudents(s);
        setLoading(false);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  // 마감 임박 과제별 진척 (hover용)
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

  // 정체 학생 로딩
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

  // Realtime: 학생이 진척하거나 단어테스트 결과를 저장하면 진척/정체 데이터 재조회
  useEffect(() => {
    const sentenceIds = upcoming.map((a) => a.sentence_id).filter(Boolean) as string[];
    if (sentenceIds.length === 0) return;
    const channel = supabase
      .channel("teacher-home-progress")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sentence_progress" },
        (payload) => {
          const sid = (payload.new as { sentence_id?: string })?.sentence_id
            ?? (payload.old as { sentence_id?: string })?.sentence_id;
          if (sid && sentenceIds.includes(sid)) {
            setProgressTick((t) => t + 1);
          } else {
            // 정체 학생 목록은 다른 sentence에서도 변할 수 있으므로 살짝 갱신
            setProgressTick((t) => t + 1);
          }
        },
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

  const [printedTodayUserIds, setPrintedTodayUserIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchHandoutResultsByDate(testDateIso)
      .then(setHandoutMap)
      .catch(() => setHandoutMap({}));
    // 오늘 인쇄 완료된 학생 user_id 집계
    const startIso = `${testDateIso}T00:00:00`;
    const endIso = `${testDateIso}T23:59:59`;
    supabase
      .from("print_requests")
      .select("user_id")
      .eq("status", "printed")
      .gte("handled_at", startIso)
      .lte("handled_at", endIso)
      .then(({ data }) => {
        setPrintedTodayUserIds(new Set((data ?? []).map((r) => r.user_id as string)));
      });
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

  const visibleStudents = useMemo(
    () => students.filter((s) => handoutMap[s.user_id] != null),
    [students, handoutMap],
  );

  const missingStudents = useMemo(
    () => students.filter((s) => handoutMap[s.user_id] == null),
    [students, handoutMap],
  );

  const handleAddStudent = async (userId: string) => {
    try {
      const row = await ensureHandoutRow(userId, user?.id ?? null, testDateIso);
      setHandoutMap((prev) => ({ ...prev, [userId]: row }));
      setAddOpen(false);
      toast({ title: "성적 입력 행 추가됨" });
    } catch (e) {
      toast({ title: "추가 실패", description: String(e), variant: "destructive" });
    }
  };

  const focusNext = (currentUserId: string) => {
    const ids = visibleStudents.map((s) => s.user_id);
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

        {/* 마감 임박 특별과제 */}
        <Card className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ClipboardList className="size-4 text-amber-600" />
              <h2 className="text-sm font-bold">마감 임박 특별과제</h2>
              <span className="text-xs text-muted-foreground">(향후 7일 · 무기한 포함)</span>
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
                to="/teacher/assignments"
                className="text-xs text-primary hover:underline"
              >
                전체 보기 →
              </Link>
            </div>
          </div>
          {upcoming.length === 0 ? (
            <div className="text-xs text-muted-foreground py-3">
              표시할 과제 없음 — <Link to="/teacher/assignments" className="text-primary hover:underline">특별과제</Link> 메뉴에서 전체 목록을 확인하세요.
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

                // ===== 학습완료 집계 =====
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

        {/* Handout input */}
        <div className="space-y-3">
          <div className="flex items-end justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-lg font-bold">오늘의 핸드아웃 성적 입력</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                인쇄 대기열에서 PDF를 열면 자동으로 학생이 추가됩니다. Enter로 다음 학생 칸으로 이동합니다.
              </p>
            </div>
            <Popover open={addOpen} onOpenChange={setAddOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" disabled={missingStudents.length === 0}>
                  <Plus className="size-4 mr-1" />
                  학생 추가
                </Button>
              </PopoverTrigger>
              <PopoverContent className="p-0 w-72" align="end">
                <Command>
                  <CommandInput placeholder="학생 검색…" />
                  <CommandList>
                    <CommandEmpty>해당 학생 없음</CommandEmpty>
                    <CommandGroup>
                      {missingStudents.map((s) => (
                        <CommandItem
                          key={s.user_id}
                          value={`${s.student_no} ${s.display_name ?? ""}`}
                          onSelect={() => handleAddStudent(s.user_id)}
                        >
                          <span className="font-mono text-xs text-muted-foreground mr-2">
                            {s.student_no}
                          </span>
                          <span>{s.display_name ?? "-"}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <SessionDateBar
            date={testDate}
            onDateChange={setTestDate}
            studentCount={visibleStudents.length}
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
          ) : visibleStudents.length === 0 ? (
            <Card className="p-8 text-sm text-muted-foreground text-center space-y-2">
              <div>오늘 인쇄된 핸드아웃이 없습니다.</div>
              <div className="text-xs">
                인쇄 대기열에서 PDF를 열거나, 위의 <strong>학생 추가</strong> 버튼으로 즉석 채점할 학생을 선택하세요.
              </div>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium w-10"></th>
                    <th className="text-left px-3 py-2 font-medium">학번</th>
                    <th className="text-left px-3 py-2 font-medium">이름</th>
                    <th className="text-left px-3 py-2 font-medium">진행</th>
                    <th className="text-left px-3 py-2 font-medium">단어 HO (≥80)</th>
                    <th className="text-left px-3 py-2 font-medium">구문 HO (P/F)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {visibleStudents.map((s) => {
                    const isExpanded = expandedStudentId === s.user_id;
                    const row = handoutMap[s.user_id] ?? null;
                    return (
                      <React.Fragment key={s.user_id}>
                        <tr className="hover:bg-muted/20">
                          <td className="px-2 py-2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() =>
                                setExpandedStudentId(isExpanded ? null : s.user_id)
                              }
                              aria-label="이력 펼치기"
                            >
                              {isExpanded ? (
                                <ChevronDown className="size-4" />
                              ) : (
                                <ChevronRight className="size-4" />
                              )}
                            </Button>
                          </td>
                          <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                            {s.student_no}
                          </td>
                          <td className="px-3 py-2 font-medium">
                            <span className="inline-flex items-center gap-1.5">
                              {s.display_name ?? "-"}
                              {printedTodayUserIds.has(s.user_id) && (
                                <Printer
                                  className="size-3.5 text-primary"
                                  aria-label="오늘 인쇄 완료"
                                />
                              )}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">
                            {LEVEL_LABEL[s.current_level]} · {s.current_no}번
                          </td>
                          <td className="px-3 py-2">
                            <WordHoInput
                              userId={s.user_id}
                              teacherId={user?.id ?? null}
                              testDate={testDateIso}
                              current={row}
                              onSaved={handleHandoutSaved}
                              onEnterNext={() => focusNext(s.user_id)}
                              registerInput={registerInput}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <SyntaxHoToggle
                              userId={s.user_id}
                              teacherId={user?.id ?? null}
                              testDate={testDateIso}
                              current={row}
                              onSaved={handleHandoutSaved}
                            />
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="bg-muted/10">
                            <td colSpan={6} className="px-3 py-3">
                              <DailyTestSummary userId={s.user_id} days={14} />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      </div>
    </TeacherLayout>
  );
};

export default TeacherHome;

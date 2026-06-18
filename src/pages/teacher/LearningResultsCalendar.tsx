// ============================================================
// LearningResultsCalendar — 학생별 월간 학습결과 달력
// 라우트: /teacher/results-calendar
// ============================================================
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { TeacherLayout } from "@/components/teacher/TeacherLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, User, FileText, Languages, Pencil, BookOpen, Loader2, ExternalLink, PencilLine } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { hasMasterForSentence } from "@/lib/masterAvailability";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { GRADE_LABEL, GRADE_BADGE_CLASS, type ApprovalGrade } from "@/lib/sentenceApprovals";
import { PostHocGradeDialog } from "@/components/teacher/PostHocGradeDialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";


interface StudentRow {
  user_id: string;
  display_name: string | null;
  student_no: string;
  className?: string | null;
}

type EventKind = "analysis" | "translation" | "word_pre" | "word_test" | "handout";

interface CalEvent {
  id: string;
  kind: EventKind;
  ts: string;            // ISO timestamp (또는 date 00:00)
  sentence_id?: string | null;
  label: string;         // 짧은 라벨 (e.g. "PSS 2-4 분석")
  meta: string;          // 정답률/점수 텍스트
  payload: any;          // 상세 다이얼로그용 원자료
}

const KIND_META: Record<EventKind, { icon: any; bg: string; text: string; ko: string }> = {
  analysis:     { icon: FileText,  bg: "bg-blue-50 hover:bg-blue-100 border-blue-200",       text: "text-blue-700",   ko: "분석" },
  translation:  { icon: Languages, bg: "bg-emerald-50 hover:bg-emerald-100 border-emerald-200", text: "text-emerald-700", ko: "해석" },
  word_pre:     { icon: BookOpen,  bg: "bg-amber-50 hover:bg-amber-100 border-amber-200",    text: "text-amber-700",  ko: "단어사전" },
  word_test:    { icon: Pencil,    bg: "bg-violet-50 hover:bg-violet-100 border-violet-200", text: "text-violet-700", ko: "단어시험" },
  handout:      { icon: FileText,  bg: "bg-rose-50 hover:bg-rose-100 border-rose-200",       text: "text-rose-700",   ko: "인쇄채점" },
};

const EventItem = ({
  event,
  gradeBySid,
  onClick,
}: {
  event: CalEvent;
  gradeBySid: Record<string, { grade: ApprovalGrade | null; memo: string | null }>;
  onClick: (e: CalEvent) => void;
}) => {
  const M = KIND_META[event.kind];
  const Icon = M.icon;
  const g = event.sentence_id ? gradeBySid[event.sentence_id] : null;
  const showGrade = g?.grade && (event.kind === "analysis" || event.kind === "translation");
  return (
    <button
      onClick={() => onClick(event)}
      className={cn(
        "w-full text-left rounded border px-1 py-0.5 leading-tight transition-colors",
        M.bg,
      )}
      title={`${KIND_META[event.kind].ko} · ${event.label}${showGrade ? ` · ${GRADE_LABEL[g!.grade!]}` : ""}`}
    >
      <div className={cn("flex items-center gap-0.5 font-medium truncate", M.text)}>
        <Icon className="size-3 shrink-0" />
        <span className="truncate">{fmtHM(event.ts)} {event.label}</span>
        {showGrade && (
          <span
            className={cn(
              "ml-auto shrink-0 px-1 rounded text-[9px] font-bold",
              GRADE_BADGE_CLASS[g!.grade!],
            )}
          >
            {GRADE_LABEL[g!.grade!]}
          </span>
        )}
      </div>
      <div className="text-[10px] text-muted-foreground truncate">{event.meta}</div>
    </button>
  );
};

const pad2 = (n: number) => String(n).padStart(2, "0");
const fmtHM = (iso: string) => {
  const d = new Date(iso);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};
const toDateKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

// 짧은 라벨: "L03-S1V6U62-001" → "V6U62-001"
const shortSid = (sid?: string | null) => {
  if (!sid) return "";
  const m = sid.match(/^L\d+-S\d+(V\d+U\d+-\d+)$/);
  return m ? m[1] : sid;
};

// ===== 캘린더 빌더 =====
function buildMonthCells(year: number, month1to12: number): { day: number | null; key: string }[] {
  const first = new Date(year, month1to12 - 1, 1);
  const startDow = first.getDay(); // 0=Sun
  const daysInMonth = new Date(year, month1to12, 0).getDate();
  const cells: { day: number | null; key: string }[] = [];
  for (let i = 0; i < startDow; i++) cells.push({ day: null, key: `pad-${i}` });
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${year}-${pad2(month1to12)}-${pad2(d)}`;
    cells.push({ day: d, key });
  }
  // 6주 채우기
  while (cells.length % 7 !== 0) cells.push({ day: null, key: `pad-end-${cells.length}` });
  while (cells.length < 42) cells.push({ day: null, key: `pad-end-${cells.length}` });
  return cells;
}

const LearningResultsCalendar = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const now = new Date();
  const [year, setYear] = useState<number>(() => Number(searchParams.get("year")) || now.getFullYear());
  const [month, setMonth] = useState<number>(() => Number(searchParams.get("month")) || now.getMonth() + 1);
  const [selectedStudent, setSelectedStudent] = useState<string | null>(searchParams.get("student"));
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [eventsByDate, setEventsByDate] = useState<Record<string, CalEvent[]>>({});
  const [gradeBySid, setGradeBySid] = useState<Record<string, { grade: ApprovalGrade | null; memo: string | null }>>({});
  const [studentCounts, setStudentCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [openEvent, setOpenEvent] = useState<CalEvent | null>(null);

  // URL 동기화
  useEffect(() => {
    const sp = new URLSearchParams();
    sp.set("year", String(year));
    sp.set("month", String(month));
    if (selectedStudent) sp.set("student", selectedStudent);
    setSearchParams(sp, { replace: true });
  }, [year, month, selectedStudent, setSearchParams]);

  // 학생 목록 로드
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("student_profiles")
          .select("user_id, display_name, student_no, current_level")
          .order("display_name", { ascending: true });
        if (error) throw error;
        const rows = (data ?? []).map((r: any) => ({
          user_id: r.user_id,
          display_name: r.display_name,
          student_no: r.student_no,
          className: r.current_level ?? null,
        })) as StudentRow[];
        setStudents(rows);
        if (!selectedStudent && rows.length > 0) {
          setSelectedStudent(rows[0].user_id);
        }
      } catch (e: any) {
        toast({ title: "학생 목록 불러오기 실패", description: e?.message ?? "", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 학생별 이번달 총 건수 (사이드 카운트)
  useEffect(() => {
    if (students.length === 0) return;
    (async () => {
      const monthStart = `${year}-${pad2(month)}-01T00:00:00`;
      const next = new Date(year, month, 1);
      const monthEnd = `${next.getFullYear()}-${pad2(next.getMonth() + 1)}-01T00:00:00`;
      const counts: Record<string, number> = {};
      // 가벼운 카운트: sentence_attempt_logs + sentence_translations + word_test_results + word_pre_results + handout_results
      const [sal, st, wtr, wpr, hr] = await Promise.all([
        supabase.from("sentence_attempt_logs").select("user_id", { count: "exact" }).gte("completed_at", monthStart).lt("completed_at", monthEnd),
        supabase.from("sentence_translations").select("user_id").gte("submitted_at", monthStart).lt("submitted_at", monthEnd),
        supabase.from("word_test_results").select("user_id").gte("taken_at", monthStart).lt("taken_at", monthEnd),
        supabase.from("word_pre_results").select("user_id").gte("taken_at", monthStart).lt("taken_at", monthEnd),
        supabase.from("handout_results").select("user_id").gte("test_date", `${year}-${pad2(month)}-01`).lt("test_date", `${next.getFullYear()}-${pad2(next.getMonth() + 1)}-01`),
      ]);
      const tally = (rows: any[]) => rows.forEach((r) => { counts[r.user_id] = (counts[r.user_id] ?? 0) + 1; });
      tally((sal.data as any[]) ?? []);
      tally((st.data as any[]) ?? []);
      tally((wtr.data as any[]) ?? []);
      tally((wpr.data as any[]) ?? []);
      tally((hr.data as any[]) ?? []);
      setStudentCounts(counts);
    })();
  }, [students, year, month]);

  // 선택 학생의 이번달 이벤트 로드
  useEffect(() => {
    if (!selectedStudent) {
      setEventsByDate({});
      return;
    }
    (async () => {
      setLoadingEvents(true);
      try {
        const monthStart = `${year}-${pad2(month)}-01T00:00:00`;
        const next = new Date(year, month, 1);
        const monthEnd = `${next.getFullYear()}-${pad2(next.getMonth() + 1)}-01T00:00:00`;
        const dateStart = `${year}-${pad2(month)}-01`;
        const dateEnd = `${next.getFullYear()}-${pad2(next.getMonth() + 1)}-01`;

        const [salR, stR, wtrR, wprR, hrR] = await Promise.all([
          supabase
            .from("sentence_attempt_logs")
            .select("id, sentence_id, attempt_no, analysis_match_rate, analysis_passed, word_test_score, word_test_passed, owner_diff, translation_text, completed_at, attempt_source")
            .eq("user_id", selectedStudent)
            .gte("completed_at", monthStart)
            .lt("completed_at", monthEnd)
            .order("completed_at", { ascending: true }),
          supabase
            .from("sentence_translations")
            .select("id, sentence_id, text, submitted_at")
            .eq("user_id", selectedStudent)
            .gte("submitted_at", monthStart)
            .lt("submitted_at", monthEnd),
          supabase
            .from("word_test_results")
            .select("id, sentence_id, items, score, passed, taken_at, mode, attempt_no, wrong_words")
            .eq("user_id", selectedStudent)
            .gte("taken_at", monthStart)
            .lt("taken_at", monthEnd),
          supabase
            .from("word_pre_results")
            .select("id, sentence_id, known_words, unknown_words, taken_at")
            .eq("user_id", selectedStudent)
            .gte("taken_at", monthStart)
            .lt("taken_at", monthEnd),
          supabase
            .from("handout_results")
            .select("id, sentence_id, test_date, session_no, word_ho_score, syntax_ho_result, is_integrated, created_at")
            .eq("user_id", selectedStudent)
            .gte("test_date", dateStart)
            .lt("test_date", dateEnd),
        ]);

        // sentence_progress 의 마지막 등급/메모 (선생님 승인 결과) — 본 학생 전체 한 번에 가져오기
        const { data: progRows } = await supabase
          .from("sentence_progress")
          .select("sentence_id, last_grade, last_memo")
          .eq("user_id", selectedStudent);
        const gradeMap: Record<string, { grade: ApprovalGrade | null; memo: string | null }> = {};
        ((progRows as any[]) ?? []).forEach((r) => {
          if (r.last_grade || r.last_memo) {
            gradeMap[r.sentence_id] = {
              grade: (r.last_grade as ApprovalGrade) ?? null,
              memo: r.last_memo ?? null,
            };
          }
        });
        setGradeBySid(gradeMap);


        const grouped: Record<string, CalEvent[]> = {};
        const push = (e: CalEvent) => {
          const k = toDateKey(e.ts);
          (grouped[k] ||= []).push(e);
        };

        ((salR.data as any[]) ?? []).forEach((r) => {
          const hasAnalysis = r.analysis_match_rate != null && (r.analysis_match_rate > 0 || Array.isArray(r.owner_diff));
          // 분석 이벤트 (owner_diff가 있거나 analysis_passed 등이 의미있을 때)
          push({
            id: `sal-${r.id}`,
            kind: "analysis",
            ts: r.completed_at,
            sentence_id: r.sentence_id,
            label: `${shortSid(r.sentence_id)} 분석`,
            meta: `정답 ${Math.round(Number(r.analysis_match_rate || 0) * 100)}%${r.analysis_passed ? " ✓" : ""}`,
            payload: r,
          });
        });

        ((stR.data as any[]) ?? []).forEach((r) => {
          push({
            id: `st-${r.id}`,
            kind: "translation",
            ts: r.submitted_at,
            sentence_id: r.sentence_id,
            label: `${shortSid(r.sentence_id)} 해석`,
            meta: `${(r.text || "").length}자`,
            payload: r,
          });
        });

        ((wtrR.data as any[]) ?? []).forEach((r) => {
          push({
            id: `wtr-${r.id}`,
            kind: "word_test",
            ts: r.taken_at,
            sentence_id: r.sentence_id,
            label: `${shortSid(r.sentence_id)} 단어시험`,
            meta: `${Math.round(Number(r.score || 0) * 100)}%${r.passed ? " ✓" : ""}`,
            payload: r,
          });
        });

        ((wprR.data as any[]) ?? []).forEach((r) => {
          const k = (r.known_words || []).length;
          const u = (r.unknown_words || []).length;
          push({
            id: `wpr-${r.id}`,
            kind: "word_pre",
            ts: r.taken_at,
            sentence_id: r.sentence_id,
            label: `${shortSid(r.sentence_id)} 단어사전`,
            meta: `앎 ${k} · 모름 ${u}`,
            payload: r,
          });
        });

        ((hrR.data as any[]) ?? []).forEach((r) => {
          // handout: test_date만 있으므로 created_at을 ts로 사용
          push({
            id: `hr-${r.id}`,
            kind: "handout",
            ts: r.created_at ?? `${r.test_date}T00:00:00`,
            sentence_id: r.sentence_id,
            label: `${shortSid(r.sentence_id) || "통합"} 인쇄채점`,
            meta: `단어 ${r.word_ho_score != null ? `${r.word_ho_score}점` : "-"} · 구문 ${r.syntax_ho_result ?? "-"}`,
            payload: r,
          });
        });

        // 시간순 정렬
        Object.keys(grouped).forEach((k) =>
          grouped[k].sort((a, b) => a.ts.localeCompare(b.ts)),
        );
        setEventsByDate(grouped);
      } catch (e: any) {
        toast({ title: "이벤트 로드 실패", description: e?.message ?? "", variant: "destructive" });
      } finally {
        setLoadingEvents(false);
      }
    })();
  }, [selectedStudent, year, month]);

  const cells = useMemo(() => buildMonthCells(year, month), [year, month]);
  const totalEventCount = useMemo(
    () => Object.values(eventsByDate).reduce((a, arr) => a + arr.length, 0),
    [eventsByDate],
  );
  const selStudent = students.find((s) => s.user_id === selectedStudent) ?? null;

  const goPrevMonth = () => {
    if (month === 1) { setYear(year - 1); setMonth(12); } else { setMonth(month - 1); }
  };
  const goNextMonth = () => {
    if (month === 12) { setYear(year + 1); setMonth(1); } else { setMonth(month + 1); }
  };

  return (
    <TeacherLayout>
      <div className="p-4 max-w-[1500px] mx-auto">
        <div className="mb-4">
          <h1 className="text-2xl font-bold flex items-center gap-2">📅 학습결과 (월간)</h1>
          <p className="text-sm text-muted-foreground mt-1">
            학생별 <b>월간 달력</b>으로 당일·날짜별 학습 이력을 확인합니다. 항목 <b>클릭</b> 시 문항별 정·오 팝업.
          </p>
        </div>

        <div className="flex gap-4">
          {/* 학생 사이드바 */}
          <aside className="w-[240px] shrink-0">
            <Card className="p-2">
              <div className="flex items-center gap-2 px-2 py-1.5 text-sm font-semibold border-b mb-1">
                <User className="size-4" /> 학생
              </div>
              <div className="max-h-[calc(100vh-220px)] overflow-y-auto">
                {loading && <div className="p-4 text-sm text-muted-foreground">불러오는 중...</div>}
                {!loading && students.map((s) => {
                  const active = s.user_id === selectedStudent;
                  const cnt = studentCounts[s.user_id] ?? 0;
                  return (
                    <button
                      key={s.user_id}
                      onClick={() => setSelectedStudent(s.user_id)}
                      className={cn(
                        "w-full text-left px-2 py-2 rounded-md text-sm transition-colors",
                        active ? "bg-primary/10 border border-primary/40" : "hover:bg-muted/60",
                      )}
                    >
                      <div className={cn("font-medium", active && "text-primary")}>{s.display_name || s.student_no}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {s.className ? `${s.className} · ` : ""}{cnt}건
                      </div>
                    </button>
                  );
                })}
                {!loading && students.length === 0 && (
                  <div className="p-4 text-sm text-muted-foreground">학생이 없습니다.</div>
                )}
              </div>
            </Card>
          </aside>

          {/* 달력 */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-center gap-4 mb-3">
              <Button variant="ghost" size="icon" onClick={goPrevMonth}><ChevronLeft /></Button>
              <div className="text-xl font-bold">{year}년 {month}월</div>
              <Button variant="ghost" size="icon" onClick={goNextMonth}><ChevronRight /></Button>
            </div>

            {selStudent && (
              <div className="text-sm text-muted-foreground mb-2">
                <b className="text-foreground">{selStudent.display_name || selStudent.student_no}</b>
                {" · 이번 달 학습 "}<b className="text-foreground">{totalEventCount}</b>건
                {loadingEvents && <Loader2 className="inline-block ml-2 size-3 animate-spin" />}
                {" · 달력 항목 클릭 시 상세 팝업"}
              </div>
            )}

            <Card className="p-2">
              <div className="grid grid-cols-7 text-center text-xs font-semibold border-b pb-1 mb-1">
                {["일", "월", "화", "수", "목", "금", "토"].map((d, i) => (
                  <div key={d} className={cn(i === 0 && "text-red-500", i === 6 && "text-blue-500")}>{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {cells.map((c) => {
                  const events = c.day ? (eventsByDate[c.key] ?? []) : [];
                  const isToday = c.day && c.key === toDateKey(new Date().toISOString());
                  const visible = events.slice(0, 3);
                  const hidden = events.slice(3);
                  return (
                    <div
                      key={c.key}
                      className={cn(
                        "h-[130px] border rounded-md p-1 text-xs flex flex-col",
                        c.day ? "bg-card" : "bg-muted/30 border-dashed",
                        isToday && "ring-2 ring-primary/60",
                      )}
                    >
                      {c.day && (
                        <>
                          <div className="text-[11px] font-semibold text-muted-foreground mb-0.5 px-0.5 shrink-0">{c.day}</div>
                          <div className="flex-1 overflow-hidden space-y-0.5 pr-0.5">
                            {visible.map((e) => (
                              <EventItem key={e.id} event={e} gradeBySid={gradeBySid} onClick={setOpenEvent} />
                            ))}
                          </div>
                          {hidden.length > 0 && (
                            <Popover>
                              <PopoverTrigger asChild>
                                <button className="w-full shrink-0 text-center text-[10px] font-medium text-primary hover:underline py-0.5">
                                  +{hidden.length}개 더 보기
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="w-72 p-2 space-y-1 max-h-[360px] overflow-y-auto" align="start">
                                <div className="text-[11px] font-semibold text-muted-foreground mb-1">
                                  {c.day}일 전체 이력 ({events.length}건)
                                </div>
                                {events.map((e) => (
                                  <EventItem key={e.id} event={e} gradeBySid={gradeBySid} onClick={setOpenEvent} />
                                ))}
                              </PopoverContent>
                            </Popover>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        </div>
      </div>

      <EventDetailDialog
        event={openEvent}
        studentId={selectedStudent}
        gradeInfo={openEvent?.sentence_id ? gradeBySid[openEvent.sentence_id] ?? null : null}
        onClose={() => setOpenEvent(null)}
        onGradeSaved={(sid, grade, memo) => {
          setGradeBySid((prev) => ({ ...prev, [sid]: { grade, memo } }));
        }}
      />
    </TeacherLayout>
  );
};

// ===== 상세 다이얼로그 =====
const EventDetailDialog = ({
  event,
  studentId,
  gradeInfo,
  onClose,
  onGradeSaved,
}: {
  event: CalEvent | null;
  studentId: string | null;
  gradeInfo: { grade: ApprovalGrade | null; memo: string | null } | null;
  onClose: () => void;
  onGradeSaved: (sentenceId: string, grade: ApprovalGrade, memo: string | null) => void;
}) => {
  const [gradeDialogOpen, setGradeDialogOpen] = useState(false);
  const [sentenceText, setSentenceText] = useState<string | null>(null);
  const sid = event?.sentence_id ?? null;
  useEffect(() => {
    if (!sid) { setSentenceText(null); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("user_sentences")
        .select("text")
        .eq("id", sid)
        .maybeSingle();
      if (!cancelled) setSentenceText(data?.text ?? null);
    })();
    return () => { cancelled = true; };
  }, [sid]);
  const open = !!event;
  if (!event) {
    return (
      <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
        <DialogContent />
      </Dialog>
    );
  }
  const M = KIND_META[event.kind];
  const p = event.payload || {};
  const hasKoreanText =
    event.kind === "analysis" ? !!p.translation_text :
    event.kind === "translation" ? !!p.text :
    false;
  const canGrade = !!(studentId && event.sentence_id && (event.kind === "analysis" || event.kind === "translation") && hasKoreanText);
  const showEnglish = !!(sentenceText && (event.kind === "analysis" || event.kind === "translation"));
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Badge variant="outline" className={cn(M.text)}>{M.ko}</Badge>
            <span>{event.label}</span>
            <span className="text-sm text-muted-foreground font-normal">
              · {new Date(event.ts).toLocaleString("ko-KR")}
            </span>
          </DialogTitle>
        </DialogHeader>

        {showEnglish && (
          <div className="p-3 rounded-md border bg-primary/5">
            <div className="text-[11px] text-muted-foreground mb-1">영문 원문</div>
            <div className="text-sm font-medium leading-relaxed whitespace-pre-wrap">{sentenceText}</div>
          </div>
        )}


        {gradeInfo?.grade ? (
          <div className="flex items-start gap-2 p-3 rounded-md border bg-card/60">
            <span className={cn("px-2 py-0.5 rounded text-xs font-bold shrink-0", GRADE_BADGE_CLASS[gradeInfo.grade])}>
              {GRADE_LABEL[gradeInfo.grade]}
            </span>
            <div className="text-sm flex-1">
              <div className="text-[11px] text-muted-foreground">선생님 평가 · 메모</div>
              <div className="whitespace-pre-wrap">{gradeInfo.memo || <span className="text-muted-foreground italic">메모 없음</span>}</div>
            </div>
            {canGrade && (
              <Button size="sm" variant="outline" onClick={() => setGradeDialogOpen(true)}>
                <PencilLine className="w-3.5 h-3.5 mr-1" /> 수정
              </Button>
            )}
          </div>
        ) : canGrade ? (
          <div className="flex items-center justify-between gap-2 p-3 rounded-md border border-dashed bg-muted/30">
            <div className="text-sm text-muted-foreground">아직 선생님 평가가 없습니다 (이미 통과된 문장).</div>
            <Button size="sm" variant="outline" onClick={() => setGradeDialogOpen(true)}>
              <PencilLine className="w-3.5 h-3.5 mr-1" /> 사후 평가 입력
            </Button>
          </div>
        ) : null}

        <DetailBody event={event} studentId={studentId} />

        {canGrade && (
          <PostHocGradeDialog
            open={gradeDialogOpen}
            onOpenChange={setGradeDialogOpen}
            studentUserId={studentId!}
            sentenceId={event.sentence_id!}
            initialGrade={gradeInfo?.grade ?? null}
            initialMemo={gradeInfo?.memo ?? null}
            onSaved={(g, m) => onGradeSaved(event.sentence_id!, g, m)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};

const DetailBody = ({ event, studentId }: { event: CalEvent; studentId: string | null }) => {
  const p = event.payload || {};
  const sid = event.sentence_id;

  if (event.kind === "analysis") {
    const rawDiff = Array.isArray(p.owner_diff) ? p.owner_diff : [];
    const noMasterAtLog = rawDiff.some((d: any) => d?.noMaster === true || d?.owner_id === "__no_master__");
    const teacherMark = rawDiff.find((d: any) => d?.teacherApproved === true || d?.owner_id === "__teacher_approved__");
    const diff = rawDiff.filter((d: any) => !d?.noMaster && d?.owner_id !== "__no_master__" && !d?.teacherApproved && d?.owner_id !== "__teacher_approved__");
    // 기록 시점에는 마스터가 없었더라도, 현재 마스터가 등록돼 있으면 안내 문구를 바꾼다.
    const [masterNow, setMasterNow] = useState<boolean | null>(null);
    useEffect(() => {
      let alive = true;
      if (noMasterAtLog && sid) {
        hasMasterForSentence(sid).then((ok) => { if (alive) setMasterNow(ok); });
      }
      return () => { alive = false; };
    }, [sid, noMasterAtLog]);
    const noMaster = noMasterAtLog && masterNow !== true;
    return (
      <div className="space-y-3 text-sm">
        {noMaster && (
          <div className="p-3 rounded border border-amber-300 bg-amber-50 text-amber-900 text-xs">
            ⚠️ 이 문장에는 <b>마스터 분석</b>이 등록되어 있지 않아 자동 채점이 불가능합니다. (정답률 0%는 실제 오답이 아니라 비교 대상 부재를 의미합니다)
          </div>
        )}
        {noMasterAtLog && masterNow === true && (
          <div className="p-3 rounded border border-sky-300 bg-sky-50 text-sky-900 text-xs">
            ℹ️ 이 기록 당시에는 <b>마스터 분석이 없어</b> 자동 채점이 불가능했습니다. 현재는 마스터키가 등록되어 있으므로, 학생이 <b>다시 시도</b>하면 정상 채점됩니다. (저장된 0%는 과거 시점 값)
          </div>
        )}
        <div className="flex gap-4 flex-wrap">
          {!noMaster && (
            <div><span className="text-muted-foreground">정답률:</span> <b>{Math.round(Number(p.analysis_match_rate || 0) * 100)}%</b></div>
          )}
          <div><span className="text-muted-foreground">시도:</span> {p.attempt_no}회 ({p.attempt_source})</div>
          <div><span className="text-muted-foreground">통과:</span> {p.analysis_passed ? "✓" : noMaster ? "마스터 없음" : "—"}</div>
          {teacherMark && <div className="text-emerald-700">✓ 선생님 승인됨</div>}
        </div>
        {p.translation_text && (
          <div>
            <div className="text-xs text-muted-foreground mb-1">학생 한글해석</div>
            <div className="p-2 rounded bg-muted whitespace-pre-wrap">{p.translation_text}</div>
          </div>
        )}
        {!noMaster && (
          <div>
            <div className="text-xs text-muted-foreground mb-1">owner_diff (학생 분석 결과)</div>
            {diff.length === 0 ? (
              <div className="text-muted-foreground italic">기록 없음</div>
            ) : (
              <pre className="p-2 rounded bg-muted text-xs overflow-auto max-h-[280px]">{JSON.stringify(diff, null, 2)}</pre>
            )}
          </div>
        )}
        {sid && studentId && (
          <div className="pt-2 border-t flex justify-end">
            <Button asChild size="sm">
              <Link to={`/teacher/compare/${sid}/${studentId}`} target="_blank">
                <ExternalLink className="size-4 mr-1" /> 분석 비교 화면 열기
              </Link>
            </Button>
          </div>
        )}
      </div>
    );
  }

  if (event.kind === "translation") {
    return (
      <div className="space-y-3 text-sm">
        <div className="text-xs text-muted-foreground">학생 제출 한글해석</div>
        <div className="p-3 rounded border bg-muted whitespace-pre-wrap">{p.text}</div>
      </div>
    );
  }

  if (event.kind === "word_test") {
    const items = Array.isArray(p.items) ? p.items : [];
    const total = items.length || 1;
    const correct = items.filter((it: any) => it.correct ?? it.passed ?? it.isCorrect ?? false).length;
    const wrong = items.length - correct;
    return (
      <div className="space-y-3 text-sm">
        <div className="flex gap-4 flex-wrap">
          <div><span className="text-muted-foreground">성취도:</span> <b>{Math.round(Number(p.score || 0) * 100)}%</b></div>
          <div><span className="text-muted-foreground">통과:</span> {p.passed ? "✓" : "—"}</div>
        </div>
        <div className="flex gap-4 flex-wrap text-xs text-muted-foreground">
          <div>맞은 단어: <b className="text-foreground">{correct}</b> / {total}</div>
          <div>틀린 단어: <b className="text-foreground">{wrong}</b></div>
        </div>
        {Array.isArray(p.wrong_words) && p.wrong_words.length > 0 && (
          <div>
            <div className="text-xs text-muted-foreground mb-1">틀린 단어</div>
            <div className="flex flex-wrap gap-1">
              {p.wrong_words.map((w: any, i: number) => (
                <Badge key={i} variant="destructive">{typeof w === "string" ? w : (w.en ?? w.word ?? JSON.stringify(w))}</Badge>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (event.kind === "word_pre") {
    return (
      <div className="space-y-3 text-sm">
        <div>
          <div className="text-xs text-muted-foreground mb-1">아는 단어 ({(p.known_words || []).length})</div>
          <div className="flex flex-wrap gap-1">
            {(p.known_words || []).map((w: string, i: number) => <Badge key={i} variant="secondary">{w}</Badge>)}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground mb-1">모르는 단어 ({(p.unknown_words || []).length})</div>
          <div className="flex flex-wrap gap-1">
            {(p.unknown_words || []).map((w: string, i: number) => <Badge key={i} variant="outline">{w}</Badge>)}
          </div>
        </div>
      </div>
    );
  }

  if (event.kind === "handout") {
    return (
      <div className="space-y-2 text-sm">
        <div><span className="text-muted-foreground">시험일:</span> {p.test_date}</div>
        <div><span className="text-muted-foreground">회차:</span> {p.session_no}</div>
        <div><span className="text-muted-foreground">단어 점수:</span> {p.word_ho_score ?? "—"}</div>
        <div><span className="text-muted-foreground">구문 결과:</span> {p.syntax_ho_result ?? "—"}</div>
        <div><span className="text-muted-foreground">통합 시험:</span> {p.is_integrated ? "Y" : "N"}</div>
      </div>
    );
  }

  return <div>알 수 없는 항목입니다.</div>;
};

export default LearningResultsCalendar;

import { TeacherLayout } from "@/components/teacher/TeacherLayout";
import { Card } from "@/components/ui/card";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronDown, ClipboardList } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllStudents, type StudentProfile } from "@/lib/studentProfile";
import { format } from "date-fns";
import AssignmentStepBadges from "@/components/teacher/AssignmentStepBadges";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  fetchAssignmentProgress,
  type AssignmentProgressMap,
} from "@/lib/assignmentProgress";

interface AssignmentRow {
  id: string;
  teacher_id: string;
  student_id: string | null;
  title: string;
  description: string | null;
  sentence_id: string | null;
  due_at: string;
  created_at: string;
  include_pre: boolean;
  include_analysis: boolean;
  include_translation: boolean;
  include_wordtest: boolean;
}

interface AttemptRow {
  user_id: string;
  sentence_id: string;
  status: "pending" | "pass" | "fail";
  updated_at: string;
}

const AssignmentsPast = () => {
  const [rows, setRows] = useState<AssignmentRow[]>([]);
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [progressBySentence, setProgressBySentence] = useState<Record<string, AttemptRow[]>>({});
  const [progressByAsg, setProgressByAsg] = useState<Record<string, AssignmentProgressMap>>({});
  const [expanded, setExpanded] = useState<string | null>(null);

  const studentNameMap = useMemo(() => {
    const m = new Map<string, string>();
    students.forEach((s) =>
      m.set(s.user_id, s.display_name ?? s.student_no ?? s.user_id.slice(0, 6)),
    );
    return m;
  }, [students]);

  useEffect(() => {
    void (async () => {
      const [studs, { data }] = await Promise.all([
        fetchAllStudents(),
        supabase
          .from("assignments")
          .select("*")
          .lt("due_at", new Date().toISOString())
          .order("due_at", { ascending: false }),
      ]);
      setStudents(studs);
      const list = (data ?? []) as AssignmentRow[];
      setRows(list);

      const sentenceIds = Array.from(
        new Set(list.map((r) => r.sentence_id).filter(Boolean) as string[]),
      );
      if (sentenceIds.length > 0) {
        const { data: progRows } = await supabase
          .from("sentence_progress")
          .select("user_id, sentence_id, status, updated_at")
          .in("sentence_id", sentenceIds);
        const map: Record<string, AttemptRow[]> = {};
        ((progRows ?? []) as AttemptRow[]).forEach((r) => {
          if (!map[r.sentence_id]) map[r.sentence_id] = [];
          map[r.sentence_id].push(r);
        });
        setProgressBySentence(map);
      }
    })();
  }, []);

  // 과제별 진척 데이터 로드 (hover용)
  useEffect(() => {
    if (rows.length === 0 || students.length === 0) return;
    const allIds = students.map((s) => s.user_id);
    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        rows
          .filter((r) => r.sentence_id)
          .map(async (r) => {
            const targets = r.student_id ? [r.student_id] : allIds;
            const m = await fetchAssignmentProgress(r.sentence_id!, targets);
            return [r.id, m] as const;
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
  }, [rows, students]);

  const studentName = (id: string | null | undefined) => {
    if (!id) return "—";
    const s = students.find((x) => x.user_id === id);
    return s?.display_name ?? s?.student_no ?? id.slice(0, 6);
  };

  const passInfo = (row: AssignmentRow) => {
    if (!row.sentence_id) return { passed: 0, total: 0 };
    const targetIds = row.student_id
      ? [row.student_id]
      : students.map((s) => s.user_id);
    const progRows = progressBySentence[row.sentence_id] ?? [];
    const passedSet = new Set(
      progRows.filter((p) => p.status === "pass").map((p) => p.user_id),
    );
    const passed = targetIds.filter((id) => passedSet.has(id)).length;
    return { passed, total: targetIds.length };
  };

  const sorted = useMemo(() => rows, [rows]);

  return (
    <TeacherLayout>
      <div className="p-6 max-w-4xl mx-auto space-y-6 font-kr">
        <div>
          <Link
            to="/teacher/assignments"
            className="inline-flex items-center gap-1 text-[11px] font-bold text-muted-foreground hover:text-primary transition-colors"
          >
            <ChevronLeft className="size-3.5" /> 활성 과제로
          </Link>
          <h1 className="text-2xl font-bold flex items-center gap-2 mt-1">
            <ClipboardList className="size-6 text-primary" /> 과거 과제함
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            마감일이 지난 과제와 학생별 통과 현황을 확인할 수 있어요.
          </p>
        </div>

        <Card className="p-5 space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-primary">
            마감 완료 과제 ({sorted.length})
          </h2>
          {sorted.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              아직 과거 과제가 없어요.
            </p>
          ) : (
            <div className="space-y-2">
              {sorted.map((r) => {
                const { passed, total } = passInfo(r);
                const isOpen = expanded === r.id;
                const targetIds = r.student_id
                  ? [r.student_id]
                  : students.map((s) => s.user_id);
                const progRows = r.sentence_id
                  ? progressBySentence[r.sentence_id] ?? []
                  : [];
                const byUser = new Map(progRows.map((p) => [p.user_id, p]));
                return (
                  <div
                    key={r.id}
                    className="rounded-lg border-2 border-border"
                  >
                    <button
                      type="button"
                      onClick={() => setExpanded(isOpen ? null : r.id)}
                      className="w-full p-3 flex items-start justify-between gap-3 text-left hover:bg-muted/40 transition-colors"
                    >
                      <div className="space-y-1.5 min-w-0 flex-1">
                        <div className="font-bold text-foreground">{r.title}</div>
                        <div className="text-xs text-muted-foreground flex flex-wrap gap-2">
                          <span>대상: {studentName(r.student_id) === "—" ? "전체 학생" : studentName(r.student_id)}</span>
                          <span>· 마감: {format(new Date(r.due_at), "yyyy-MM-dd HH:mm")}</span>
                          <span
                            className={cn(
                              "font-bold",
                              passed === total && total > 0
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-amber-600 dark:text-amber-400",
                            )}
                          >
                            · {passed} / {total}명 통과
                          </span>
                        </div>
                        <AssignmentStepBadges
                          includePre={r.include_pre}
                          includeAnalysis={r.include_analysis}
                          includeTranslation={r.include_translation}
                          includeWordtest={r.include_wordtest}
                        />
                      </div>
                      <ChevronDown
                        className={cn(
                          "size-4 text-muted-foreground transition-transform shrink-0",
                          isOpen && "rotate-180",
                        )}
                      />
                    </button>
                    {isOpen && (
                      <div className="border-t border-border p-3 bg-muted/20 space-y-1.5">
                        {targetIds.length === 0 ? (
                          <div className="text-xs text-muted-foreground">
                            대상 학생이 없어요.
                          </div>
                        ) : (
                          targetIds.map((uid) => {
                            const p = byUser.get(uid);
                            return (
                              <div
                                key={uid}
                                className="flex items-center justify-between gap-2 text-xs px-2 py-1.5 rounded bg-card border border-border/60"
                              >
                                <span className="font-semibold">{studentName(uid)}</span>
                                <span
                                  className={cn(
                                    "px-2 py-0.5 rounded-full font-extrabold",
                                    p?.status === "pass"
                                      ? "bg-emerald-500 text-white"
                                      : p?.status === "fail"
                                        ? "bg-amber-500 text-white"
                                        : "bg-muted text-muted-foreground",
                                  )}
                                >
                                  {p?.status === "pass"
                                    ? "PASS"
                                    : p?.status === "fail"
                                      ? "FAIL"
                                      : "미응시"}
                                </span>
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </TeacherLayout>
  );
};

export default AssignmentsPast;

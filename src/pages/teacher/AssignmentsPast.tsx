import { TeacherLayout } from "@/components/teacher/TeacherLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ClipboardList, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { fetchAllStudents, type StudentProfile } from "@/lib/studentProfile";
import {
  fetchAllTextbooks,
  fetchUnitsByTextbook,
  fetchPassagesByUnit,
  type Textbook,
  type Unit,
  type Passage,
} from "@/lib/textbooks";
import { format } from "date-fns";
import { formatAssignmentDueLabel } from "@/lib/assignmentDue";
import AssignmentStepBadges from "@/components/teacher/AssignmentStepBadges";
import AssignmentProgressSummary from "@/components/teacher/AssignmentProgressSummary";
import { cn } from "@/lib/utils";
import {
  fetchAssignmentProgress,
  type AssignmentProgressMap,
} from "@/lib/assignmentProgress";
import { isAssignmentDone } from "@/lib/assignmentCompletion";

interface AssignmentRow {
  id: string;
  teacher_id: string;
  student_id: string | null;
  title: string;
  description: string | null;
  sentence_id: string | null;
  due_at: string | null;
  created_at: string;
  include_pre: boolean;
  include_analysis: boolean;
  include_translation: boolean;
  include_wordtest: boolean;
  round_no?: number | null;
}

interface AssignmentGroup {
  key: string;
  title: string;
  description: string | null;
  student_id: string | null;
  unit_id: string | null;
  unit_label: string | null;
  due_at: string | null;
  include_pre: boolean;
  include_analysis: boolean;
  include_translation: boolean;
  include_wordtest: boolean;
  rows: AssignmentRow[];
  totalCount: number;
}

const AssignmentsPast = () => {
  const [rows, setRows] = useState<AssignmentRow[]>([]);
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [textbooks, setTextbooks] = useState<Textbook[]>([]);
  const [unitsByTb, setUnitsByTb] = useState<Record<string, Unit[]>>({});
  const [passagesByUnit, setPassagesByUnit] = useState<Record<string, Passage[]>>({});
  const [codeToUnit, setCodeToUnit] = useState<Record<string, string>>({});
  const [progressByAsg, setProgressByAsg] = useState<Record<string, AssignmentProgressMap>>({});
  const [loading, setLoading] = useState(true);
  const [progressLoading, setProgressLoading] = useState(true);

  const studentNameMap = useMemo(() => {
    const m = new Map<string, string>();
    students.forEach((s) =>
      m.set(s.user_id, s.display_name ?? s.student_no ?? s.user_id.slice(0, 6)),
    );
    return m;
  }, [students]);

  const studentName = (id: string | null | undefined) => {
    if (!id) return "전체 학생";
    const s = students.find((x) => x.user_id === id);
    return s?.display_name ?? s?.student_no ?? id.slice(0, 6);
  };

  const load = async () => {
    setLoading(true);
    try {
      const [studs, { data }, tbs] = await Promise.all([
        fetchAllStudents(),
        supabase.from("assignments").select("*").order("created_at", { ascending: false }),
        fetchAllTextbooks(),
      ]);
      setStudents(studs);
      setRows((data ?? []) as AssignmentRow[]);
      setTextbooks(tbs);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  // sentence_id → unit_id 매핑 + units/passages 로드 (라벨용)
  useEffect(() => {
    const codes = Array.from(
      new Set(rows.map((r) => r.sentence_id).filter(Boolean) as string[]),
    );
    const missing = codes.filter((c) => !codeToUnit[c]);
    if (missing.length === 0) return;
    void (async () => {
      const { data } = await supabase
        .from("textbook_passages")
        .select("code, unit_id, textbook_id")
        .in("code", missing);
      const rows2 = (data ?? []) as { code: string; unit_id: string; textbook_id: string }[];
      setCodeToUnit((prev) => {
        const next = { ...prev };
        rows2.forEach((r) => {
          if (r.unit_id) next[r.code] = r.unit_id;
        });
        return next;
      });
      const tbIds = Array.from(new Set(rows2.map((d) => d.textbook_id)));
      const unitIds = Array.from(new Set(rows2.map((d) => d.unit_id)));
      for (const tbId of tbIds) {
        if (!unitsByTb[tbId]) {
          try {
            const us = await fetchUnitsByTextbook(tbId);
            setUnitsByTb((m) => ({ ...m, [tbId]: us }));
          } catch (e) {
            console.error(e);
          }
        }
      }
      for (const unitId of unitIds) {
        if (passagesByUnit[unitId]) continue;
        try {
          const ps = await fetchPassagesByUnit(unitId);
          setPassagesByUnit((m) => ({ ...m, [unitId]: ps }));
        } catch (e) {
          console.error(e);
        }
      }
    })();
  }, [rows, codeToUnit, unitsByTb, passagesByUnit]);

  useEffect(() => {
    if (rows.length === 0 || students.length === 0) {
      if (!loading) setProgressLoading(false);
      return;
    }
    const allIds = students.map((s) => s.user_id);
    let cancelled = false;
    setProgressLoading(true);
    void (async () => {
      try {
        const entries = await Promise.all(
          rows
            .filter((r) => r.sentence_id)
            .map(async (r) => {
              const targets = r.student_id ? [r.student_id] : allIds;
              const m = await fetchAssignmentProgress(r.sentence_id!, targets, {
                assignmentId: r.id,
                roundNo: r.round_no ?? null,
              });
              return [r.id, m] as const;
            }),
        );
        if (cancelled) return;
        const next: Record<string, AssignmentProgressMap> = {};
        entries.forEach(([id, m]) => {
          next[id] = m;
        });
        setProgressByAsg(next);
      } finally {
        if (!cancelled) setProgressLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rows, students, loading]);

  // unit_id → 라벨
  const unitLabelMap = useMemo(() => {
    const m = new Map<string, string>();
    Object.entries(unitsByTb).forEach(([tbId, units]) => {
      const tb = textbooks.find((t) => t.id === tbId);
      const tbPrefix = tb ? `[${tb.level}] ${tb.title}` : "";
      units.forEach((u) => {
        m.set(u.id, `${tbPrefix} · U${u.unit_no} ${u.title}`);
      });
    });
    return m;
  }, [unitsByTb, textbooks]);

  // 완료된 row만 필터 → 그룹핑
  const doneGroups = useMemo<AssignmentGroup[]>(() => {
    if (rows.length === 0) return [];
    const allIds = students.map((s) => s.user_id);
    const groupMap = new Map<string, AssignmentRow[]>();
    rows.forEach((r) => {
      const unitId = r.sentence_id ? codeToUnit[r.sentence_id] ?? null : null;
      const groupKey = `${r.title}|${r.due_at}|${r.student_id ?? "__all__"}|${unitId ?? `noUnit:${r.sentence_id ?? r.id}`}`;
      if (!groupMap.has(groupKey)) groupMap.set(groupKey, []);
      groupMap.get(groupKey)!.push(r);
    });
    const out: AssignmentGroup[] = [];
    groupMap.forEach((grpRows, key) => {
      // 그룹 내 모든 row 가 완료여야 done 그룹으로 분류
      const allDone = grpRows.every((r) =>
        isAssignmentDone(r, progressByAsg[r.id], allIds),
      );
      if (!allDone) return;
      const sorted = grpRows
        .slice()
        .sort((a, b) => (a.sentence_id ?? "").localeCompare(b.sentence_id ?? ""));
      const head = sorted[0];
      const unitId = head.sentence_id ? codeToUnit[head.sentence_id] ?? null : null;
      out.push({
        key,
        title: head.title,
        description: head.description,
        student_id: head.student_id,
        unit_id: unitId,
        unit_label: unitId ? unitLabelMap.get(unitId) ?? null : null,
        due_at: head.due_at,
        include_pre: head.include_pre,
        include_analysis: head.include_analysis,
        include_translation: head.include_translation,
        include_wordtest: head.include_wordtest,
        rows: sorted,
        totalCount: sorted.length,
      });
    });
    return out.sort((a, b) => {
      const am = Math.max(...a.rows.map((r) => new Date(r.created_at).getTime()));
      const bm = Math.max(...b.rows.map((r) => new Date(r.created_at).getTime()));
      return bm - am;
    });
  }, [rows, students, codeToUnit, unitLabelMap, progressByAsg]);

  const handleDeleteGroup = async (group: AssignmentGroup) => {
    const ids = group.rows.map((r) => r.id);
    if (ids.length === 0) return;
    const ok = window.confirm(
      `이 완료 과제(${group.totalCount}개 지문)를 모두 삭제할까요?`,
    );
    if (!ok) return;
    const { error } = await supabase.from("assignments").delete().in("id", ids);
    if (error) {
      toast({ title: "삭제 실패", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: `🗑️ ${ids.length}개 과제 삭제됨` });
    void load();
  };

  return (
    <TeacherLayout>
      <div className="p-6 max-w-4xl mx-auto space-y-6 font-kr">
        <div>
          <Link
            to="/teacher/assignments"
            className="inline-flex items-center gap-1 text-[11px] font-bold text-muted-foreground hover:text-primary transition-colors"
          >
            <ChevronLeft className="size-3.5" /> 진행중 과제로
          </Link>
          <h1 className="text-2xl font-bold flex items-center gap-2 mt-1">
            <ClipboardList className="size-6 text-primary" /> 완료된 과제함
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            모든 대상 학생이 통과한 과제만 모입니다. 마감되었어도 미완료 과제는 진행중 목록에 남아 있어요.
          </p>
        </div>

        <Card className="p-5 space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-primary">
            완료 과제 {loading || progressLoading ? "" : `(${doneGroups.length})`}
          </h2>
          {loading || progressLoading ? (
            <p className="text-sm text-muted-foreground py-6 text-center animate-pulse">
              완료 과제를 불러오는 중…
            </p>
          ) : doneGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              아직 완료된 과제가 없어요.
            </p>
          ) : (
            <div className="space-y-2">
              {doneGroups.map((g) => {
                const head = g.rows[0];
                const label = g.unit_label
                  ? `${g.unit_label} · 지문 ${g.totalCount}개`
                  : null;
                const allTargetIds = head.student_id
                  ? [head.student_id]
                  : students.map((s) => s.user_id);
                // 진행중 카드와 동일한 mergedProgress 계산
                const mergedProgress: AssignmentProgressMap = new Map();
                allTargetIds.forEach((uid) => {
                  const isStepDone = (s: { status: string }) =>
                    s.status === "pass" || s.status === "done";
                  let allPre = true,
                    allWt = true,
                    allAn = true,
                    allTr = true;
                  let anyData = false;
                  let preScoreSum = 0,
                    preCnt = 0;
                  let anScoreSum = 0,
                    anCnt = 0;
                  let wtScoreSum = 0,
                    wtCnt = 0;
                  g.rows.forEach((r) => {
                    const p = progressByAsg[r.id]?.get(uid);
                    if (!p) {
                      allPre = allWt = allAn = allTr = false;
                      return;
                    }
                    anyData = true;
                    if (!isStepDone(p.pre)) allPre = false;
                    else if (p.pre.score != null) {
                      preScoreSum += p.pre.score;
                      preCnt++;
                    }
                    if (!isStepDone(p.wordtest)) allWt = false;
                    else if (p.wordtest.score != null) {
                      wtScoreSum += p.wordtest.score;
                      wtCnt++;
                    }
                    if (!isStepDone(p.analysis)) allAn = false;
                    else if (p.analysis.score != null) {
                      anScoreSum += p.analysis.score;
                      anCnt++;
                    }
                    if (!isStepDone(p.translation)) allTr = false;
                  });
                  mergedProgress.set(uid, {
                    pre: {
                      status: anyData && allPre ? "done" : "missing",
                      score: preCnt > 0 ? Math.round(preScoreSum / preCnt) : null,
                    },
                    analysis: {
                      status: anyData && allAn ? "pass" : "missing",
                      score: anCnt > 0 ? Math.round(anScoreSum / anCnt) : null,
                    },
                    translation: {
                      status: anyData && allTr ? "done" : "missing",
                      score: null,
                    },
                    wordtest: {
                      status: anyData && allWt ? "pass" : "missing",
                      score: wtCnt > 0 ? Math.round(wtScoreSum / wtCnt) : null,
                    },
                    mem: { status: "missing", score: null },
                  });
                });
                return (
                  <div
                    key={g.key}
                    className={cn(
                      "p-3 rounded-lg border-2 border-emerald-500/30 bg-emerald-50/30 dark:bg-emerald-500/5 flex items-start justify-between gap-3",
                    )}
                  >
                    <div className="space-y-1.5 min-w-0 flex-1">
                      <div className="font-bold text-foreground flex items-center gap-2 flex-wrap">
                        {g.title}
                        <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-extrabold">
                          유닛 · 지문 {g.totalCount}개
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-emerald-500 text-white text-[10px] font-extrabold">
                          ✓ 완료
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground flex flex-wrap gap-2">
                        <span>대상: {studentName(g.student_id)}</span>
                        <span>· 마감: {formatAssignmentDueLabel(g.due_at)}</span>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">
                          · {allTargetIds.length} / {allTargetIds.length}명 통과
                        </span>
                        {label && <span>· {label}</span>}
                      </div>
                      <AssignmentStepBadges
                        includePre={g.include_pre}
                        includeAnalysis={g.include_analysis}
                        includeTranslation={g.include_translation}
                        includeWordtest={g.include_wordtest}
                        progress={mergedProgress}
                        studentNameMap={studentNameMap}
                        targetUserIds={allTargetIds}
                      />
                      <AssignmentProgressSummary
                        progress={mergedProgress}
                        includePre={g.include_pre}
                        includeAnalysis={g.include_analysis}
                        includeTranslation={g.include_translation}
                        includeWordtest={g.include_wordtest}
                        targetUserIds={allTargetIds}
                        className="pt-1"
                      />
                      {g.description && (
                        <p className="text-xs text-foreground/80 mt-1">{g.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-destructive"
                        onClick={() => handleDeleteGroup(g)}
                        title="유닛 전체 삭제"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
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

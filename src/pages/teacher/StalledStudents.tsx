import { useEffect, useMemo, useState } from "react";
import { TeacherLayout } from "@/components/teacher/TeacherLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { AlertTriangle, Clock, RefreshCcw, Loader2 } from "lucide-react";
import {
  fetchLongStalled,
  fetchImminentIncomplete,
  STALL_THRESHOLD_DAYS,
  type StalledStudent,
  type StalledAssignmentTarget,
} from "@/lib/stalledStudents";
import { fetchAllStudents, type StudentProfile } from "@/lib/studentProfile";
import { cn } from "@/lib/utils";

const stepLabel: Record<StalledStudent["furthest_step"], string> = {
  none: "시작 전",
  pre: "단어 학습",
  wordtest: "단어 테스트",
  analysis: "구문 분석",
  translation: "한글 해석",
};

const StalledStudents = () => {
  const [loading, setLoading] = useState(true);
  const [longStalled, setLongStalled] = useState<StalledStudent[]>([]);
  const [imminent, setImminent] = useState<StalledAssignmentTarget[]>([]);
  const [students, setStudents] = useState<StudentProfile[]>([]);

  const nameMap = useMemo(() => {
    const m = new Map<string, string>();
    students.forEach((s) => m.set(s.user_id, s.display_name ?? s.student_no));
    return m;
  }, [students]);

  const reload = async () => {
    setLoading(true);
    const [a, b, s] = await Promise.all([
      fetchLongStalled(),
      fetchImminentIncomplete(),
      fetchAllStudents(),
    ]);
    setLongStalled(a);
    setImminent(b);
    setStudents(s);
    setLoading(false);
  };

  useEffect(() => {
    void reload();
  }, []);

  const fmtAgo = (iso: string) => {
    const ms = Date.now() - new Date(iso).getTime();
    const days = Math.floor(ms / (24 * 3_600_000));
    const hours = Math.floor((ms % (24 * 3_600_000)) / 3_600_000);
    if (days > 0) return `${days}일 ${hours}시간 전`;
    return `${hours}시간 전`;
  };

  return (
    <TeacherLayout>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <AlertTriangle className="size-6 text-amber-600" />
              정체 학생
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {STALL_THRESHOLD_DAYS}일 이상 진척이 없거나, 마감 24시간 이내 미완료 학생을 모았어요.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
            <RefreshCcw className={cn("size-4 mr-1", loading && "animate-spin")} />
            새로고침
          </Button>
        </div>

        {/* 장기 정체 */}
        <Card className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold flex items-center gap-2">
              <Clock className="size-4 text-amber-600" />
              장기 정체 ({STALL_THRESHOLD_DAYS}일+ 미진척)
              <span className="text-xs text-muted-foreground font-normal">
                {longStalled.length}건
              </span>
            </h2>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 mr-2 animate-spin" /> 불러오는 중…
            </div>
          ) : longStalled.length === 0 ? (
            <div className="text-xs text-muted-foreground py-3">
              장기 정체 학생이 없어요. 👏
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">학생</th>
                    <th className="text-left px-3 py-2 font-medium">문장</th>
                    <th className="text-left px-3 py-2 font-medium">마지막 활동</th>
                    <th className="text-left px-3 py-2 font-medium">도달 단계</th>
                    <th className="text-left px-3 py-2 font-medium">단어테스트</th>
                    <th className="text-left px-3 py-2 font-medium">분석</th>
                    <th className="text-right px-3 py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {longStalled.map((s, i) => (
                    <tr key={`${s.user_id}-${s.sentence_id}-${i}`} className="hover:bg-muted/20">
                      <td className="px-3 py-2 font-medium">
                        {nameMap.get(s.user_id) ?? "—"}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                        {s.sentence_id}
                      </td>
                      <td className="px-3 py-2 text-xs text-amber-700 dark:text-amber-300 font-bold">
                        {fmtAgo(s.last_activity_at)}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-muted font-bold">
                          {stepLabel[s.furthest_step]}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {s.word_test_score != null ? (
                          <span
                            className={cn(
                              "inline-flex items-center px-1.5 py-0.5 rounded font-bold",
                              s.word_test_passed
                                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                                : "bg-amber-500/15 text-amber-700 dark:text-amber-300",
                            )}
                          >
                            {s.word_test_score}%
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {s.analysis_match_rate != null ? (
                          <span className="font-mono">
                            {Math.round(s.analysis_match_rate * 100)}%
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Link
                          to={`/teacher/compare/${encodeURIComponent(s.sentence_id)}/${s.user_id}`}
                          className="text-xs text-primary hover:underline"
                        >
                          상세 →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* 마감 임박 미완료 */}
        <Card className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold flex items-center gap-2">
              <Clock className="size-4 text-destructive" />
              마감 24시간 이내 미완료
              <span className="text-xs text-muted-foreground font-normal">
                {imminent.length}건
              </span>
            </h2>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 mr-2 animate-spin" /> 불러오는 중…
            </div>
          ) : imminent.length === 0 ? (
            <div className="text-xs text-muted-foreground py-3">
              마감 임박 미완료 학생이 없어요. 👏
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">학생</th>
                    <th className="text-left px-3 py-2 font-medium">과제</th>
                    <th className="text-left px-3 py-2 font-medium">남은 시간</th>
                    <th className="text-left px-3 py-2 font-medium">단어학습</th>
                    <th className="text-left px-3 py-2 font-medium">단어시험</th>
                    <th className="text-left px-3 py-2 font-medium">분석</th>
                    <th className="text-left px-3 py-2 font-medium">해석</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {imminent.map((r, i) => (
                    <tr key={`${r.assignment_id}-${r.user_id}-${i}`} className="hover:bg-muted/20">
                      <td className="px-3 py-2 font-medium">
                        {nameMap.get(r.user_id) ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <div className="font-medium truncate max-w-[18rem]">{r.assignment_title}</div>
                        <div className="font-mono text-[10px] text-muted-foreground">
                          {r.sentence_id}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-xs font-bold text-destructive">
                        {r.hours_until_due}시간
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {!r.include_pre ? <span className="text-muted-foreground">스킵</span> : r.pre_done ? "✓" : "—"}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {!r.include_wordtest ? (
                          <span className="text-muted-foreground">스킵</span>
                        ) : r.word_test_done ? (
                          <span className="text-emerald-700 dark:text-emerald-300 font-bold">
                            ✓ {r.word_test_score != null ? `${r.word_test_score}%` : ""}
                          </span>
                        ) : r.word_test_score != null ? (
                          <span className="text-amber-700 dark:text-amber-300">{r.word_test_score}%</span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {!r.include_analysis ? <span className="text-muted-foreground">스킵</span> : r.analysis_done ? "✓" : "—"}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {!r.include_translation ? <span className="text-muted-foreground">스킵</span> : r.translation_done ? "✓" : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </TeacherLayout>
  );
};

export default StalledStudents;

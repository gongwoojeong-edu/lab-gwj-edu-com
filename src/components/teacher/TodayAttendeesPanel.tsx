import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RefreshCcw, Users, ExternalLink } from "lucide-react";
import type { StudentProfile } from "@/lib/studentProfile";
import { isStudentOfTeacher } from "@/lib/teacher-scope";
import {
  compareAttendeesBySchedule,
  formatAttendanceDays,
  isDashboardAttendingToday,
  parseClassSchedule,
  todayClassStartTime,
} from "@/lib/attendanceDays";
import {
  fetchAttendeeSummaries,
  workflowHref,
  type AttendeeSummary,
} from "@/lib/todayAttendees";
import { cn } from "@/lib/utils";

type ScopeMode = "mine" | "all";

interface Props {
  students: StudentProfile[];
  teacherAuthUserId: string | null;
  /** 어드민/분원장: 담당|전원 토글 표시 */
  canToggleScope: boolean;
  /** YYYY-MM-DD — 미지정 시 브라우저 오늘(안정 키, 렌더마다 new Date 금지) */
  dateIso?: string;
}

const WF_CLASS: Record<string, string> = {
  learning: "bg-sky-100 text-sky-800 border-sky-200",
  print_pending: "bg-amber-100 text-amber-900 border-amber-200",
  printed: "bg-violet-100 text-violet-900 border-violet-200",
  workbook_submitted: "bg-orange-100 text-orange-900 border-orange-200",
  completed: "bg-emerald-100 text-emerald-900 border-emerald-200",
  none: "bg-muted text-muted-foreground",
};

function localDateIso(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function TodayAttendeesPanel({
  students,
  teacherAuthUserId,
  canToggleScope,
  dateIso: dateIsoProp,
}: Props) {
  const dateIso = dateIsoProp ?? localDateIso();
  const [scope, setScope] = useState<ScopeMode>(canToggleScope ? "all" : "mine");
  const [summaries, setSummaries] = useState<AttendeeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const date = useMemo(() => {
    const [y, m, d] = dateIso.split("-").map(Number);
    return new Date(y, (m ?? 1) - 1, d ?? 1);
  }, [dateIso]);

  const scopeBase = useMemo(() => {
    // 휴퇴원 방어 (상위에서 active만 넘겨도 이중 필터)
    let list = students.filter((s) => s.orbit_enrollment_active !== false);
    if (!canToggleScope || scope === "mine") {
      if (!teacherAuthUserId) return [];
      list = list.filter((s) => isStudentOfTeacher(s, teacherAuthUserId));
    }
    return list;
  }, [students, teacherAuthUserId, canToggleScope, scope]);

  const scopedStudents = useMemo(() => {
    return scopeBase.filter((s) =>
      isDashboardAttendingToday({
        classDays: s.orbit_class_days,
        className: s.orbit_class_name,
        enrollmentActive: s.orbit_enrollment_active,
        date,
      }),
    );
  }, [scopeBase, date]);

  const excludedByDay = scopeBase.length - scopedStudents.length;

  // 배열 참조 대신 id 목록으로 effect 트리거 — 부모 리렌더 루프 방지
  const scopedIdsKey = useMemo(
    () => scopedStudents.map((s) => s.user_id).join(","),
    [scopedStudents],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const list = scopedStudents;
    void (async () => {
      try {
        const rows = await fetchAttendeeSummaries(list);
        if (cancelled) return;
        rows.sort((a, b) =>
          compareAttendeesBySchedule(
            {
              schedule: parseClassSchedule(a.profile.orbit_class_schedule),
              className: a.profile.orbit_class_name,
              name: a.profile.display_name ?? a.profile.student_no,
            },
            {
              schedule: parseClassSchedule(b.profile.orbit_class_schedule),
              className: b.profile.orbit_class_name,
              name: b.profile.display_name ?? b.profile.student_no,
            },
            date,
          ),
        );
        setSummaries(rows);
      } catch (e) {
        if (cancelled) return;
        console.error("[TodayAttendeesPanel]", e);
        setError(e instanceof Error ? e.message : String(e));
        setSummaries([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // scopedStudents는 scopedIdsKey로 대리; list는 해당 렌더 스냅샷 사용
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopedIdsKey, tick, dateIso]);

  const weekdayLabel = date.toLocaleDateString("ko-KR", { weekday: "short" });
  const countLabel = loading
    ? scopedStudents.length
    : summaries.length;

  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <Users className="size-4 text-primary shrink-0" />
          <h2 className="text-sm font-bold">오늘 등원자</h2>
          <span className="text-xs text-muted-foreground">
            ({weekdayLabel}) · {countLabel}명
            {loading ? " · 불러오는 중" : ""}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {canToggleScope && (
            <Select
              value={scope}
              onValueChange={(v) => setScope(v as ScopeMode)}
            >
              <SelectTrigger className="h-7 w-[7.5rem] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mine">내 담당</SelectItem>
                <SelectItem value="all">전원</SelectItem>
              </SelectContent>
            </Select>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => setTick((t) => t + 1)}
          >
            <RefreshCcw className="size-3 mr-1" />
            새로고침
          </Button>
          <Link
            to="/teacher/results"
            className="text-xs text-primary hover:underline inline-flex items-center gap-0.5"
          >
            학습결과
            <ExternalLink className="size-3" />
          </Link>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground leading-relaxed">
        진도·상태만 표시합니다. 인쇄·자료는{" "}
        <Link to="/teacher/inbox" className="text-primary hover:underline">
          요청확인
        </Link>
        , HO·학습완료·솔루션은{" "}
        <Link to="/teacher/results" className="text-primary hover:underline">
          학습결과
        </Link>
        에서 처리하세요.
      </p>

      {error && (
        <div className="text-xs text-destructive py-2">
          진도 요약 로드 실패: {error}
          <Button
            variant="link"
            className="h-auto p-0 ml-2 text-xs"
            onClick={() => setTick((t) => t + 1)}
          >
            다시 시도
          </Button>
        </div>
      )}

      {loading && summaries.length === 0 ? (
        <div className="text-xs text-muted-foreground py-6 text-center">불러오는 중…</div>
      ) : !loading && summaries.length === 0 ? (
        <div className="text-xs text-muted-foreground py-6 text-center space-y-1">
          <div>오늘 등원으로 표시된 학생이 없습니다.</div>
          <div className="text-[10px]">
            범위 {scope === "mine" ? "내 담당" : "전원"} {scopeBase.length}명
            {excludedByDay > 0
              ? ` · 요일 때문에 제외 ${excludedByDay}명`
              : ""}
            {scope === "mine" && scopeBase.length === 0
              ? " · teacher_id/담임 미연결일 수 있어요 → 전원을 눌러보세요"
              : ""}
          </div>
          <div className="text-[10px]">
            Orbit 수업요일에 오늘이 있는 재원생만 표시합니다. (고등부≠자동 토요)
          </div>
        </div>
      ) : (
        <ul className={cn("divide-y divide-border", loading && "opacity-60")}>
          {summaries.map((row) => {
            const name = row.profile.display_name ?? row.profile.student_no;
            const href = workflowHref(row.workflow);
            const schedule = parseClassSchedule(row.profile.orbit_class_schedule);
            const startHm = todayClassStartTime(schedule, date);
            return (
              <li key={row.userId} className="py-3 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">
                      {name}
                      <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                        {row.profile.orbit_class_name ?? "—"}
                        {startHm ? (
                          <span className="ml-1.5 font-semibold text-foreground/80">
                            {startHm}
                          </span>
                        ) : (
                          <span className="ml-1.5 text-amber-700/80">시각미정</span>
                        )}
                      </span>
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      등원{" "}
                      {formatAttendanceDays(
                        row.profile.orbit_class_days,
                        row.profile.orbit_class_name,
                      )}
                    </div>
                  </div>
                  <Link to={href}>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] h-5 border",
                        WF_CLASS[row.workflow] ?? WF_CLASS.none,
                      )}
                    >
                      {row.workflowLabel}
                    </Badge>
                  </Link>
                </div>

                <div className="space-y-1 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 w-14 text-[10px] font-bold text-muted-foreground">
                      {row.main.label}
                    </span>
                    <span className="truncate text-foreground/90">{row.main.detail}</span>
                  </div>
                  {row.tracks.length === 0 ? (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <span className="shrink-0 w-14 text-[10px] font-bold">과제</span>
                      <span>진행 중 없음</span>
                    </div>
                  ) : (
                    row.tracks.map((t, i) => (
                      <div key={`${t.label}-${i}`} className="flex items-center gap-2">
                        <span className="shrink-0 w-14 text-[10px] font-bold text-muted-foreground">
                          {t.label}
                        </span>
                        <span className="truncate flex-1">{t.detail}</span>
                        <span className="tabular-nums text-[10px] text-muted-foreground shrink-0">
                          {t.done}/{t.total}
                          {t.progressPct != null ? ` · ${t.progressPct}%` : ""}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

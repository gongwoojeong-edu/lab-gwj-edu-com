import { cn } from "@/lib/utils";
import type { AssignmentProgressMap } from "@/lib/assignmentProgress";

interface Props {
  /** 그룹 단위로 합쳐진 학생별 진척 (각 학생당 단계별 status) */
  progress: AssignmentProgressMap;
  includePre: boolean;
  includeAnalysis: boolean;
  includeTranslation: boolean;
  includeWordtest: boolean;
  /** 대상 학생 수 (이 그룹의 분모) */
  targetUserIds: string[];
  className?: string;
}

const isStepDone = (status: string | undefined) =>
  status === "pass" || status === "done";

/**
 * 과제 그룹의 진행 상황을 한 줄로 요약 + 미니 진행바.
 * "완주(모든 단계 통과) X/N · 진척 P%"
 */
export const AssignmentProgressSummary = ({
  progress,
  includePre,
  includeAnalysis,
  includeTranslation,
  includeWordtest,
  targetUserIds,
  className,
}: Props) => {
  const totalStudents = targetUserIds.length;
  const stepsPerStudent =
    (includePre ? 1 : 0) +
    (includeAnalysis ? 1 : 0) +
    (includeTranslation ? 1 : 0) +
    (includeWordtest ? 1 : 0);

  if (totalStudents === 0 || stepsPerStudent === 0) return null;

  const totalCells = totalStudents * stepsPerStudent;
  let doneCells = 0;
  let fullyDoneStudents = 0;

  targetUserIds.forEach((uid) => {
    const p = progress.get(uid);
    let studentDone = 0;
    if (includePre && isStepDone(p?.pre.status)) {
      doneCells++;
      studentDone++;
    }
    if (includeAnalysis && isStepDone(p?.analysis.status)) {
      doneCells++;
      studentDone++;
    }
    if (includeTranslation && isStepDone(p?.translation.status)) {
      doneCells++;
      studentDone++;
    }
    if (includeWordtest && isStepDone(p?.wordtest.status)) {
      doneCells++;
      studentDone++;
    }
    if (studentDone === stepsPerStudent) fullyDoneStudents++;
  });

  const pct = totalCells === 0 ? 0 : Math.round((doneCells / totalCells) * 100);
  const complete = fullyDoneStudents === totalStudents;

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-center gap-2 text-[11px] font-bold">
        <span className="text-muted-foreground">진행</span>
        <span
          className={cn(
            complete
              ? "text-emerald-600 dark:text-emerald-400"
              : pct >= 60
                ? "text-primary"
                : "text-amber-600 dark:text-amber-400",
          )}
        >
          완주 {fullyDoneStudents} / {totalStudents}명
        </span>
        <span className="text-muted-foreground">·</span>
        <span
          className={cn(
            complete
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-foreground",
          )}
        >
          단계 {doneCells} / {totalCells} ({pct}%)
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={cn(
            "h-full transition-all",
            complete
              ? "bg-emerald-500"
              : pct >= 60
                ? "bg-primary"
                : "bg-amber-500",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};

export default AssignmentProgressSummary;

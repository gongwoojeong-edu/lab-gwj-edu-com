import { cn } from "@/lib/utils";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import type {
  AssignmentProgressMap,
  StepResult,
} from "@/lib/assignmentProgress";

interface AssignmentStepBadgesProps {
  includePre?: boolean;
  includeAnalysis: boolean;
  includeTranslation: boolean;
  includeWordtest: boolean;
  includeMemorize?: boolean;
  className?: string;
  size?: "sm" | "xs";
  /** When provided alongside studentNameMap, badges become hover targets showing per-student results. */
  progress?: AssignmentProgressMap;
  studentNameMap?: Map<string, string>;
  targetUserIds?: string[];
}

type StepKey = "pre" | "analysis" | "translation" | "wordtest" | "mem";

const STEPS: Array<{ key: StepKey; label: string; hasScore: boolean }> = [
  { key: "pre", label: "단어학습", hasScore: false },
  { key: "wordtest", label: "단어시험", hasScore: true },
  { key: "analysis", label: "구문분석", hasScore: true },
  { key: "translation", label: "한글해석", hasScore: false },
  { key: "mem", label: "문장암기", hasScore: false },
];

const statusBadge = (r: StepResult, hasScore: boolean) => {
  if (r.status === "missing") {
    return (
      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-muted text-muted-foreground">
        미응시
      </span>
    );
  }
  if (r.status === "done") {
    return (
      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
        완료
      </span>
    );
  }
  if (r.status === "pass") {
    return (
      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500 text-white">
        PASS{hasScore && r.score != null ? ` ${r.score}` : ""}
      </span>
    );
  }
  // fail
  return (
    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500 text-white">
      FAIL{hasScore && r.score != null ? ` ${r.score}` : ""}
    </span>
  );
};

const StepHoverContent = ({
  step,
  progress,
  studentNameMap,
  targetUserIds,
}: {
  step: { key: StepKey; label: string; hasScore: boolean };
  progress: AssignmentProgressMap;
  studentNameMap: Map<string, string>;
  targetUserIds: string[];
}) => {
  const rows = targetUserIds.map((uid) => {
    const userProg = progress.get(uid);
    const r: StepResult = userProg?.[step.key] ?? { status: "missing", score: null };
    return {
      uid,
      name: studentNameMap.get(uid) ?? uid.slice(0, 6),
      result: r,
    };
  });

  // sort: pass/done first, fail next, missing last
  const orderVal = (s: StepResult["status"]) =>
    s === "pass" || s === "done" ? 0 : s === "fail" ? 1 : 2;
  rows.sort((a, b) => {
    const d = orderVal(a.result.status) - orderVal(b.result.status);
    if (d !== 0) return d;
    return a.name.localeCompare(b.name, "ko");
  });

  return (
    <div className="space-y-1.5">
      <div className="text-xs font-bold text-foreground border-b border-border pb-1.5">
        {step.label} · 학생별 결과
      </div>
      {rows.length === 0 ? (
        <div className="text-xs text-muted-foreground py-2">대상 학생이 없습니다.</div>
      ) : (
        <ul className="max-h-72 overflow-y-auto space-y-1 -mx-1 px-1">
          {rows.map((row) => (
            <li
              key={row.uid}
              className="flex items-center justify-between gap-2 text-xs"
            >
              <span className="font-semibold truncate">{row.name}</span>
              {statusBadge(row.result, step.hasScore)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export const AssignmentStepBadges = ({
  includePre = true,
  includeAnalysis,
  includeTranslation,
  includeWordtest,
  includeMemorize = false,
  className,
  size = "sm",
  progress,
  studentNameMap,
  targetUserIds,
}: AssignmentStepBadgesProps) => {
  const map: Record<StepKey, boolean> = {
    pre: includePre,
    analysis: includeAnalysis,
    translation: includeTranslation,
    wordtest: includeWordtest,
    mem: includeMemorize,
  };
  const sizeCls = size === "xs" ? "text-[10px] px-1.5 py-0" : "text-[11px] px-2 py-0.5";
  const hoverEnabled = !!progress && !!studentNameMap && !!targetUserIds;

  const visibleSteps = STEPS.filter((s) => map[s.key]);

  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1", className)}>
      {visibleSteps.map((s) => {
        const badge = (
          <span
            className={cn(
              "rounded font-bold border bg-primary/15 text-primary border-primary/30",
              sizeCls,
              hoverEnabled && "cursor-help",
            )}
          >
            {s.label}
          </span>
        );
        if (!hoverEnabled) return <span key={s.key}>{badge}</span>;
        return (
          <HoverCard key={s.key} openDelay={120} closeDelay={80}>
            <HoverCardTrigger asChild>{badge}</HoverCardTrigger>
            <HoverCardContent className="w-72 p-3" align="start">
              <StepHoverContent
                step={s}
                progress={progress!}
                studentNameMap={studentNameMap!}
                targetUserIds={targetUserIds!}
              />
            </HoverCardContent>
          </HoverCard>
        );
      })}
    </span>
  );
};

export default AssignmentStepBadges;

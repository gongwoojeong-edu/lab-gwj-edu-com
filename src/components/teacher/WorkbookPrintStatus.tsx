// 책장 워크북 인쇄 여부 표시 — 선택한 학생 기준으로 유닛마다 "인쇄함 / 인쇄 기록 없음"
import { useEffect, useState } from "react";
import { Loader2, Printer, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { errMsg } from "@/lib/errMsg";
import { fetchHeldTeachers } from "@/lib/heldTeachers";
import { WORKBOOK_MODE_LABEL, type WorkbookMode } from "@/lib/unitWorkbook";
import {
  fetchWorkbookPrints,
  formatPrintDate,
  summarizePrintsByUnit,
  type UnitPrintSummary,
} from "@/lib/workbookPrintLog";

interface Props {
  studentId: string;
  units: Array<{ id: string; label: string }>;
  /** 인쇄 후 값을 바꾸면 다시 불러옴 */
  reloadKey?: number;
  className?: string;
}

let staffNameCache: Promise<Map<string, string>> | null = null;
function staffNames() {
  if (!staffNameCache) {
    staffNameCache = fetchHeldTeachers()
      .then((rows) => new Map(rows.map((r) => [r.id, r.name])))
      .catch((e) => {
        staffNameCache = null;
        throw e;
      });
  }
  return staffNameCache;
}

export function WorkbookPrintStatus({ studentId, units, reloadKey = 0, className }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<Map<string, UnitPrintSummary>>(new Map());
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [retry, setRetry] = useState(0);
  const unitKey = units.map((u) => u.id).join(",");

  useEffect(() => {
    if (!studentId || units.length === 0) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const ids = units.map((u) => u.id);
    Promise.all([fetchWorkbookPrints(studentId, ids), staffNames().catch(() => new Map<string, string>())])
      .then(([logs, nm]) => {
        if (cancelled) return;
        setSummary(summarizePrintsByUnit(logs, ids));
        setNames(nm);
      })
      .catch((e) => !cancelled && setError(errMsg(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, unitKey, reloadKey, retry]);

  if (!studentId || units.length === 0) return null;

  return (
    <div className={cn("rounded-md border bg-muted/30 p-2.5 text-xs", className)}>
      <div className="flex items-center gap-1.5 font-semibold text-muted-foreground mb-1.5">
        <Printer className="size-3.5" /> 인쇄 여부
        {loading && <Loader2 className="size-3 animate-spin" />}
      </div>
      {error ? (
        <div className="flex items-center gap-2 text-destructive">
          인쇄 기록을 불러오지 못했어요 ({error})
          <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={() => setRetry((n) => n + 1)}>
            <RotateCw className="size-3 mr-1" /> 다시 불러오기
          </Button>
        </div>
      ) : (
        <ul className="space-y-1">
          {units.map((u) => {
            const s = summary.get(u.id);
            return (
              <li key={u.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="font-medium text-foreground">{u.label}</span>
                {s ? (
                  <>
                    <span className="rounded bg-primary/15 text-primary px-1.5 py-0.5 font-semibold">
                      인쇄함{s.count > 1 ? ` ${s.count}회` : ""}
                    </span>
                    <span className="text-muted-foreground">
                      최근 {formatPrintDate(s.latest.printed_at)}
                      {names.get(s.latest.printed_by) ? ` · ${names.get(s.latest.printed_by)}` : ""}
                      {" · "}
                      {WORKBOOK_MODE_LABEL[s.latest.mode as WorkbookMode] ?? s.latest.mode}
                      {s.latest.answer_key ? " · 답지" : ""}
                      {s.latest.hide_translation ? " · 해석 빈칸" : ""}
                    </span>
                  </>
                ) : (
                  !loading && <span className="text-muted-foreground">인쇄 기록 없음</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

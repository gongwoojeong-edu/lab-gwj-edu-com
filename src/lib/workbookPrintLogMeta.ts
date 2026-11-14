// ============================================================
// workbookPrintLogMeta — 책장 워크북 인쇄 기록 요약 (DB 없는 순수 함수)
// ============================================================

export interface WorkbookPrintLog {
  student_id: string;
  unit_ids: string[];
  mode: string;
  answer_key: boolean;
  hide_translation: boolean;
  passage_count: number;
  printed_by: string;
  printed_at: string;
}

export interface UnitPrintSummary {
  count: number;
  latest: WorkbookPrintLog;
}

/** 유닛별 인쇄 횟수와 가장 최근 인쇄 기록. 인쇄한 적 없는 유닛은 결과에 없음. */
export function summarizePrintsByUnit(
  logs: WorkbookPrintLog[],
  unitIds: string[],
): Map<string, UnitPrintSummary> {
  const wanted = new Set(unitIds);
  const out = new Map<string, UnitPrintSummary>();
  for (const log of logs) {
    for (const uid of log.unit_ids) {
      if (!wanted.has(uid)) continue;
      const cur = out.get(uid);
      if (!cur) out.set(uid, { count: 1, latest: log });
      else {
        cur.count += 1;
        if (log.printed_at > cur.latest.printed_at) cur.latest = log;
      }
    }
  }
  return out;
}

/** "11/14 14:20" (서울 시간) */
export function formatPrintDate(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 9 * 3600_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

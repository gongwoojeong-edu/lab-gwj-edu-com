// ============================================================
// progressScope — 학생별 "진도 범위(시리즈/권/유닛)" 소진 여부 계산
//   · 선생님이 지정한 시리즈(책)·권 범위의 지문을 모두 끝내면
//     "진도 끊김" 상태로 표시해 새 책/시리즈 등록을 유도한다.
//   · nextSentence.fetchScopedPassageCodes 와 동일한 규칙:
//       권 지정 → 그 권만 / 유닛 지정 → 그 유닛부터 같은 권 끝까지
//       시리즈만 지정 → 시리즈 전체
// ============================================================
import { supabase } from "@/integrations/supabase/client";

export type ScopeStatusKind = "unset" | "empty" | "active" | "exhausted";

export interface ScopeStatus {
  kind: ScopeStatusKind;
  total: number;
  doneCount: number;
  remaining: number;
}

export interface ScopeInput {
  user_id: string;
  start_series_id: string | null;
  start_volume_id: string | null;
  start_unit_id: string | null;
}

const PAGE = 1000;

async function fetchAllRows<T>(
  table: string,
  columns: string,
  apply?: (q: ReturnType<typeof supabase.from>) => unknown,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = (supabase.from(table as never) as any).select(columns);
    if (apply) q = apply(q);
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

interface BookIndex {
  unitsById: Map<string, { unit_no: number; textbook_id: string }>;
  unitsByTextbook: Map<string, { id: string; unit_no: number }[]>;
  textbooksBySeries: Map<string, string[]>;
  textbookById: Map<string, { series_id: string; volume_no: number }>;
  codesByUnit: Map<string, string[]>;
}

export const buildBookIndex = async (): Promise<BookIndex> => {
  const [units, books, passages] = await Promise.all([
    fetchAllRows<{ id: string; unit_no: number; textbook_id: string }>(
      "textbook_units",
      "id, unit_no, textbook_id",
    ),
    fetchAllRows<{ id: string; series_id: string; volume_no: number }>(
      "textbooks",
      "id, series_id, volume_no",
    ),
    fetchAllRows<{ code: string; unit_id: string | null }>(
      "textbook_passages",
      "code, unit_id",
    ),
  ]);

  const unitsById = new Map<string, { unit_no: number; textbook_id: string }>();
  const unitsByTextbook = new Map<string, { id: string; unit_no: number }[]>();
  units.forEach((u) => {
    unitsById.set(u.id, { unit_no: u.unit_no, textbook_id: u.textbook_id });
    const arr = unitsByTextbook.get(u.textbook_id) ?? [];
    arr.push({ id: u.id, unit_no: u.unit_no });
    unitsByTextbook.set(u.textbook_id, arr);
  });

  const textbooksBySeries = new Map<string, string[]>();
  const textbookById = new Map<string, { series_id: string; volume_no: number }>();
  books.forEach((b) => {
    const arr = textbooksBySeries.get(b.series_id) ?? [];
    arr.push(b.id);
    textbooksBySeries.set(b.series_id, arr);
    textbookById.set(b.id, { series_id: b.series_id, volume_no: b.volume_no });
  });

  const codesByUnit = new Map<string, string[]>();
  passages.forEach((p) => {
    if (!p.unit_id) return;
    const arr = codesByUnit.get(p.unit_id) ?? [];
    arr.push(p.code);
    codesByUnit.set(p.unit_id, arr);
  });

  return { unitsById, unitsByTextbook, textbooksBySeries, textbookById, codesByUnit };
};

export const scopedCodesFor = (idx: BookIndex, s: ScopeInput): string[] | null => {
  let startUnitNo: number | null = null;
  let startUnitTextbookId: string | null = null;
  if (s.start_unit_id) {
    const u = idx.unitsById.get(s.start_unit_id);
    if (u) {
      startUnitNo = u.unit_no;
      startUnitTextbookId = u.textbook_id;
    }
  }

  const startVolumeId = s.start_volume_id ?? startUnitTextbookId;
  let textbookIds: string[];
  if (startVolumeId) {
    // 권(과) 지정 → 그 권만 (다음 권으로 자동 진행 없음)
    textbookIds = [startVolumeId];
  } else if (s.start_series_id) {
    textbookIds = idx.textbooksBySeries.get(s.start_series_id) ?? [];
  } else return null; // 범위 미지정(레벨 전체)

  const codes: string[] = [];
  textbookIds.forEach((tb) => {
    (idx.unitsByTextbook.get(tb) ?? []).forEach((u) => {
      if (startUnitNo != null && startUnitTextbookId === tb && u.unit_no < startUnitNo) return;
      codes.push(...(idx.codesByUnit.get(u.id) ?? []));
    });
  });
  return codes;
};


/** 학생별 진도 범위 소진 상태 (pass 처리된 지문 기준) */
export const fetchScopeStatusMap = async (
  students: ScopeInput[],
): Promise<Record<string, ScopeStatus>> => {
  const out: Record<string, ScopeStatus> = {};
  if (students.length === 0) return out;

  const [idx, passRows] = await Promise.all([
    buildBookIndex(),
    fetchAllRows<{ user_id: string | null; sentence_id: string }>(
      "sentence_progress",
      "user_id, sentence_id",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (q) => (q as any).eq("status", "pass"),
    ),
  ]);

  const passedByUser = new Map<string, Set<string>>();
  passRows.forEach((r) => {
    if (!r.user_id) return;
    const set = passedByUser.get(r.user_id) ?? new Set<string>();
    set.add(r.sentence_id);
    passedByUser.set(r.user_id, set);
  });

  students.forEach((s) => {
    const codes = scopedCodesFor(idx, s);
    if (codes == null) {
      out[s.user_id] = { kind: "unset", total: 0, doneCount: 0, remaining: 0 };
      return;
    }
    const total = codes.length;
    if (total === 0) {
      out[s.user_id] = { kind: "empty", total: 0, doneCount: 0, remaining: 0 };
      return;
    }
    const passed = passedByUser.get(s.user_id) ?? new Set<string>();
    const doneCount = codes.filter((c) => passed.has(c)).length;
    const remaining = total - doneCount;
    out[s.user_id] = {
      kind: remaining === 0 ? "exhausted" : "active",
      total,
      doneCount,
      remaining,
    };
  });

  return out;
};

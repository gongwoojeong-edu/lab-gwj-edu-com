import type { Passage } from "@/lib/textbooks";

/** 코드 끝 숫자 (예: "1-3" → 3, "L08-S1V1U1-003" → 3) */
export const trailingCodeNumber = (code: string): number | null => {
  const dash = code.match(/-(\d+)$/);
  if (dash) return parseInt(dash[1], 10);
  const tail = code.match(/(\d+)$/);
  return tail ? parseInt(tail[1], 10) : null;
};

/** 지문 목록 정렬 — passage_no 우선, 코드 숫자 보조, 자연 정렬 */
export const comparePassageOrder = (
  a: Pick<Passage, "passage_no" | "code">,
  b: Pick<Passage, "passage_no" | "code">,
): number => {
  const aTail = trailingCodeNumber(a.code);
  const bTail = trailingCodeNumber(b.code);
  if (aTail !== null && bTail !== null && aTail !== bTail) {
    return aTail - bTail;
  }
  if (a.passage_no !== b.passage_no) return a.passage_no - b.passage_no;
  return a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: "base" });
};

export const sortPassages = <T extends Pick<Passage, "passage_no" | "code">>(list: T[]): T[] =>
  [...list].sort(comparePassageOrder);

/** 번호 필드 재배치 (UNIQUE 충돌 방지 2단계) */
export const reorderNumberedRows = async (
  table: "textbook_series" | "textbooks" | "textbook_units" | "textbook_passages",
  noField: "series_no" | "volume_no" | "unit_no" | "passage_no",
  orderedIds: string[],
): Promise<void> => {
  const { supabase } = await import("@/integrations/supabase/client");
  const TEMP = 100_000;
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase
      .from(table)
      .update({ [noField]: TEMP + i })
      .eq("id", orderedIds[i]);
    if (error) throw error;
  }
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase
      .from(table)
      .update({ [noField]: i + 1 })
      .eq("id", orderedIds[i]);
    if (error) throw error;
  }
};

export const swapListOrder = <T>(list: T[], from: number, to: number): T[] => {
  if (from < 0 || from >= list.length || to < 0 || to >= list.length || from === to) {
    return list;
  }
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
};

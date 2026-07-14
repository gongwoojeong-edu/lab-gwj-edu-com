// ============================================================
// assignmentSequence — 특별과제 순차 학습용 그룹핑/정렬 공통
// 같은 제목·마감·교재(권)의 과제는 유닛이 달라도 한 줄기로 묶는다.
// (예: 1과-1 ~ 1과-4 순차 학습)
// ============================================================

export type PassageOrderMeta = {
  unit_id: string | null;
  textbook_id: string | null;
  unit_no: number;
  passage_no: number;
};

/** 동일 제목·마감·교재면 한 시퀀스 (유닛 분리로 뒤죽박죽 학습되는 것 방지) */
export function assignmentSequenceKey(input: {
  title: string;
  due_at: string | null;
  textbookId: string | null;
}): string {
  return `${input.title}|${input.due_at ?? ""}|${input.textbookId ?? "no-tb"}`;
}

export function comparePassageOrder(
  aCode: string | null | undefined,
  bCode: string | null | undefined,
  meta: Map<string, PassageOrderMeta>,
): number {
  const a = aCode ? meta.get(aCode) : undefined;
  const b = bCode ? meta.get(bCode) : undefined;
  const aUnit = a?.unit_no ?? Number.MAX_SAFE_INTEGER;
  const bUnit = b?.unit_no ?? Number.MAX_SAFE_INTEGER;
  if (aUnit !== bUnit) return aUnit - bUnit;
  const aPass = a?.passage_no ?? Number.MAX_SAFE_INTEGER;
  const bPass = b?.passage_no ?? Number.MAX_SAFE_INTEGER;
  if (aPass !== bPass) return aPass - bPass;
  return (aCode ?? "").localeCompare(bCode ?? "");
}

/** passage code → 유닛/교재/정렬 메타 */
export async function fetchPassageOrderMeta(
  codes: string[],
): Promise<Map<string, PassageOrderMeta>> {
  const out = new Map<string, PassageOrderMeta>();
  if (codes.length === 0) return out;

  const { supabase } = await import("@/integrations/supabase/client");
  const { data: passageRows } = await supabase
    .from("textbook_passages")
    .select("code, unit_id, passage_no")
    .in("code", codes);

  const unitIds = Array.from(
    new Set(
      ((passageRows ?? []) as { unit_id: string | null }[])
        .map((p) => p.unit_id)
        .filter((id): id is string => !!id),
    ),
  );

  const unitMap = new Map<string, { unit_no: number; textbook_id: string | null }>();
  if (unitIds.length > 0) {
    const { data: units } = await supabase
      .from("textbook_units")
      .select("id, unit_no, textbook_id")
      .in("id", unitIds);
    ((units ?? []) as { id: string; unit_no: number; textbook_id: string | null }[]).forEach(
      (u) => {
        unitMap.set(u.id, { unit_no: u.unit_no, textbook_id: u.textbook_id });
      },
    );
  }

  ((passageRows ?? []) as {
    code: string;
    unit_id: string | null;
    passage_no: number | null;
  }[]).forEach((p) => {
    const u = p.unit_id ? unitMap.get(p.unit_id) : undefined;
    out.set(p.code, {
      unit_id: p.unit_id,
      textbook_id: u?.textbook_id ?? null,
      unit_no: u?.unit_no ?? 9999,
      passage_no: p.passage_no ?? 9999,
    });
  });

  return out;
}

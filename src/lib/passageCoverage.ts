import { trailingCodeNumber } from "@/lib/bookshelfOrder";

/** 배정 코드 끝번호 vs 유닛 전체에서 빠진 번호 요약 (운영 확인용) */
export function summarizePassageCodeGaps(opts: {
  assignedCodes: string[];
  unitCodes: string[];
}): {
  assignedNos: number[];
  unitNos: number[];
  missingNos: number[];
  label: string | null;
} {
  const toNos = (codes: string[]) =>
    Array.from(
      new Set(
        codes
          .map((c) => trailingCodeNumber(c))
          .filter((n): n is number => n != null && Number.isFinite(n)),
      ),
    ).sort((a, b) => a - b);

  const assignedNos = toNos(opts.assignedCodes);
  const unitNos = toNos(opts.unitCodes);
  const assignedSet = new Set(assignedNos);
  const missingNos = unitNos.filter((n) => !assignedSet.has(n));

  if (missingNos.length === 0) {
    return { assignedNos, unitNos, missingNos, label: null };
  }

  const fmt = (nos: number[]) => {
    if (nos.length <= 8) return nos.join(",");
    return `${nos.slice(0, 6).join(",")}…(+${nos.length - 6})`;
  };

  return {
    assignedNos,
    unitNos,
    missingNos,
    label: `배정 #${fmt(assignedNos)} · 누락 #${fmt(missingNos)}`,
  };
}

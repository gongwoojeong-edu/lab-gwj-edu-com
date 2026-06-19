/** Orbit 직급 라벨 (orbit.staff.rank) */
const RANKS: Record<number, string> = {
  1: "조교",
  2: "전임",
  3: "팀장",
  5: "분원장",
  6: "대표원장",
};

export function rankLabel(rank: number): string {
  return RANKS[rank] ?? String(rank);
}

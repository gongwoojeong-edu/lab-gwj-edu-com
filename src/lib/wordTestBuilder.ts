// Build word-test items from analysed owner progresses.
// Picks tokens whose POS is 명사/동사/형용사/부사 and that have a Korean meaning.

export interface WordTestEntry {
  ownerId: string;
  word: string;       // English surface
  expected: string;   // Korean meaning (정답)
  pos?: string;       // 품사 (명사/동사/형용사/부사) — optional, used for display
}

interface MinimalProgress {
  pos?: string;
  noun?: { meaning?: string };
  verb?: { meaning?: string };
  adj?: { meaning?: string };
  adv?: { meaning?: string };
}

export const buildWordTest = (
  ownerSurfaces: Record<string, string>,
  progressMap: Record<string, MinimalProgress>,
  completedOwners: string[],
): WordTestEntry[] => {
  const seen = new Set<string>();
  const out: WordTestEntry[] = [];
  for (const ownerId of completedOwners) {
    const p = progressMap[ownerId];
    const surface = (ownerSurfaces[ownerId] ?? "").trim();
    if (!p || !surface) continue;
    const key = surface.toLowerCase();
    if (seen.has(key)) continue;
    let meaning = "";
    switch (p.pos) {
      case "명사": meaning = p.noun?.meaning ?? ""; break;
      case "동사": meaning = p.verb?.meaning ?? ""; break;
      case "형용사": meaning = p.adj?.meaning ?? ""; break;
      case "부사": meaning = p.adv?.meaning ?? ""; break;
      default: continue;
    }
    if (!meaning.trim()) continue;
    seen.add(key);
    out.push({ ownerId, word: surface, expected: meaning.trim(), pos: p.pos });
  }
  return out;
};

export const normalizeKo = (s: string) =>
  s.trim().replace(/\s+/g, " ").replace(/[.,~!?·…/()]/g, "").toLowerCase();

export const isAnswerCorrect = (given: string, expected: string): boolean => {
  if (!given.trim()) return false;
  const g = normalizeKo(given);
  const exps = expected.split(/[,/;]/).map(normalizeKo).filter(Boolean);
  return exps.some((e) => e === g || e.includes(g) || g.includes(e));
};

export interface LearningSubmission {
  user_id: string;
  sentence_id: string;
  attempt_no: number;
  attempt_source?: string;
}

/** Count submitted sentences, not approval decisions, prints or unit context rows. */
export function countLearningSentences(rows: LearningSubmission[]): Record<string, { fresh: number; relearn: number }> {
  const students = new Map<string, { fresh: Set<string>; relearn: Set<string> }>();
  for (const row of rows) {
    if (/__remediation_\d+$/.test(row.sentence_id)) continue;
    const counts = students.get(row.user_id) ?? { fresh: new Set<string>(), relearn: new Set<string>() };
    const repeated = row.attempt_source === "review" || row.attempt_no > 1;
    (repeated ? counts.relearn : counts.fresh).add(row.sentence_id);
    students.set(row.user_id, counts);
  }
  return Object.fromEntries([...students].map(([id, c]) => [id, { fresh: c.fresh.size, relearn: c.relearn.size }]));
}
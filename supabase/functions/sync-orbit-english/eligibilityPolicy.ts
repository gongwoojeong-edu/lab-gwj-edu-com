/** Teacher-test learner records do not require an English class enrollment.
 * This only controls learner synchronization, never teacher/admin privileges.
 */
export function isEnglishSyncEligible(
  student: { id: string; hakbun: string | null; subjects: string[] | null },
  englishIds: Set<string>,
): boolean {
  const loginId = String(student.hakbun ?? "").trim().toLowerCase();
  if (/^gwjt\d{3}$/.test(loginId)) return true;
  return (student.subjects ?? []).includes("영어") || englishIds.has(student.id);
}
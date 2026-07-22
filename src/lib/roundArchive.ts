// ============================================================
// roundArchive — 회독(Round) 모델 지원 유틸
// ------------------------------------------------------------
// 핵심 원칙:
//  - 학생 진도/승인/시도로그의 "현재 회독" 행 = assignment_id IS NULL
//  - "이전 회독" 행 = assignment_id = <해당 회독의 assignment.id>
//  - 교사가 같은 (학생, 문장)에 새 과제(재출제)를 만들면:
//      1) 기존 NULL 행을 직전 assignment id로 봉인(archive)
//      2) 새 과제의 round_no = max(round_no)+1
//      3) 이제 (user_id, sentence_id) WHERE assignment_id IS NULL 유니크 슬롯이 비어있으므로
//         학생이 학습을 시작하면 진도 upsert가 새 빈 행을 생성 → 백지 재학습
// ============================================================
import { supabase } from "@/integrations/supabase/client";

export interface ReissuePlanEntry {
  student_id: string;
  sentence_id: string;
  /** 봉인 대상: 직전 회독의 assignment id (없으면 null → 봉인 스킵) */
  seal_to_assignment_id: string | null;
  /** 새 과제에 부여할 round_no */
  next_round_no: number;
}

/**
 * 새로 만들 (student_id, sentence_id) 쌍들에 대해 회독 정보를 계산.
 * - 기존 과제가 없으면 round_no=1
 * - 있으면 round_no = max + 1, 그리고 직전 assignment id를 봉인 타겟으로 반환
 */
export const planRoundsForNewAssignments = async (
  pairs: Array<{ student_id: string; sentence_id: string }>,
): Promise<Map<string, ReissuePlanEntry>> => {
  const key = (s: string, c: string) => `${s}::${c}`;
  const out = new Map<string, ReissuePlanEntry>();
  if (pairs.length === 0) return out;

  const studentIds = Array.from(new Set(pairs.map((p) => p.student_id)));
  const sentenceIds = Array.from(new Set(pairs.map((p) => p.sentence_id)));

  const { data } = await supabase
    .from("assignments")
    .select("id, student_id, sentence_id, round_no, created_at")
    .in("student_id", studentIds)
    .in("sentence_id", sentenceIds);

  const grouped = new Map<string, Array<{ id: string; round_no: number | null; created_at: string }>>();
  ((data ?? []) as Array<{
    id: string;
    student_id: string;
    sentence_id: string;
    round_no: number | null;
    created_at: string;
  }>).forEach((r) => {
    const k = key(r.student_id, r.sentence_id);
    const arr = grouped.get(k) ?? [];
    arr.push({ id: r.id, round_no: r.round_no, created_at: r.created_at });
    grouped.set(k, arr);
  });

  pairs.forEach((p) => {
    const k = key(p.student_id, p.sentence_id);
    if (out.has(k)) return;
    const list = grouped.get(k) ?? [];
    if (list.length === 0) {
      out.set(k, {
        student_id: p.student_id,
        sentence_id: p.sentence_id,
        seal_to_assignment_id: null,
        next_round_no: 1,
      });
      return;
    }
    const sorted = list.slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
    const latest = sorted[0];
    const maxRound = list.reduce((m, r) => Math.max(m, r.round_no ?? 1), 1);
    out.set(k, {
      student_id: p.student_id,
      sentence_id: p.sentence_id,
      seal_to_assignment_id: latest.id,
      next_round_no: maxRound + 1,
    });
  });

  return out;
};

/**
 * 계획된 봉인을 실제 DB에 반영.
 * - sentence_progress / sentence_approvals / sentence_attempt_logs 의
 *   (user_id, sentence_id) 행 중 assignment_id IS NULL 을 seal_to_assignment_id 로 UPDATE.
 */
export const sealPreviousRounds = async (
  plans: ReissuePlanEntry[],
): Promise<void> => {
  const targets = plans.filter((p) => !!p.seal_to_assignment_id);
  if (targets.length === 0) return;

  // 학생·문장이 여러 개일 수 있으므로 순차 처리(대부분 소규모: 한 번의 재출제)
  for (const t of targets) {
    const seal = t.seal_to_assignment_id!;
    const filters = {
      user_id: t.student_id,
      sentence_id: t.sentence_id,
    };
    // sentence_progress
    await supabase
      .from("sentence_progress")
      .update({ assignment_id: seal } as never)
      .match(filters)
      .is("assignment_id", null);
    // sentence_approvals
    await supabase
      .from("sentence_approvals")
      .update({ assignment_id: seal } as never)
      .match(filters)
      .is("assignment_id", null);
    // sentence_attempt_logs
    await supabase
      .from("sentence_attempt_logs")
      .update({ assignment_id: seal } as never)
      .match(filters)
      .is("assignment_id", null);
  }
};

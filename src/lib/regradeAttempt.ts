// ============================================================
// regradeAttempt.ts — 과거 학습 기록 소급 재채점
// 마스터 분석이 뒤늦게 등록된 경우, 학생의 owner_progress(현재 저장된)와
// 현재 마스터키를 비교하여 sentence_attempt_logs 한 건을 재채점한다.
//
// 주의: 학생의 owner_progress는 시점 스냅샷이 아니라 "최신 상태"이므로
// 해당 시점에 학생이 무엇을 입력했는지 100% 복원되지는 않는다.
// (학생이 그 이후 분석을 수정/덮어썼다면 그 결과가 평가됨.)
// 그래도 무응답 상태로 0%로 박혀 있는 과거 기록을 살릴 수 있는 가장
// 현실적인 방법이다.
// ============================================================
import { supabase } from "@/integrations/supabase/client";
import {
  fetchMasterAnswers,
  fetchStudentAnswersByUserId,
  type OwnerDiffEntry,
} from "@/lib/analysisGrading";

interface AnyProgress {
  pos: string | null;
  noun?: { form: string | null; element: string | null; role: string | null; subrole?: string | null };
  adj?: { form: string | null; element: string | null; role: string | null };
  adv?: { form: string | null; subtype?: string | null; role: string | null };
  etc?: { kind: string | null; role: string | null };
  verb?: {
    number?: string | null;
    tense?: string | null;
    aspect?: string | null;
    voice?: string | null;
    proverb?: string | null;
  };
}

const norm = (v: unknown): string => (v === null || v === undefined ? "" : String(v));

const detailsEqual = (a: AnyProgress, b: AnyProgress): boolean => {
  if (norm(a.pos) !== norm(b.pos)) return false;
  switch (a.pos) {
    case "noun":
      return (
        norm(a.noun?.form) === norm(b.noun?.form) &&
        norm(a.noun?.element) === norm(b.noun?.element) &&
        norm(a.noun?.role) === norm(b.noun?.role) &&
        norm(a.noun?.subrole) === norm(b.noun?.subrole)
      );
    case "adj":
      return (
        norm(a.adj?.form) === norm(b.adj?.form) &&
        norm(a.adj?.element) === norm(b.adj?.element) &&
        norm(a.adj?.role) === norm(b.adj?.role)
      );
    case "adv":
      return (
        norm(a.adv?.form) === norm(b.adv?.form) &&
        norm(a.adv?.subtype) === norm(b.adv?.subtype) &&
        norm(a.adv?.role) === norm(b.adv?.role)
      );
    case "etc":
      return norm(a.etc?.kind) === norm(b.etc?.kind) && norm(a.etc?.role) === norm(b.etc?.role);
    case "verb":
      return (
        norm(a.verb?.number) === norm(b.verb?.number) &&
        norm(a.verb?.tense) === norm(b.verb?.tense) &&
        norm(a.verb?.aspect) === norm(b.verb?.aspect) &&
        norm(a.verb?.voice) === norm(b.verb?.voice) &&
        norm(a.verb?.proverb) === norm(b.verb?.proverb)
      );
    default:
      return true;
  }
};

export interface RegradeResult {
  hasMaster: boolean;
  rate: number;
  passed: boolean;
  exactCount: number;
  masterCount: number;
  diffs: OwnerDiffEntry[];
}

/** 마스터키 + 학생 현재 owner_progress 기준으로 다시 채점 (저장 없이 계산만). */
export const computeRegrade = async (
  sentenceId: string,
  studentUserId: string,
  threshold: number,
): Promise<RegradeResult> => {
  const [master, student] = await Promise.all([
    fetchMasterAnswers(sentenceId),
    fetchStudentAnswersByUserId(sentenceId, studentUserId),
  ]);
  const masterIds = Object.keys(master);
  if (masterIds.length === 0) {
    return { hasMaster: false, rate: 0, passed: false, exactCount: 0, masterCount: 0, diffs: [] };
  }
  let exact = 0;
  const diffs: OwnerDiffEntry[] = [];
  for (const ownerId of masterIds) {
    const m = master[ownerId] as AnyProgress;
    const s = student[ownerId] as AnyProgress | undefined;
    if (!s || !s.pos) {
      diffs.push({ owner_id: ownerId, status: "missing", master_pos: m.pos, student_pos: null });
      continue;
    }
    if (detailsEqual(m, s)) {
      exact++;
      continue;
    }
    if (norm(m.pos) === norm(s.pos) && m.pos) {
      diffs.push({ owner_id: ownerId, status: "partial", master_pos: m.pos, student_pos: s.pos });
    } else {
      diffs.push({ owner_id: ownerId, status: "miss", master_pos: m.pos, student_pos: s.pos });
    }
  }
  const rate = exact / masterIds.length;
  return {
    hasMaster: true,
    rate,
    passed: rate >= threshold,
    exactCount: exact,
    masterCount: masterIds.length,
    diffs,
  };
};

/** 학생 분석합격 임계값 조회 (없으면 0.6 fallback) */
export const fetchStudentAnalysisThreshold = async (
  studentUserId: string,
): Promise<number> => {
  const { data } = await supabase
    .from("student_profiles")
    .select("analysis_pass_threshold")
    .eq("user_id", studentUserId)
    .maybeSingle();
  const v = (data as any)?.analysis_pass_threshold;
  return typeof v === "number" && Number.isFinite(v) ? v : 0.6;
};

export interface RegradeApplyResult extends RegradeResult {
  threshold: number;
}

/**
 * sentence_attempt_logs 한 건을 소급 재채점하여 DB에 반영.
 * - analysis_match_rate / analysis_passed / owner_diff 갱신
 * - __no_master__ 마커 제거
 * - sentence_progress 도 함께 갱신 (rate가 통과 기준 이상이면 analysis_done=true)
 *
 * 마스터키가 없으면 RegradeApplyResult.hasMaster=false를 돌려준다(저장은 하지 않음).
 */
export const regradeAttemptLog = async (
  attemptLogId: string,
  sentenceId: string,
  studentUserId: string,
): Promise<RegradeApplyResult> => {
  const threshold = await fetchStudentAnalysisThreshold(studentUserId);
  const result = await computeRegrade(sentenceId, studentUserId, threshold);
  if (!result.hasMaster) {
    return { ...result, threshold };
  }

  const newOwnerDiff = JSON.parse(JSON.stringify(result.diffs)) as any;

  const { error: logErr } = await supabase
    .from("sentence_attempt_logs")
    .update({
      analysis_match_rate: result.rate,
      analysis_passed: result.passed,
      owner_diff: newOwnerDiff,
    })
    .eq("id", attemptLogId);
  if (logErr) throw new Error(`attempt log 갱신 실패: ${logErr.message}`);

  // sentence_progress 갱신 — 기존 통과 상태를 깎지 않도록 보수적으로 처리
  const { data: prog } = await supabase
    .from("sentence_progress")
    .select("status, analysis_done, analysis_match_rate")
    .eq("user_id", studentUserId)
    .eq("sentence_id", sentenceId)
    .maybeSingle();

  const alreadyPass = (prog as any)?.status === "pass";
  const patch: any = { analysis_match_rate: result.rate };
  if (result.passed) {
    patch.analysis_done = true;
    if (!alreadyPass) {
      patch.status = "pass";
      patch.passed_at = new Date().toISOString();
    }
  }
  await supabase
    .from("sentence_progress")
    .update(patch)
    .eq("user_id", studentUserId)
    .eq("sentence_id", sentenceId);

  return { ...result, threshold };
};

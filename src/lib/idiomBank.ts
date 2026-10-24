// ============================================================
// idiomBank.ts — 학생별 "외워야 할 관용어구" 누적 뱅크
// 첨삭 과정에서 선생님이 그때그때 메모해 두면 학생별로 쌓이고,
// 주기적으로 정리지/테스트지로 출력하거나 앱 내 테스트를 부여한다.
// ============================================================
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { getCurrentUserId } from "@/lib/authState";
import { createNotification } from "@/lib/studentNotifications";

export interface IdiomBankItem {
  id: string;
  user_id: string;
  expression: string;
  meaning: string;
  sentence_id: string | null;
  approval_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface IdiomTestResultItem {
  id: string;
  expression: string;
  expected: string;
  given: string;
  correct: boolean;
}

export interface IdiomTestAssignment {
  id: string;
  user_id: string;
  item_ids: string[];
  total: number;
  assigned_by: string | null;
  assigned_at: string;
  completed_at: string | null;
  correct: number | null;
  score: number | null;
  results: IdiomTestResultItem[] | null;
}

// ---------- 뱅크 CRUD ----------

export const addIdiomToBank = async (input: {
  userId: string;
  expression: string;
  meaning: string;
  sentenceId?: string | null;
  approvalId?: string | null;
}): Promise<IdiomBankItem> => {
  const me = await getCurrentUserId();
  const { data, error } = await supabase
    .from("student_idiom_bank")
    .insert({
      user_id: input.userId,
      expression: input.expression.trim(),
      meaning: input.meaning.trim(),
      sentence_id: input.sentenceId ?? null,
      approval_id: input.approvalId ?? null,
      created_by: me,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as IdiomBankItem;
};

export const fetchIdiomBank = async (userId: string): Promise<IdiomBankItem[]> => {
  const { data, error } = await supabase
    .from("student_idiom_bank")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as IdiomBankItem[];
};

export const updateIdiomBankItem = async (
  id: string,
  patch: { expression?: string; meaning?: string },
): Promise<void> => {
  const { error } = await supabase
    .from("student_idiom_bank")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
};

export const deleteIdiomBankItem = async (id: string): Promise<void> => {
  const { error } = await supabase.from("student_idiom_bank").delete().eq("id", id);
  if (error) throw error;
};

// ---------- 테스트 부여 ----------

/** 누적 항목 중 n개를 무작위로 고른다. rng는 테스트 주입용. */
export const pickIdiomTestItems = <T extends { id: string }>(
  items: T[],
  n: number,
  rng: () => number = Math.random,
): T[] => {
  const pool = [...items];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.max(0, Math.min(n, pool.length)));
};

export const assignIdiomTest = async (
  userId: string,
  count: number,
): Promise<IdiomTestAssignment> => {
  const bank = await fetchIdiomBank(userId);
  if (bank.length === 0) throw new Error("누적된 관용어구가 없습니다.");
  const picked = pickIdiomTestItems(bank, count);
  const me = await getCurrentUserId();
  const { data, error } = await supabase
    .from("idiom_test_assignments")
    .insert({
      user_id: userId,
      item_ids: picked.map((p) => p.id),
      total: picked.length,
      assigned_by: me,
    })
    .select("*")
    .single();
  if (error) throw error;
  await createNotification({
    userId,
    kind: "system",
    title: `관용어구 테스트 ${picked.length}문항이 도착했어요`,
    body: "홈 화면의 관용어구 테스트 배너에서 바로 시작할 수 있어요.",
  }).catch(() => {});
  return data as unknown as IdiomTestAssignment;
};

export const fetchIdiomTestHistory = async (
  userId: string,
): Promise<IdiomTestAssignment[]> => {
  const { data, error } = await supabase
    .from("idiom_test_assignments")
    .select("*")
    .eq("user_id", userId)
    .order("assigned_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data ?? []) as unknown as IdiomTestAssignment[];
};

// ---------- 학생 응시 ----------

/** 학생의 가장 최근 미완료 테스트 (없으면 null) */
export const fetchMyPendingIdiomTest = async (): Promise<IdiomTestAssignment | null> => {
  const uid = await getCurrentUserId();
  if (!uid) return null;
  const { data, error } = await supabase
    .from("idiom_test_assignments")
    .select("*")
    .eq("user_id", uid)
    .is("completed_at", null)
    .order("assigned_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return (data as unknown as IdiomTestAssignment) ?? null;
};

/** 과제에 포함된 뱅크 항목을 item_ids 순서대로 가져온다 */
export const fetchIdiomTestItems = async (
  assignment: IdiomTestAssignment,
): Promise<IdiomBankItem[]> => {
  if (assignment.item_ids.length === 0) return [];
  const { data, error } = await supabase
    .from("student_idiom_bank")
    .select("*")
    .in("id", assignment.item_ids);
  if (error) throw error;
  const byId = new Map((data ?? []).map((r) => [r.id, r as IdiomBankItem]));
  return assignment.item_ids
    .map((id) => byId.get(id))
    .filter((x): x is IdiomBankItem => !!x);
};

const normalizeAnswer = (s: string): string =>
  s
    .trim()
    .toLowerCase()
    .replace(/[.,!?~·・]/g, "")
    .replace(/\s+/g, " ");

/**
 * 관용어구 뜻 채점 — 학생은 한글 뜻을 입력한다.
 * 정답에 "/" 또는 ","로 여러 표현이 있으면 그중 하나만 맞혀도 정답.
 */
export const gradeIdiomAnswer = (expected: string, given: string): boolean => {
  const g = normalizeAnswer(given);
  if (!g) return false;
  const alternatives = expected
    .split(/[\/,]/)
    .map(normalizeAnswer)
    .filter(Boolean);
  if (alternatives.length === 0) return false;
  return alternatives.some((a) => a === g);
};

export const submitIdiomTest = async (
  assignment: IdiomTestAssignment,
  items: IdiomBankItem[],
  answers: Record<string, string>,
): Promise<{ correct: number; total: number; score: number; results: IdiomTestResultItem[] }> => {
  const results: IdiomTestResultItem[] = items.map((it) => {
    const given = (answers[it.id] ?? "").trim();
    return {
      id: it.id,
      expression: it.expression,
      expected: it.meaning,
      given,
      correct: gradeIdiomAnswer(it.meaning, given),
    };
  });
  const correct = results.filter((r) => r.correct).length;
  const total = results.length;
  const score = total > 0 ? Math.round((correct / total) * 100) : 0;
  const { error } = await supabase
    .from("idiom_test_assignments")
    .update({
      completed_at: new Date().toISOString(),
      correct,
      score,
      results: results as unknown as Json,
      updated_at: new Date().toISOString(),
    })
    .eq("id", assignment.id);
  if (error) throw error;
  return { correct, total, score, results };
};

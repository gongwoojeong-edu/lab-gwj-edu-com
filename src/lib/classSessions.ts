// ============================================================
// classSessions — "수업에서 다룬 문장" 기록 (수업 완료 때마다 한 줄씩 쌓임)
//   · 재제출 첨삭창 / 학생 재학습 화면 / 워크북 / 리포트가 모두 여기서 읽는다.
// ============================================================
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPages, fetchInChunks } from "@/lib/paginatedQuery";
import type { ClassSession } from "@/lib/classSessionMeta";
export * from "@/lib/classSessionMeta";

const COLS = "user_id,sentence_id,approval_id,teacher_id,held_at";

/** 학생 1명의 여러 문장 수업 기록 */
export async function fetchClassSessions(userId: string, sentenceIds: string[]): Promise<ClassSession[]> {
  const ids = [...new Set(sentenceIds)].filter(Boolean);
  if (!userId || !ids.length) return [];
  return fetchInChunks(ids, (chunk) =>
    fetchAllPages<ClassSession>((from, to) =>
      supabase.from("class_session_attendance").select(COLS)
        .eq("user_id", userId).in("sentence_id", chunk)
        .order("held_at").order("id").range(from, to) as never));
}

/** 기간 안에 열린 수업 기록 (리포트용) */
export async function fetchClassSessionsInPeriod(startIso: string, endIso: string): Promise<ClassSession[]> {
  return fetchAllPages<ClassSession>((from, to) =>
    supabase.from("class_session_attendance").select(COLS)
      .gte("held_at", startIso).lte("held_at", endIso)
      .order("held_at").order("id").range(from, to) as never);
}


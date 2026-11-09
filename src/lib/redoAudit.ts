// ============================================================
// redoAudit — 학생에게 남아 있는 "재학습 요청"을 선생님이 보고 골라 취소한다.
//   · 학생 알림함과 같은 기준: 재학습 잠금(redo_requested_at)이 걸려 있고
//     요청 이후 같은 문장을 다시 제출하지 않았으면 '남아 있는 재학습'.
//   · 취소하면 잠금을 끄고 해당 재학습 알림을 읽음 처리한다 (제출·첨삭 기록은 보존).
// ============================================================
import { supabase } from "@/integrations/supabase/client";
import { buildBookIndex, scopedCodesFor } from "@/lib/progressScope";
import { fetchAllPages, fetchInChunks } from "@/lib/paginatedQuery";
import { memoToPlainText } from "@/lib/approvalMemo";

export interface RedoAuditRow {
  userId: string;
  studentNo: string;
  studentName: string;
  sentenceId: string;
  requestedAt: string;
  memo: string | null;
  /** 원문 앞부분 */
  englishPreview: string;
  /** 요청 문장이 속한 시리즈 · 권 · 유닛 */
  bookLabel: string;
  /** 학생 현재 진도 범위 안이면 true */
  inScope: boolean;
  /** 특별과제 안의 재학습이면 true */
  fromAssignment: boolean;
}

const ts = (v: string | null | undefined) => (v ? new Date(v).getTime() : 0);

/** 순수 규칙: 요청 이후 같은 문장을 다시 제출하지 않았으면 아직 남아 있는 재학습이다. */
export const isOpenRedo = (requestedAt: string, latestSubmitAt: string | null | undefined) =>
  ts(latestSubmitAt) <= ts(requestedAt);

type Prog = {
  user_id: string | null;
  sentence_id: string;
  assignment_id: string | null;
  redo_requested_at: string;
  last_redo_memo: string | null;
};
type Prof = {
  user_id: string;
  student_no: string;
  display_name: string | null;
  start_series_id: string | null;
  start_volume_id: string | null;
  start_unit_id: string | null;
  track_b_enabled: boolean | null;
  track_b_series_id: string | null;
  track_b_volume_id: string | null;
  track_b_unit_id: string | null;
  orbit_enrollment_active: boolean | null;
};

export const fetchRedoAudit = async (): Promise<RedoAuditRow[]> => {
  const [progRows, profRows, idx] = await Promise.all([
    fetchAllPages<Prog>((from, to) =>
      supabase
        .from("sentence_progress")
        .select("user_id, sentence_id, assignment_id, redo_requested_at, last_redo_memo")
        .not("redo_requested_at", "is", null)
        .order("id")
        .range(from, to),
    ),
    fetchAllPages<Prof>((from, to) =>
      supabase
        .from("student_profiles")
        .select(
          "user_id, student_no, display_name, start_series_id, start_volume_id, start_unit_id, track_b_enabled, track_b_series_id, track_b_volume_id, track_b_unit_id, orbit_enrollment_active",
        )
        .order("user_id")
        .range(from, to),
    ),
    buildBookIndex(),
  ]);

  const profiles = new Map<string, Prof>();
  profRows.forEach((p) => profiles.set(p.user_id, p));

  const flagged = progRows.filter((r) => {
    if (!r.user_id) return false;
    const prof = profiles.get(r.user_id);
    return !!prof && prof.orbit_enrollment_active !== false;
  });
  if (flagged.length === 0) return [];

  const userIds = [...new Set(flagged.map((r) => r.user_id as string))];
  const sentenceIds = [...new Set(flagged.map((r) => r.sentence_id))];

  const [submissions, passages, units, books, series] = await Promise.all([
    fetchInChunks(sentenceIds, (ids) =>
      fetchAllPages<{ user_id: string; sentence_id: string; requested_at: string }>((from, to) =>
        supabase
          .from("sentence_approvals")
          .select("user_id, sentence_id, requested_at")
          .in("sentence_id", ids)
          .in("user_id", userIds)
          .order("id")
          .range(from, to),
      ),
    ),
    fetchInChunks(sentenceIds, (ids) =>
      fetchAllPages<{ code: string; unit_id: string | null; english: string }>((from, to) =>
        supabase
          .from("textbook_passages")
          .select("code, unit_id, english")
          .in("code", ids)
          .order("id")
          .range(from, to),
      ),
    ),
    fetchAllPages<{ id: string; title: string; textbook_id: string }>((from, to) =>
      supabase.from("textbook_units").select("id, title, textbook_id").order("id").range(from, to),
    ),
    fetchAllPages<{ id: string; title: string; series_id: string }>((from, to) =>
      supabase.from("textbooks").select("id, title, series_id").order("id").range(from, to),
    ),
    fetchAllPages<{ id: string; title: string }>((from, to) =>
      supabase.from("textbook_series").select("id, title").order("id").range(from, to),
    ),
  ]);

  const latestSubmit = new Map<string, string>();
  submissions.forEach((s) => {
    const k = `${s.user_id}|${s.sentence_id}`;
    if (ts(s.requested_at) > ts(latestSubmit.get(k))) latestSubmit.set(k, s.requested_at);
  });

  const unitById = new Map(units.map((u) => [u.id, u]));
  const bookById = new Map(books.map((b) => [b.id, b]));
  const seriesById = new Map(series.map((s) => [s.id, s]));
  const passageByCode = new Map<string, { unit_id: string | null; english: string }>();
  passages.forEach((p) => {
    if (!passageByCode.has(p.code)) passageByCode.set(p.code, p);
  });
  const labelOf = (code: string) => {
    const p = passageByCode.get(code);
    const u = p?.unit_id ? unitById.get(p.unit_id) : undefined;
    const b = u ? bookById.get(u.textbook_id) : undefined;
    const s = b ? seriesById.get(b.series_id) : undefined;
    if (!u || !b) return "미등록 교재";
    return [s?.title, b.title, u.title].filter(Boolean).join(" · ");
  };

  const scopeCache = new Map<string, Set<string> | null>();
  const scopeOf = (prof: Prof): Set<string> | null => {
    const hit = scopeCache.get(prof.user_id);
    if (hit !== undefined) return hit;
    const a = scopedCodesFor(idx, {
      user_id: prof.user_id,
      start_series_id: prof.start_series_id,
      start_volume_id: prof.start_volume_id,
      start_unit_id: prof.start_unit_id,
    });
    const b = prof.track_b_enabled
      ? scopedCodesFor(idx, {
          user_id: prof.user_id,
          start_series_id: prof.track_b_series_id,
          start_volume_id: prof.track_b_volume_id,
          start_unit_id: prof.track_b_unit_id,
        })
      : [];
    const set =
      a == null && (b == null || prof.track_b_enabled !== true)
        ? null
        : new Set([...(a ?? []), ...(b ?? [])]);
    scopeCache.set(prof.user_id, set);
    return set;
  };

  // 같은 학생·문장에 일반/특별과제 행이 둘 다 있으면 최근 요청 하나로 합친다.
  const merged = new Map<string, RedoAuditRow>();
  for (const r of flagged) {
    const userId = r.user_id as string;
    const key = `${userId}|${r.sentence_id}`;
    if (!isOpenRedo(r.redo_requested_at, latestSubmit.get(key))) continue;
    const prev = merged.get(key);
    if (prev && ts(prev.requestedAt) >= ts(r.redo_requested_at)) continue;
    const prof = profiles.get(userId) as Prof;
    const scope = scopeOf(prof);
    const english = passageByCode.get(r.sentence_id)?.english ?? "";
    merged.set(key, {
      userId,
      studentNo: prof.student_no,
      studentName: prof.display_name ?? prof.student_no,
      sentenceId: r.sentence_id,
      requestedAt: r.redo_requested_at,
      memo: r.last_redo_memo ? memoToPlainText(r.last_redo_memo) || null : null,
      englishPreview: english.length > 90 ? `${english.slice(0, 90)}…` : english,
      bookLabel: labelOf(r.sentence_id),
      inScope: scope == null ? true : scope.has(r.sentence_id),
      fromAssignment: !!r.assignment_id,
    });
  }

  return [...merged.values()].sort(
    (a, b) =>
      a.studentName.localeCompare(b.studentName, "ko") || ts(b.requestedAt) - ts(a.requestedAt),
  );
};

/** 재학습 요청 취소: 잠금을 끄고 학생 알림함의 해당 재학습 알림을 정리한다 (기록은 보존). */
export const clearRedoRequests = async (
  rows: { userId: string; sentenceId: string }[],
): Promise<void> => {
  const nowIso = new Date().toISOString();
  for (const r of rows) {
    const { error } = await supabase
      .from("sentence_progress")
      .update({ redo_requested_at: null } as never)
      .eq("user_id", r.userId)
      .eq("sentence_id", r.sentenceId)
      .not("redo_requested_at", "is", null);
    if (error) throw error;
    const { error: nErr } = await supabase
      .from("student_notifications")
      .update({ read_at: nowIso })
      .eq("user_id", r.userId)
      .eq("sentence_id", r.sentenceId)
      .is("read_at", null)
      .or("grade.in.(redo,coach),title.ilike.*재학습*,title.ilike.*추가학습*");
    if (nErr) throw nErr;
  }
};

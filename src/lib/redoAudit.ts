// ============================================================
// redoAudit — 남아 있는 "재학습 요청"을 학생 진도 범위와 대조한다.
//   · 현재 메인덱/서브덱 범위 밖 요청은 학생 화면에 절대 뜨지 않으므로
//     선생님이 확인하고 해제하거나 진도를 조정할 수 있게 목록으로 보여준다.
// ============================================================
import { supabase } from "@/integrations/supabase/client";
import { buildBookIndex, scopedCodesFor } from "@/lib/progressScope";

export interface RedoAuditRow {
  userId: string;
  studentNo: string;
  studentName: string;
  sentenceId: string;
  requestedAt: string;
  memo: string | null;
  status: string | null;
  /** 요청 문장이 속한 교재 표시 */
  bookLabel: string;
  /** 학생 현재 진도 범위 안이면 true (= 학생 화면에 뜬다) */
  inScope: boolean;
  /** 학생 현재 메인덱 교재 표시 */
  currentBookLabel: string;
}

const ts = (v: string | null | undefined) => (v ? new Date(v).getTime() : 0);

export const fetchRedoAudit = async (): Promise<RedoAuditRow[]> => {
  const [{ data: progData }, { data: profData }, idx] = await Promise.all([
    supabase
      .from("sentence_progress")
      .select(
        "user_id, sentence_id, redo_requested_at, last_redo_memo, status, passed_at, updated_at",
      )
      .not("redo_requested_at", "is", null)
      .is("assignment_id", null)
      .order("redo_requested_at", { ascending: true })
      .limit(2000),
    supabase
      .from("student_profiles")
      .select(
        "user_id, student_no, display_name, start_series_id, start_volume_id, start_unit_id, track_b_enabled, track_b_series_id, track_b_volume_id, track_b_unit_id, orbit_enrollment_active",
      ),
    buildBookIndex(),
  ]);

  type Prog = {
    user_id: string | null;
    sentence_id: string;
    redo_requested_at: string;
    last_redo_memo: string | null;
    status: string | null;
    passed_at: string | null;
    updated_at: string | null;
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

  const profiles = new Map<string, Prof>();
  ((profData ?? []) as Prof[]).forEach((p) => profiles.set(p.user_id, p));

  // 재학습 요청 이후 이미 다시 통과한 문장은 해제된 것으로 본다 (학생 화면 로직과 동일).
  const pending = ((progData ?? []) as Prog[]).filter((r) => {
    if (!r.user_id) return false;
    const prof = profiles.get(r.user_id);
    if (!prof || prof.orbit_enrollment_active === false) return false;
    if (r.status === "pass") {
      const requested = ts(r.redo_requested_at);
      if (ts(r.passed_at) >= requested || ts(r.updated_at) >= requested) return false;
    }
    return true;
  });
  if (pending.length === 0) return [];

  // 교재 라벨 매핑
  const { data: bookRows } = await supabase.from("textbooks").select("id, level, title");
  const bookLabel = new Map<string, string>();
  ((bookRows ?? []) as { id: string; level: string; title: string }[]).forEach((b) =>
    bookLabel.set(b.id, `${b.level} ${b.title}`),
  );
  const textbookOfCode = new Map<string, string>();
  idx.codesByUnit.forEach((codes, unitId) => {
    const unit = idx.unitsById.get(unitId);
    if (!unit) return;
    codes.forEach((c) => textbookOfCode.set(c, unit.textbook_id));
  });

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
    // 둘 다 미지정(null)이면 범위 제한 없음 → 전부 범위 안으로 본다.
    const set = a == null && (b == null || prof.track_b_enabled !== true)
      ? null
      : new Set([...(a ?? []), ...(b ?? [])]);
    scopeCache.set(prof.user_id, set);
    return set;
  };

  return pending.map((r) => {
    const prof = profiles.get(r.user_id as string) as Prof;
    const scope = scopeOf(prof);
    const tb = textbookOfCode.get(r.sentence_id) ?? null;
    return {
      userId: prof.user_id,
      studentNo: prof.student_no,
      studentName: prof.display_name ?? prof.student_no,
      sentenceId: r.sentence_id,
      requestedAt: r.redo_requested_at,
      memo: r.last_redo_memo,
      status: r.status,
      bookLabel: tb ? (bookLabel.get(tb) ?? "미등록 교재") : "미등록 교재",
      inScope: scope == null ? true : scope.has(r.sentence_id),
      currentBookLabel: prof.start_volume_id
        ? (bookLabel.get(prof.start_volume_id) ?? "-")
        : "범위 미지정",
    };
  });
};

/** 재학습 요청 해제 (기록은 남기고 플래그만 끈다) */
export const clearRedoRequests = async (
  rows: { userId: string; sentenceId: string }[],
): Promise<void> => {
  for (const r of rows) {
    await supabase
      .from("sentence_progress")
      .update({ redo_requested_at: null } as never)
      .eq("user_id", r.userId)
      .eq("sentence_id", r.sentenceId)
      .is("assignment_id", null);
  }
};

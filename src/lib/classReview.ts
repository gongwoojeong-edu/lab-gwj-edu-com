import { supabase } from "@/integrations/supabase/client";
import { fetchAllPages, fetchInChunks } from "@/lib/paginatedQuery";
import { memoToPlainText } from "@/lib/approvalMemo";
import { isReviewScopeAssigned, type ReviewScope, type ReviewTarget } from "@/lib/classReviewEligibility";

export interface ClassReviewRow {
  id: string;
  sentence_id: string;
  user_id: string;
  approval_id: string | null;
  teacher_id: string | null;
  note: string | null;
  status: "open" | "done";
  created_at: string;
  done_at: string | null;
}

export interface ClassReviewGroup {
  sentenceId: string;
  itemIds: string[];
  studentIds: string[];
  notes: string[];
  teacherIds: string[];
  english: string;
  korean: string | null;
  seriesTitle: string | null;
  volumeNo: number | null;
  textbookTitle: string | null;
  unitNo: number | null;
  unitTitle: string | null;
  passageNo: number | null;
  latestAt: string;
  students: { userId: string; name: string; studentNo: string; translation: string | null }[];
}

/** 선생님은 본인 담당(또는 본인이 표시한) 항목만, 관리자는 전체. */
export function scopeClassReview<T extends { teacher_id: string | null; created_by?: string | null }>(
  rows: T[], viewerId: string | null, isAdmin: boolean,
): T[] {
  if (isAdmin) return rows;
  if (!viewerId) return [];
  return rows.filter(r => r.teacher_id === viewerId || (!r.teacher_id && r.created_by === viewerId));
}

/** 같은 문장은 하나로 묶고 학생 수를 센다. */
export function groupBySentence(rows: ClassReviewRow[]) {
  const map = new Map<string, { sentenceId: string; itemIds: string[]; studentIds: string[]; notes: string[]; teacherIds: string[]; latestAt: string }>();
  for (const r of rows) {
    const g = map.get(r.sentence_id) ?? { sentenceId: r.sentence_id, itemIds: [], studentIds: [], notes: [], teacherIds: [], latestAt: r.created_at };
    g.itemIds.push(r.id);
    if (!g.studentIds.includes(r.user_id)) g.studentIds.push(r.user_id);
    if (r.note?.trim() && !g.notes.includes(r.note.trim())) g.notes.push(r.note.trim());
    if (r.teacher_id && !g.teacherIds.includes(r.teacher_id)) g.teacherIds.push(r.teacher_id);
    if (r.created_at > g.latestAt) g.latestAt = r.created_at;
    map.set(r.sentence_id, g);
  }
  return [...map.values()];
}

/** 학생 이름·학번으로 수업 자료함 문장을 거른다. 검색어가 없으면 전체를 그대로 둔다. */
export function filterGroupsByStudent<T extends { students: { name: string; studentNo?: string }[] }>(
  groups: T[], query: string,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return groups;
  return groups.filter(g => g.students.some(st => `${st.name} ${st.studentNo ?? ""}`.toLowerCase().includes(q)));
}

export interface OpenClassReviewMark { approval_id: string | null; sentence_id: string; user_id: string; created_at: string }

/** 수업으로 지정된 제출은 승인 대기에서 빼고 수업 자료함에서만 다룬다.
 *  지정 이후의 새 제출(다른 승인 행)은 다시 승인 대기에 보인다. */
export function excludeClassQueued<T extends { id: string; sentence_id: string; user_id: string; requested_at: string }>(
  approvals: T[], marks: OpenClassReviewMark[],
): T[] {
  if (!marks.length) return approvals;
  const byApproval = new Set(marks.filter(m => m.approval_id).map(m => m.approval_id as string));
  const legacy = new Map<string, string>();
  for (const m of marks) {
    if (m.approval_id) continue;
    const key = `${m.user_id}|${m.sentence_id}`;
    const prev = legacy.get(key);
    if (!prev || m.created_at > prev) legacy.set(key, m.created_at);
  }
  return approvals.filter(a => {
    if (byApproval.has(a.id)) return false;
    const markedAt = legacy.get(`${a.user_id}|${a.sentence_id}`);
    return !(markedAt && a.requested_at <= markedAt);
  });
}

/** 담당과 무관하게 열린 수업 지정 전체 — 다른 선생님 수업함에 담긴 제출도 승인 대기에서 빠지도록 */
export async function fetchOpenClassReviewMarks(): Promise<OpenClassReviewMark[]> {
  return fetchAllPages<OpenClassReviewMark>((from, to) =>
    supabase.rpc("class_queued_approval_marks").order("approval_id").order("user_id").order("sentence_id").range(from, to) as never);
}

export async function fetchClassReviewForApproval(sentenceId: string, userId: string) {
  const { data, error } = await supabase.from("class_review_items")
    .select("id, teacher_id, note, status").eq("sentence_id", sentenceId).eq("user_id", userId).eq("status", "open");
  if (error) throw error;
  return data ?? [];
}

/** 승인창에서 써 둔 코칭 멘트(저장 형식 문자열)를 수업 표시와 함께 보관할 값으로 바꾼다.
 *  수업완료 시 재학습 안내와 함께 학생 화면·알림에 그대로 전달된다. 비어 있으면 둘 다 null. */
export function classReviewCoachMemo(serialized: string | null | undefined): { coach_memo: string | null; coach_memo_text: string | null } {
  const raw = serialized?.trim() || null;
  const text = raw ? memoToPlainText(raw).trim() : "";
  if (!raw || !text) return { coach_memo: null, coach_memo_text: null };
  return { coach_memo: raw, coach_memo_text: text };
}

export async function addClassReview(input: { sentenceId: string; userId: string; approvalId?: string | null; teacherId: string | null; note?: string | null; coachMemo?: string | null }) {
  const { error } = await supabase.from("class_review_items").upsert({
    sentence_id: input.sentenceId, user_id: input.userId, approval_id: input.approvalId ?? null,
    teacher_id: input.teacherId, note: input.note?.trim() || null, status: "open", done_at: null,
    ...classReviewCoachMemo(input.coachMemo),
  }, { onConflict: "sentence_id,user_id,teacher_id" });
  if (error) throw error;
}

export async function removeClassReview(ids: string[]) {
  if (!ids.length) return;
  const { error } = await supabase.from("class_review_items").delete().in("id", ids);
  if (error) throw error;
}

export async function setClassReviewStatus(ids: string[], status: "open" | "done") {
  if (!ids.length) return;
  if (status === "done") {
    const { error } = await supabase.rpc("complete_class_review_coaching", { p_ids: [...new Set(ids)] });
    if (error) throw error;
    return;
  }
  await fetchInChunks(ids, async (chunk) => {
    const { error } = await supabase.from("class_review_items")
      .update({ status, done_at: null }).in("id", chunk);
    if (error) throw error;
    return [];
  });
}

export interface ClassReviewStudent { user_id: string; display_name: string | null; student_no: string }

export async function fetchClassReviewStudents(viewerId: string, isAdmin: boolean, sentenceIds: string[]) {
  if (!sentenceIds.length) return [];
  const profiles = await fetchAllPages<ClassReviewStudent & ReviewScope>((from, to) => {
    let q = supabase.from("student_profiles").select("user_id, display_name, student_no, start_series_id, start_volume_id, start_unit_id, track_b_enabled, track_b_series_id, track_b_volume_id, track_b_unit_id").eq("orbit_enrollment_active", true);
    if (!isAdmin) q = q.or(`teacher_id.eq.${viewerId},teacher_id.is.null`);
    return q.order("student_no").order("user_id").range(from, to) as never;
  });
  const passages = await fetchInChunks(sentenceIds, chunk => fetchAllPages<{ code: string; unit_id: string }>((from, to) =>
    supabase.from("textbook_passages").select("code,unit_id").in("code", chunk).order("id").range(from, to) as never));
  const unitIds = [...new Set(passages.map(p => p.unit_id))];
  const startIds = profiles.flatMap(p => [p.start_unit_id, p.track_b_unit_id]).filter((id): id is string => !!id);
  const units = await fetchInChunks([...new Set([...unitIds, ...startIds])], async chunk => {
    const { data, error } = await supabase.from("textbook_units").select("id,unit_no,textbook_id").in("id", chunk);
    if (error) throw error; return data ?? [];
  });
  const books = await fetchInChunks([...new Set(units.map(u => u.textbook_id))], async chunk => {
    const { data, error } = await supabase.from("textbooks").select("id,series_id").in("id", chunk);
    if (error) throw error; return data ?? [];
  });
  // 책장 워크북과 동일하게 해당 유닛 배정 또는 학습 기록도 포함한다.
  const [assignments, progress] = await Promise.all([
    fetchInChunks(unitIds, chunk => fetchAllPages<{ student_id: string | null; unit_id: string | null }>((from, to) =>
      supabase.from("assignments").select("student_id,unit_id").in("unit_id", chunk).order("id").range(from, to) as never)),
    fetchInChunks(unitIds, async chunk => {
      const codes = await fetchAllPages<{ code: string }>((from, to) => supabase.from("textbook_passages").select("code").in("unit_id", chunk).order("id").range(from, to) as never);
      return fetchInChunks(codes.map(p => p.code), c => fetchAllPages<{ user_id: string | null; sentence_id: string }>((from, to) => supabase.from("sentence_progress").select("user_id,sentence_id").in("sentence_id", c).order("id").range(from, to) as never));
    }),
  ]);
  const progressCodes = [...new Set(progress.map(p => p.sentence_id))];
  const progressPassages = await fetchInChunks(progressCodes, async chunk => {
    const { data, error } = await supabase.from("textbook_passages").select("code,unit_id").in("code", chunk);
    if (error) throw error; return data ?? [];
  });
  const codeUnits = new Map(progressPassages.map(p => [p.code, p.unit_id]));
  const assigned = new Set(assignments.map(a => `${a.student_id}|${a.unit_id}`));
  progress.forEach(p => assigned.add(`${p.user_id}|${codeUnits.get(p.sentence_id)}`));
  const unitMap = new Map(units.map(u => [u.id, u]));
  const bookMap = new Map(books.map(b => [b.id, b]));
  const targets: ReviewTarget[] = passages.flatMap(p => {
    const u = unitMap.get(p.unit_id); const b = u ? bookMap.get(u.textbook_id) : undefined;
    return u && b ? [{ sentenceId: p.code, unitId: u.id, unitNo: u.unit_no, bookId: b.id, seriesId: b.series_id }] : [];
  });
  if (targets.length !== new Set(sentenceIds).size) throw new Error("문장의 학습 범위를 찾을 수 없습니다");
  return profiles.filter(p => targets.every(target => assigned.has(`${p.user_id}|${target.unitId}`) || isReviewScopeAssigned(p, target, unitMap)));
}

export async function completeClassReviewAttendance(ids: string[], studentIds: string[]) {
  if (!ids.length || !studentIds.length) throw new Error("수업 문장과 참여 학생을 선택해 주세요");
  const { error } = await supabase.rpc("complete_class_review_attendance", {
    p_ids: [...new Set(ids)], p_student_ids: [...new Set(studentIds)],
  });
  if (error) throw error;
}

export async function fetchClassReviewGroups(status: "open" | "done"): Promise<ClassReviewGroup[]> {
  const rows = await fetchAllPages<ClassReviewRow>((from, to) =>
    supabase.from("class_review_items").select("id, sentence_id, user_id, approval_id, teacher_id, note, status, created_at, done_at")
      .eq("status", status).order("created_at", { ascending: false }).order("id").range(from, to) as never);
  const groups = groupBySentence(rows);
  const codes = groups.map(g => g.sentenceId);
  const passages = await fetchInChunks(codes, async (chunk) => {
    const { data, error } = await supabase.from("textbook_passages").select("code, english, korean, passage_no, unit_id").in("code", chunk);
    if (error) throw error;
    return data ?? [];
  });
  const unitIds = passages.map(p => p.unit_id).filter(Boolean) as string[];
  const units = await fetchInChunks(unitIds, async (chunk) => {
    const { data, error } = await supabase.from("textbook_units").select("id, unit_no, title, textbook_id").in("id", chunk);
    if (error) throw error;
    return data ?? [];
  });
  const books = await fetchInChunks(units.map(u => u.textbook_id), async (chunk) => {
    const { data, error } = await supabase.from("textbooks").select("id, title, volume_no, series_id").in("id", chunk);
    if (error) throw error;
    return data ?? [];
  });
  const series = await fetchInChunks(books.map(b => b.series_id), async (chunk) => {
    const { data, error } = await supabase.from("textbook_series").select("id, title").in("id", chunk);
    if (error) throw error;
    return data ?? [];
  });
  const userIds = groups.flatMap(g => g.studentIds);
  const profiles = await fetchInChunks(userIds, async (chunk) => {
    const { data, error } = await supabase.from("student_profiles").select("user_id, display_name, student_no").in("user_id", chunk);
    if (error) throw error;
    return data ?? [];
  });
  const translations = await fetchInChunks(codes, async (chunk) => {
    const { data, error } = await supabase.from("sentence_translations").select("user_id, sentence_id, text, submitted_at")
      .in("sentence_id", chunk).in("user_id", [...new Set(userIds)]).order("submitted_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });
  const profileMap = new Map(profiles.map(p => [p.user_id, { name: p.display_name || p.student_no, studentNo: p.student_no }]));
  const trMap = new Map<string, string>();
  for (const t of translations) { const k = `${t.sentence_id}|${t.user_id}`; if (!trMap.has(k)) trMap.set(k, t.text); }
  const pMap = new Map(passages.map(p => [p.code, p]));
  const uMap = new Map(units.map(u => [u.id, u]));
  const bMap = new Map(books.map(b => [b.id, b]));
  const sMap = new Map(series.map(s => [s.id, s]));
  return groups.map(g => {
    const p = pMap.get(g.sentenceId);
    const u = p ? uMap.get(p.unit_id) : undefined;
    const b = u ? bMap.get(u.textbook_id) : undefined;
    const s = b ? sMap.get(b.series_id) : undefined;
    return {
      ...g,
      english: p?.english ?? g.sentenceId,
      korean: p?.korean ?? null,
      passageNo: p?.passage_no ?? null,
      unitNo: u?.unit_no ?? null, unitTitle: u?.title ?? null,
      textbookTitle: b?.title ?? null, volumeNo: b?.volume_no ?? null,
      seriesTitle: s?.title ?? null,
      students: g.studentIds.map(id => {
        const prof = profileMap.get(id);
        return { userId: id, name: prof?.name ?? "학생", studentNo: prof?.studentNo ?? "", translation: trMap.get(`${g.sentenceId}|${id}`) ?? null };
      }),
    };
  }).sort((a, b) =>
    (a.seriesTitle ?? "").localeCompare(b.seriesTitle ?? "") || (a.volumeNo ?? 0) - (b.volumeNo ?? 0)
    || (a.unitNo ?? 0) - (b.unitNo ?? 0) || (a.passageNo ?? 0) - (b.passageNo ?? 0));
}

import { supabase } from "@/integrations/supabase/client";
import { fetchAllPages, fetchInChunks } from "@/lib/paginatedQuery";

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
  students: { userId: string; name: string; translation: string | null }[];
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

export async function fetchClassReviewForApproval(sentenceId: string, userId: string) {
  const { data, error } = await supabase.from("class_review_items")
    .select("id, teacher_id, note, status").eq("sentence_id", sentenceId).eq("user_id", userId).eq("status", "open");
  if (error) throw error;
  return data ?? [];
}

export async function addClassReview(input: { sentenceId: string; userId: string; approvalId?: string | null; teacherId: string | null; note?: string | null }) {
  const { error } = await supabase.from("class_review_items").upsert({
    sentence_id: input.sentenceId, user_id: input.userId, approval_id: input.approvalId ?? null,
    teacher_id: input.teacherId, note: input.note?.trim() || null, status: "open", done_at: null,
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
  const nameMap = new Map(profiles.map(p => [p.user_id, p.display_name || p.student_no]));
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
      students: g.studentIds.map(id => ({ userId: id, name: nameMap.get(id) ?? "학생", translation: trMap.get(`${g.sentenceId}|${id}`) ?? null })),
    };
  }).sort((a, b) =>
    (a.seriesTitle ?? "").localeCompare(b.seriesTitle ?? "") || (a.volumeNo ?? 0) - (b.volumeNo ?? 0)
    || (a.unitNo ?? 0) - (b.unitNo ?? 0) || (a.passageNo ?? 0) - (b.passageNo ?? 0));
}

// ============================================================
// textbooks — 책장(교재) CRUD 헬퍼. 선생님/관리자만 변경 가능.
// ============================================================
import { supabase } from "@/integrations/supabase/client";
import type { LevelCode } from "@/lib/levels";
import type { SentenceToken } from "@/data/sentences";

export interface Textbook {
  id: string;
  level: LevelCode;
  unit_no: number;
  title: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface Passage {
  id: string;
  textbook_id: string;
  passage_no: number;
  code: string;
  english: string;
  korean: string | null;
  tokens: SentenceToken[] | null;
  analysis_status: "draft" | "ready";
  created_at: string;
  updated_at: string;
}

export interface LevelStats {
  level: LevelCode;
  textbook_count: number;
  passage_count: number;
  ready_count: number;
}

export const fetchAllTextbooks = async (): Promise<Textbook[]> => {
  const { data, error } = await supabase
    .from("textbooks")
    .select("*")
    .order("level")
    .order("unit_no");
  if (error) throw error;
  return (data ?? []) as Textbook[];
};

export const fetchTextbooksByLevel = async (level: LevelCode): Promise<Textbook[]> => {
  const { data, error } = await supabase
    .from("textbooks")
    .select("*")
    .eq("level", level)
    .order("unit_no");
  if (error) throw error;
  return (data ?? []) as Textbook[];
};

export const fetchTextbook = async (
  level: LevelCode,
  unitNo: number,
): Promise<Textbook | null> => {
  const { data, error } = await supabase
    .from("textbooks")
    .select("*")
    .eq("level", level)
    .eq("unit_no", unitNo)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as Textbook | null;
};

export const createTextbook = async (input: {
  level: LevelCode;
  unit_no: number;
  title: string;
  description?: string;
}): Promise<Textbook> => {
  const { data: u } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("textbooks")
    .insert({
      level: input.level,
      unit_no: input.unit_no,
      title: input.title,
      description: input.description ?? null,
      created_by: u.user?.id ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as Textbook;
};

export const fetchPassagesByTextbook = async (
  textbookId: string,
): Promise<Passage[]> => {
  const { data, error } = await supabase
    .from("textbook_passages")
    .select("*")
    .eq("textbook_id", textbookId)
    .order("passage_no");
  if (error) throw error;
  return (data ?? []) as Passage[];
};

export const fetchPassageByCode = async (code: string): Promise<Passage | null> => {
  const { data, error } = await supabase
    .from("textbook_passages")
    .select("*")
    .eq("code", code)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as Passage | null;
};

/**
 * 텍스트 본문을 분할해 일괄 추가.
 * splitMode: 'blank' (빈 줄 기준), 'line' (한 줄=한 지문), 'sentence' (문장 단위)
 */
export const splitPassageText = (
  text: string,
  splitMode: "blank" | "line" | "sentence",
): string[] => {
  const t = text.trim();
  if (!t) return [];
  if (splitMode === "blank") {
    return t.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
  }
  if (splitMode === "line") {
    return t.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  }
  // sentence — 매우 단순한 분할: . ! ? 뒤를 자른다
  return t
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z"'(])/)
    .map((s) => s.trim())
    .filter(Boolean);
};

export const bulkInsertPassages = async (
  textbook: Textbook,
  englishList: string[],
): Promise<Passage[]> => {
  if (englishList.length === 0) return [];
  // 다음 passage_no 결정
  const existing = await fetchPassagesByTextbook(textbook.id);
  const startNo = existing.length > 0 ? Math.max(...existing.map((p) => p.passage_no)) + 1 : 1;
  const rows = englishList.map((english, i) => {
    const no = startNo + i;
    const code = `${textbook.level}-U${textbook.unit_no}-${String(no).padStart(3, "0")}`;
    return {
      textbook_id: textbook.id,
      passage_no: no,
      code,
      english,
      korean: null,
      tokens: null,
      analysis_status: "draft",
    };
  });
  const { data, error } = await supabase
    .from("textbook_passages")
    .insert(rows)
    .select("*");
  if (error) throw error;
  return (data ?? []) as Passage[];
};

export const updatePassageKorean = async (code: string, korean: string): Promise<void> => {
  const { error } = await supabase
    .from("textbook_passages")
    .update({ korean })
    .eq("code", code);
  if (error) throw error;
};

export const deletePassage = async (id: string): Promise<void> => {
  const { error } = await supabase.from("textbook_passages").delete().eq("id", id);
  if (error) throw error;
};

export const fetchLevelStats = async (): Promise<Map<LevelCode, LevelStats>> => {
  const [tbs, passages] = await Promise.all([
    supabase.from("textbooks").select("id, level"),
    supabase.from("textbook_passages").select("textbook_id, analysis_status"),
  ]);
  const map = new Map<LevelCode, LevelStats>();
  const tbToLevel = new Map<string, LevelCode>();
  ((tbs.data ?? []) as { id: string; level: LevelCode }[]).forEach((t) => {
    tbToLevel.set(t.id, t.level);
    if (!map.has(t.level))
      map.set(t.level, { level: t.level, textbook_count: 0, passage_count: 0, ready_count: 0 });
    map.get(t.level)!.textbook_count++;
  });
  ((passages.data ?? []) as { textbook_id: string; analysis_status: string }[]).forEach((p) => {
    const lvl = tbToLevel.get(p.textbook_id);
    if (!lvl) return;
    if (!map.has(lvl))
      map.set(lvl, { level: lvl, textbook_count: 0, passage_count: 0, ready_count: 0 });
    const s = map.get(lvl)!;
    s.passage_count++;
    if (p.analysis_status === "ready") s.ready_count++;
  });
  return map;
};

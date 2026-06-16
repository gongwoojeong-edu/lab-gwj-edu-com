// ============================================================
// textbooks — 책장(시리즈/권/유닛/지문) CRUD 헬퍼.
//
// 5단계 계층:
//   레벨(LevelCode) > 시리즈(textbook_series) > 권(textbooks)
//   > 유닛(textbook_units) > 지문(textbook_passages)
//
// 모든 변경은 선생님/관리자(RLS)만 가능.
// ============================================================
import { supabase } from "@/integrations/supabase/client";
import { getCurrentUserId } from "@/lib/authState";
import type { LevelCode } from "@/lib/levels";
import type { SentenceToken } from "@/data/sentences";
import { reorderNumberedRows, sortPassages } from "@/lib/bookshelfOrder";

// ============================================================
// 타입
// ============================================================

export interface Series {
  id: string;
  level: LevelCode;
  series_no: number;
  title: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

/** "권" — 시리즈 내의 한 책. (DB 테이블 이름은 textbooks) */
export interface Textbook {
  id: string;
  series_id: string;
  level: LevelCode; // 시리즈에서 상속하지만, 편의상 같이 보관됨
  volume_no: number;
  /** 호환용 별칭 (legacy code paths) */
  unit_no: number;
  title: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

/** "유닛" — 권 내의 챕터 단위. (예: 2603모고) */
export interface Unit {
  id: string;
  textbook_id: string;
  unit_no: number;
  title: string;
  description: string | null;
  analysis_pdf_url: string | null;
  analysis_pdf_name: string | null;
  analysis_pdf_uploaded_at: string | null;
  structure_pdf_url: string | null;
  structure_pdf_name: string | null;
  structure_pdf_uploaded_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Passage {
  id: string;
  textbook_id: string; // 권 id (호환용으로 유지)
  unit_id: string;
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
  series_count: number;
  textbook_count: number;
  unit_count: number;
  passage_count: number;
  ready_count: number;
}

// ============================================================
// SERIES (시리즈)
// ============================================================

export const fetchSeriesByLevel = async (level: LevelCode): Promise<Series[]> => {
  const { data, error } = await supabase
    .from("textbook_series")
    .select("*")
    .eq("level", level)
    .order("series_no");
  if (error) throw error;
  return ((data ?? []) as unknown[]) as Series[];
};

export const fetchSeries = async (
  level: LevelCode,
  seriesNo: number,
): Promise<Series | null> => {
  const { data, error } = await supabase
    .from("textbook_series")
    .select("*")
    .eq("level", level)
    .eq("series_no", seriesNo)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as Series | null;
};

export const createSeries = async (input: {
  level: LevelCode;
  series_no: number;
  title: string;
  description?: string;
}): Promise<Series> => {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("textbook_series")
    .insert({
      level: input.level,
      series_no: input.series_no,
      title: input.title,
      description: input.description ?? null,
      created_by: userId,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as unknown as Series;
};

export const updateSeries = async (
  id: string,
  patch: { title?: string; series_no?: number; description?: string | null },
): Promise<void> => {
  const { error } = await supabase.from("textbook_series").update(patch).eq("id", id);
  if (error) throw error;
};

export const deleteSeries = async (id: string): Promise<void> => {
  const { error } = await supabase.from("textbook_series").delete().eq("id", id);
  if (error) throw error;
};

// ============================================================
// TEXTBOOK (권)
// ============================================================

const mapTextbookRow = (row: Record<string, unknown>, level?: LevelCode): Textbook => {
  const volumeNo = (row.volume_no as number) ?? (row.unit_no as number) ?? 1;
  return {
    id: row.id as string,
    series_id: row.series_id as string,
    level: (level ?? (row.level as LevelCode)),
    volume_no: volumeNo,
    unit_no: volumeNo, // 호환 별칭
    title: row.title as string,
    description: (row.description as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
};

export const fetchTextbooksBySeries = async (seriesId: string): Promise<Textbook[]> => {
  const { data, error } = await supabase
    .from("textbooks")
    .select("*")
    .eq("series_id", seriesId)
    .order("volume_no");
  if (error) throw error;
  return (data ?? []).map((r) => mapTextbookRow(r as Record<string, unknown>));
};

export const fetchTextbook = async (
  seriesId: string,
  volumeNo: number,
): Promise<Textbook | null> => {
  const { data, error } = await supabase
    .from("textbooks")
    .select("*")
    .eq("series_id", seriesId)
    .eq("volume_no", volumeNo)
    .maybeSingle();
  if (error) throw error;
  return data ? mapTextbookRow(data as Record<string, unknown>) : null;
};

export const createTextbook = async (input: {
  series_id: string;
  level: LevelCode;
  volume_no: number;
  title: string;
  description?: string;
}): Promise<Textbook> => {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("textbooks")
    .insert({
      series_id: input.series_id,
      level: input.level,
      // 기존 unit_no 컬럼은 NOT NULL이라 volume_no 와 같은 값으로 채움
      unit_no: input.volume_no,
      volume_no: input.volume_no,
      title: input.title,
      description: input.description ?? null,
      created_by: userId,
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapTextbookRow(data as Record<string, unknown>, input.level);
};

export const updateTextbook = async (
  id: string,
  patch: { title?: string; volume_no?: number; description?: string | null },
): Promise<void> => {
  const updatePayload: {
    title?: string;
    description?: string | null;
    volume_no?: number;
    unit_no?: number;
  } = {};
  if (patch.title !== undefined) updatePayload.title = patch.title;
  if (patch.description !== undefined) updatePayload.description = patch.description;
  if (patch.volume_no !== undefined) {
    updatePayload.volume_no = patch.volume_no;
    updatePayload.unit_no = patch.volume_no;
  }
  const { error } = await supabase.from("textbooks").update(updatePayload).eq("id", id);
  if (error) throw error;
};

export const deleteTextbook = async (id: string): Promise<void> => {
  // textbook_units 와 textbook_passages 는 ON DELETE CASCADE 로 자동 삭제됨
  const { error } = await supabase.from("textbooks").delete().eq("id", id);
  if (error) throw error;
};

// ============================================================
// UNIT (유닛)
// ============================================================

export const fetchUnitsByTextbook = async (textbookId: string): Promise<Unit[]> => {
  const { data, error } = await supabase
    .from("textbook_units")
    .select("*")
    .eq("textbook_id", textbookId)
    .order("unit_no");
  if (error) throw error;
  return ((data ?? []) as unknown[]) as Unit[];
};

export const fetchUnit = async (
  textbookId: string,
  unitNo: number,
): Promise<Unit | null> => {
  const { data, error } = await supabase
    .from("textbook_units")
    .select("*")
    .eq("textbook_id", textbookId)
    .eq("unit_no", unitNo)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as Unit | null;
};

export const createUnit = async (input: {
  textbook_id: string;
  unit_no: number;
  title: string;
  description?: string;
}): Promise<Unit> => {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("textbook_units")
    .insert({
      textbook_id: input.textbook_id,
      unit_no: input.unit_no,
      title: input.title,
      description: input.description ?? null,
      created_by: userId,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as unknown as Unit;
};

export const updateUnit = async (
  id: string,
  patch: { title?: string; unit_no?: number; description?: string | null },
): Promise<void> => {
  const { error } = await supabase.from("textbook_units").update(patch).eq("id", id);
  if (error) throw error;
};

export const deleteUnit = async (id: string): Promise<void> => {
  const { error } = await supabase.from("textbook_units").delete().eq("id", id);
  if (error) throw error;
};

// ============================================================
// PASSAGE (지문)
// ============================================================

const mapPassageRow = (row: Record<string, unknown>): Passage => ({
  id: row.id as string,
  textbook_id: row.textbook_id as string,
  unit_id: row.unit_id as string,
  passage_no: row.passage_no as number,
  code: row.code as string,
  english: row.english as string,
  korean: (row.korean as string | null) ?? null,
  tokens: (row.tokens ?? null) as SentenceToken[] | null,
  analysis_status: ((row.analysis_status as string) ?? "draft") as "draft" | "ready",
  created_at: row.created_at as string,
  updated_at: row.updated_at as string,
});

// ============================================================
// 분석자료 PDF 업로드/삭제 (유닛 단위)
// ============================================================

const ANALYSIS_BUCKET = "analysis-materials";

/** 유닛에 클로드 분석 PDF 업로드. Storage 저장 경로를 컬럼에 기록한다. */
export const uploadAnalysisPdf = async (
  unitId: string,
  file: File,
): Promise<Unit> => {
  const ts = Date.now();
  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const path = `${unitId}/${ts}-${safeName}`;
  const { error: upErr } = await supabase.storage
    .from(ANALYSIS_BUCKET)
    .upload(path, file, {
      contentType: file.type || "application/pdf",
      upsert: false,
    });
  if (upErr) throw upErr;
  const { data, error } = await supabase
    .from("textbook_units")
    .update({
      analysis_pdf_url: path,
      analysis_pdf_name: file.name,
      analysis_pdf_uploaded_at: new Date().toISOString(),
    })
    .eq("id", unitId)
    .select("*")
    .single();
  if (error) throw error;
  return data as unknown as Unit;
};

/** 분석 PDF 삭제 — Storage + 컬럼 클리어 (유닛 단위) */
export const deleteAnalysisPdf = async (unit: Unit): Promise<void> => {
  if (unit.analysis_pdf_url) {
    await supabase.storage
      .from(ANALYSIS_BUCKET)
      .remove([unit.analysis_pdf_url])
      .catch(() => undefined);
  }
  const { error } = await supabase
    .from("textbook_units")
    .update({
      analysis_pdf_url: null,
      analysis_pdf_name: null,
      analysis_pdf_uploaded_at: null,
    })
    .eq("id", unit.id);
  if (error) throw error;
};

/** Storage 경로 → 임시 서명 URL (열람·인쇄용, 1시간 유효) */
export const getAnalysisPdfSignedUrl = async (
  storagePath: string,
  expiresInSec = 3600,
): Promise<string | null> => {
  const { data, error } = await supabase.storage
    .from(ANALYSIS_BUCKET)
    .createSignedUrl(storagePath, expiresInSec);
  if (error) return null;
  return data?.signedUrl ?? null;
};

// ============================================================
// 구조도 PDF 업로드/삭제 (유닛 단위) — 분석자료와 동일 버킷 재사용
// ============================================================

/** 유닛에 구조도 PDF 업로드. */
export const uploadStructurePdf = async (
  unitId: string,
  file: File,
): Promise<Unit> => {
  const ts = Date.now();
  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const path = `${unitId}/structure-${ts}-${safeName}`;
  const { error: upErr } = await supabase.storage
    .from(ANALYSIS_BUCKET)
    .upload(path, file, {
      contentType: file.type || "application/pdf",
      upsert: false,
    });
  if (upErr) throw upErr;
  const { data, error } = await supabase
    .from("textbook_units")
    .update({
      structure_pdf_url: path,
      structure_pdf_name: file.name,
      structure_pdf_uploaded_at: new Date().toISOString(),
    })
    .eq("id", unitId)
    .select("*")
    .single();
  if (error) throw error;
  return data as unknown as Unit;
};

/** 구조도 PDF 삭제 — Storage + 컬럼 클리어 */
export const deleteStructurePdf = async (unit: Unit): Promise<void> => {
  if (unit.structure_pdf_url) {
    await supabase.storage
      .from(ANALYSIS_BUCKET)
      .remove([unit.structure_pdf_url])
      .catch(() => undefined);
  }
  const { error } = await supabase
    .from("textbook_units")
    .update({
      structure_pdf_url: null,
      structure_pdf_name: null,
      structure_pdf_uploaded_at: null,
    })
    .eq("id", unit.id);
  if (error) throw error;
};

/** 구조도 PDF 서명 URL */
export const getStructurePdfSignedUrl = async (
  storagePath: string,
  expiresInSec = 3600,
): Promise<string | null> => {
  const { data, error } = await supabase.storage
    .from(ANALYSIS_BUCKET)
    .createSignedUrl(storagePath, expiresInSec);
  if (error) return null;
  return data?.signedUrl ?? null;
};

export const fetchPassagesByUnit = async (unitId: string): Promise<Passage[]> => {
  const { data, error } = await supabase
    .from("textbook_passages")
    .select("*")
    .eq("unit_id", unitId)
    .order("passage_no");
  if (error) throw error;
  return sortPassages((data ?? []).map((r) => mapPassageRow(r as Record<string, unknown>)));
};

export const reorderPassagesInUnit = async (orderedIds: string[]): Promise<void> => {
  if (orderedIds.length === 0) return;
  await reorderNumberedRows("textbook_passages", "passage_no", orderedIds);
};

export const reorderSeriesInLevel = async (orderedIds: string[]): Promise<void> => {
  if (orderedIds.length === 0) return;
  await reorderNumberedRows("textbook_series", "series_no", orderedIds);
};

export const reorderTextbooksInSeries = async (orderedIds: string[]): Promise<void> => {
  if (orderedIds.length === 0) return;
  await reorderNumberedRows("textbooks", "volume_no", orderedIds);
};

export const reorderUnitsInTextbook = async (orderedIds: string[]): Promise<void> => {
  if (orderedIds.length === 0) return;
  await reorderNumberedRows("textbook_units", "unit_no", orderedIds);
};

export const fetchPassageByCode = async (code: string): Promise<Passage | null> => {
  const { data, error } = await supabase
    .from("textbook_passages")
    .select("*")
    .eq("code", code)
    .maybeSingle();
  if (error) throw error;
  return data ? mapPassageRow(data as Record<string, unknown>) : null;
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
  ctx: {
    level: LevelCode;
    series_no: number;
    volume_no: number;
    unit: Unit;
    textbook_id: string;
  },
  englishList: string[],
): Promise<Passage[]> => {
  if (englishList.length === 0) return [];
  const existing = await fetchPassagesByUnit(ctx.unit.id);
  const startNo =
    existing.length > 0 ? Math.max(...existing.map((p) => p.passage_no)) + 1 : 1;
  const rows = englishList.map((english, i) => {
    const no = startNo + i;
    // 코드 형식: L08-S1V1U2603-001  (S=시리즈, V=권, U=유닛, NNN=지문)
    const code = `${ctx.level}-S${ctx.series_no}V${ctx.volume_no}U${ctx.unit.unit_no}-${String(
      no,
    ).padStart(3, "0")}`;
    return {
      textbook_id: ctx.textbook_id,
      unit_id: ctx.unit.id,
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
  return (data ?? []).map((r) => mapPassageRow(r as Record<string, unknown>));
};

export const updatePassageKorean = async (code: string, korean: string): Promise<void> => {
  const { error } = await supabase
    .from("textbook_passages")
    .update({ korean })
    .eq("code", code);
  if (error) throw error;
};

/**
 * 지문 본문(영문/국문) 수정.
 * 영문이 바뀌면 자동으로 다음 캐시를 무효화한다 (옛 영문 기준 데이터가 화면에 새는 것을 방지):
 *  - textbook_passages.tokens → NULL (자동 토큰 캐시)
 *  - sentence_word_extractions 해당 sentence_id 행 → 삭제 (AI 단어추출 캐시)
 *
 * 학생 진행 데이터(번역/분석)는 사용자가 직접 검토할 수 있도록 자동 삭제하지 않는다.
 *
 * @returns { passage, englishChanged, cacheCleared }
 */
export const updatePassage = async (
  id: string,
  patch: { english?: string; korean?: string | null },
): Promise<{ passage: Passage; englishChanged: boolean; cacheCleared: boolean }> => {
  // 변경 전 영문을 먼저 읽어 비교
  let prevEnglish: string | null = null;
  if (typeof patch.english === "string") {
    const { data: prev } = await supabase
      .from("textbook_passages")
      .select("english")
      .eq("id", id)
      .maybeSingle();
    prevEnglish = (prev as { english: string } | null)?.english ?? null;
  }

  const englishChanged =
    typeof patch.english === "string" &&
    prevEnglish !== null &&
    patch.english.trim() !== prevEnglish.trim();

  // 영문이 바뀌면 tokens도 같이 NULL로 리셋한다
  const finalPatch: { english?: string; korean?: string | null; tokens?: null } = {
    ...patch,
  };
  if (englishChanged) finalPatch.tokens = null;

  const { data, error } = await supabase
    .from("textbook_passages")
    .update(finalPatch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  const passage = mapPassageRow(data as Record<string, unknown>);

  // 영문이 바뀐 경우 단어추출 캐시 삭제 (실패해도 본문 수정 자체는 성공으로 본다)
  let cacheCleared = false;
  if (englishChanged) {
    const { error: delErr } = await supabase
      .from("sentence_word_extractions")
      .delete()
      .eq("sentence_id", passage.code);
    cacheCleared = !delErr;
  }

  return { passage, englishChanged, cacheCleared };
};

/**
 * 지문의 파생 캐시(tokens / 단어추출)를 강제로 비운다.
 * 본문은 그대로, 다음 진입 시 새 본문 기준으로 재생성된다.
 */
export const clearPassageDerivedCache = async (
  id: string,
  code: string,
): Promise<void> => {
  await supabase.from("textbook_passages").update({ tokens: null }).eq("id", id);
  await supabase.from("sentence_word_extractions").delete().eq("sentence_id", code);
};

export const deletePassage = async (id: string): Promise<void> => {
  const { error } = await supabase.from("textbook_passages").delete().eq("id", id);
  if (error) throw error;
};

// ============================================================
// 통계
// ============================================================

export const fetchLevelStats = async (): Promise<Map<LevelCode, LevelStats>> => {
  const [seriesRes, tbsRes, unitsRes, passagesRes] = await Promise.all([
    supabase.from("textbook_series").select("id, level"),
    supabase.from("textbooks").select("id, series_id"),
    supabase.from("textbook_units").select("id, textbook_id"),
    supabase.from("textbook_passages").select("unit_id, analysis_status"),
  ]);

  const map = new Map<LevelCode, LevelStats>();
  const ensure = (lvl: LevelCode) => {
    if (!map.has(lvl)) {
      map.set(lvl, {
        level: lvl,
        series_count: 0,
        textbook_count: 0,
        unit_count: 0,
        passage_count: 0,
        ready_count: 0,
      });
    }
    return map.get(lvl)!;
  };

  const seriesToLevel = new Map<string, LevelCode>();
  ((seriesRes.data ?? []) as { id: string; level: LevelCode }[]).forEach((s) => {
    seriesToLevel.set(s.id, s.level);
    ensure(s.level).series_count++;
  });

  const tbToLevel = new Map<string, LevelCode>();
  ((tbsRes.data ?? []) as { id: string; series_id: string }[]).forEach((t) => {
    const lvl = seriesToLevel.get(t.series_id);
    if (!lvl) return;
    tbToLevel.set(t.id, lvl);
    ensure(lvl).textbook_count++;
  });

  const unitToLevel = new Map<string, LevelCode>();
  ((unitsRes.data ?? []) as { id: string; textbook_id: string }[]).forEach((u) => {
    const lvl = tbToLevel.get(u.textbook_id);
    if (!lvl) return;
    unitToLevel.set(u.id, lvl);
    ensure(lvl).unit_count++;
  });

  ((passagesRes.data ?? []) as { unit_id: string; analysis_status: string }[]).forEach(
    (p) => {
      const lvl = unitToLevel.get(p.unit_id);
      if (!lvl) return;
      const s = ensure(lvl);
      s.passage_count++;
      if (p.analysis_status === "ready") s.ready_count++;
    },
  );

  return map;
};

// ============================================================
// 레벨 라벨 (level_labels 테이블 — 표시 이름 오버라이드)
// ============================================================

export type LevelLabelMap = Record<string, string>;

/** DB에서 모든 레벨 라벨 오버라이드 가져오기 */
export const fetchLevelLabels = async (): Promise<LevelLabelMap> => {
  const { data, error } = await supabase
    .from("level_labels")
    .select("level, label");
  if (error) throw error;
  const map: LevelLabelMap = {};
  ((data ?? []) as { level: string; label: string }[]).forEach((r) => {
    map[r.level] = r.label;
  });
  return map;
};

/** 단일 레벨 라벨 upsert */
export const upsertLevelLabel = async (level: string, label: string): Promise<void> => {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("level_labels")
    .upsert(
      {
        level,
        label,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "level" },
    );
  if (error) throw error;
};

// ============================================================
// 이동 헬퍼 — 시리즈/권/유닛/지문을 다른 부모로 옮기기
// ============================================================

/** 시리즈를 다른 레벨로 옮김. (권의 level 컬럼도 같이 갱신) */
export const moveSeriesToLevel = async (
  seriesId: string,
  newLevel: LevelCode,
): Promise<void> => {
  const { error: e1 } = await supabase
    .from("textbook_series")
    .update({ level: newLevel })
    .eq("id", seriesId);
  if (e1) throw e1;
  // 같은 시리즈에 속한 권의 level 컬럼도 동기화
  const { error: e2 } = await supabase
    .from("textbooks")
    .update({ level: newLevel })
    .eq("series_id", seriesId);
  if (e2) throw e2;
};

/** 권을 다른 시리즈로 옮김. (대상 시리즈의 level로 자동 갱신) */
export const moveTextbookToSeries = async (
  textbookId: string,
  newSeriesId: string,
): Promise<void> => {
  const { data: s, error: e0 } = await supabase
    .from("textbook_series")
    .select("level")
    .eq("id", newSeriesId)
    .maybeSingle();
  if (e0) throw e0;
  const lvl = (s?.level ?? null) as LevelCode | null;
  const patch: { series_id: string; level?: LevelCode } = { series_id: newSeriesId };
  if (lvl) patch.level = lvl;
  const { error } = await supabase
    .from("textbooks")
    .update(patch)
    .eq("id", textbookId);
  if (error) throw error;
};

/** 유닛을 다른 권으로 옮김. */
export const moveUnitToTextbook = async (
  unitId: string,
  newTextbookId: string,
): Promise<void> => {
  const { error } = await supabase
    .from("textbook_units")
    .update({ textbook_id: newTextbookId })
    .eq("id", unitId);
  if (error) throw error;
};

/** 지문을 다른 유닛으로 옮김. textbook_id 도 함께 갱신, passage_no 는 대상 유닛 끝번호로 재배정. */
export const movePassageToUnit = async (
  passageId: string,
  newUnitId: string,
): Promise<void> => {
  // 대상 유닛의 textbook_id, 다음 passage_no 조회
  const { data: u, error: e0 } = await supabase
    .from("textbook_units")
    .select("textbook_id")
    .eq("id", newUnitId)
    .maybeSingle();
  if (e0) throw e0;
  if (!u) throw new Error("이동 대상 유닛을 찾을 수 없습니다");
  const { data: ps, error: e1 } = await supabase
    .from("textbook_passages")
    .select("passage_no")
    .eq("unit_id", newUnitId)
    .order("passage_no", { ascending: false })
    .limit(1);
  if (e1) throw e1;
  const nextNo = ((ps?.[0]?.passage_no as number | undefined) ?? 0) + 1;
  const { error } = await supabase
    .from("textbook_passages")
    .update({
      unit_id: newUnitId,
      textbook_id: (u as { textbook_id: string }).textbook_id,
      passage_no: nextNo,
    })
    .eq("id", passageId);
  if (error) throw error;
};

/** 모든 시리즈 가져오기 (이동 대화상자 셀렉터용) */
export const fetchAllSeries = async (): Promise<Series[]> => {
  const { data, error } = await supabase
    .from("textbook_series")
    .select("*")
    .order("level")
    .order("series_no");
  if (error) throw error;
  return ((data ?? []) as unknown[]) as Series[];
};

/** 모든 유닛 가져오기 (이동 대화상자 셀렉터용) */
export const fetchAllUnits = async (): Promise<
  Array<Unit & { textbook_id: string }>
> => {
  const { data, error } = await supabase
    .from("textbook_units")
    .select("*")
    .order("unit_no");
  if (error) throw error;
  return ((data ?? []) as unknown[]) as Array<Unit & { textbook_id: string }>;
};

// ============================================================
// 호환 헬퍼 — 외부 호출부에서 점진 마이그레이션 위해 임시 유지
// ============================================================

/** @deprecated — 모든 권을 한번에 가져옴. Assignments 등 평탄한 목록이 필요한 곳에서 사용. */
export const fetchAllTextbooks = async (): Promise<Textbook[]> => {
  const { data: seriesData } = await supabase
    .from("textbook_series")
    .select("id, level");
  const seriesMap = new Map<string, LevelCode>();
  ((seriesData ?? []) as { id: string; level: LevelCode }[]).forEach((s) =>
    seriesMap.set(s.id, s.level),
  );
  const { data, error } = await supabase
    .from("textbooks")
    .select("*")
    .order("volume_no");
  if (error) throw error;
  return (data ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    return mapTextbookRow(row, seriesMap.get(row.series_id as string));
  });
};

/** @deprecated — 새 코드는 fetchTextbooksBySeries 를 사용하세요. */
export const fetchTextbooksByLevel = async (level: LevelCode): Promise<Textbook[]> => {
  const { data: seriesData } = await supabase
    .from("textbook_series")
    .select("id, level")
    .eq("level", level);
  const seriesIds = (seriesData ?? []).map((s) => (s as { id: string }).id);
  if (seriesIds.length === 0) return [];
  const { data, error } = await supabase
    .from("textbooks")
    .select("*")
    .in("series_id", seriesIds)
    .order("volume_no");
  if (error) throw error;
  return (data ?? []).map((r) => mapTextbookRow(r as Record<string, unknown>, level));
};

/** @deprecated — 새 코드는 fetchPassagesByUnit 을 사용하세요. */
export const fetchPassagesByTextbook = async (textbookId: string): Promise<Passage[]> => {
  const { data: units } = await supabase
    .from("textbook_units")
    .select("id")
    .eq("textbook_id", textbookId);
  const unitIds = (units ?? []).map((u) => (u as { id: string }).id);
  if (unitIds.length === 0) return [];
  const { data, error } = await supabase
    .from("textbook_passages")
    .select("*")
    .in("unit_id", unitIds)
    .order("passage_no");
  if (error) throw error;
  return (data ?? []).map((r) => mapPassageRow(r as Record<string, unknown>));
};

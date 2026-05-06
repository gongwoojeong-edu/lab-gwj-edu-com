import { SENTENCES, type Sentence } from "@/data/sentences";
import { type LevelCode } from "@/lib/levels";
import { supabase } from "@/integrations/supabase/client";
import { fetchMyProfile, updateMyProgress, type StudentProfile } from "@/lib/studentProfile";
import { hydrateSentencesFromDb, loadSentenceByCode } from "@/lib/sentenceSource";

export interface NextSentenceResult {
  sentence: Sentence | null;
  profile: StudentProfile | null;
  done: boolean;
  /** 지정 범위에 등록된 지문 자체가 0개인 경우(학습 자료 미준비) */
  noContent?: boolean;
}

/**
 * 학생 프로필의 시작 범위 지정(start_series_id/volume_id/unit_id)에 해당하는
 * passage code 목록을 DB에서 조회한다. 범위 미지정이면 null 반환(=레벨 전체).
 */
const fetchScopedPassageCodes = async (
  profile: StudentProfile,
): Promise<Set<string> | null> => {
  // 가장 좁은 지정부터 검사
  if (profile.start_unit_id) {
    const { data } = await supabase
      .from("textbook_passages")
      .select("code")
      .eq("unit_id", profile.start_unit_id);
    return new Set(((data ?? []) as { code: string }[]).map((r) => r.code));
  }
  if (profile.start_volume_id) {
    // 권 → 유닛들 → 지문들
    const { data: units } = await supabase
      .from("textbook_units")
      .select("id")
      .eq("textbook_id", profile.start_volume_id);
    const unitIds = ((units ?? []) as { id: string }[]).map((u) => u.id);
    if (unitIds.length === 0) return new Set();
    const { data } = await supabase
      .from("textbook_passages")
      .select("code")
      .in("unit_id", unitIds);
    return new Set(((data ?? []) as { code: string }[]).map((r) => r.code));
  }
  if (profile.start_series_id) {
    // 시리즈 → 권들 → 유닛들 → 지문들
    const { data: vols } = await supabase
      .from("textbooks")
      .select("id")
      .eq("series_id", profile.start_series_id);
    const volIds = ((vols ?? []) as { id: string }[]).map((v) => v.id);
    if (volIds.length === 0) return new Set();
    const { data: units } = await supabase
      .from("textbook_units")
      .select("id")
      .in("textbook_id", volIds);
    const unitIds = ((units ?? []) as { id: string }[]).map((u) => u.id);
    if (unitIds.length === 0) return new Set();
    const { data } = await supabase
      .from("textbook_passages")
      .select("code")
      .in("unit_id", unitIds);
    return new Set(((data ?? []) as { code: string }[]).map((r) => r.code));
  }
  return null; // 범위 미지정 → 레벨 전체
};

export const resolveNextSentence = async (): Promise<NextSentenceResult> => {
  // DB 지문이 SENTENCES에 머지될 때까지 대기 (실패해도 정적 폴백)
  await hydrateSentencesFromDb();
  const profile = await fetchMyProfile();
  if (!profile) return { sentence: null, profile: null, done: false };

  // 선생님이 학생목록에서 지정한 학년(start_level)을 항상 기준으로 삼는다.
  const targetLevel = profile.start_level;

  // pull all passed sentence ids for this user
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return { sentence: null, profile, done: false };
  const { data: passedRows } = await supabase
    .from("sentence_progress")
    .select("sentence_id, status")
    .eq("user_id", u.user.id)
    .in("status", ["pass", "fail"]);
  const passed = new Set(((passedRows ?? []) as { sentence_id: string }[]).map((r) => r.sentence_id));

  // 시작 범위(시리즈/권/유닛) 지정이 있으면 그 code 집합으로 한 번 더 좁힌다.
  const scopedCodes = await fetchScopedPassageCodes(profile);

  // scopedCodes 중 메모리 SENTENCES에 아직 없는 것이 있으면 DB에서 직접 로드해 머지.
  // (sessionStorage 캐시가 stale 한 경우 신규 배정 책의 지문이 누락되는 사고 방지)
  if (scopedCodes && scopedCodes.size > 0) {
    const known = new Set(SENTENCES.map((s) => s.id));
    const missing = [...scopedCodes].filter((c) => !known.has(c));
    if (missing.length > 0) {
      const loaded = await Promise.all(missing.map((c) => loadSentenceByCode(c)));
      for (const s of loaded) {
        if (s) {
          const idx = SENTENCES.findIndex((x) => x.id === s.id);
          if (idx >= 0) SENTENCES[idx] = s;
          else SENTENCES.push(s);
        }
      }
    }
  }

  let inLevel = SENTENCES.filter((s) => s.level === targetLevel).sort((a, b) => a.no - b.no);
  if (scopedCodes) {
    inLevel = inLevel.filter((s) => scopedCodes.has(s.id));
  }

  // 지정 범위에 등록된 지문이 0개 → 학습 자료 미준비 상태(완료가 아님)
  if (inLevel.length === 0) {
    return { sentence: null, profile, done: false, noContent: true };
  }

  const found = inLevel.find((s) => !passed.has(s.id));
  if (found) {
    if (profile.current_level !== targetLevel || profile.current_no !== found.no) {
      await updateMyProgress(targetLevel, found.no);
    }
    return { sentence: found, profile: { ...profile, current_level: targetLevel, current_no: found.no }, done: false };
  }
  if (profile.current_level !== targetLevel) {
    await updateMyProgress(targetLevel, 1);
  }
  return { sentence: null, profile: { ...profile, current_level: targetLevel }, done: true };
};

export const advanceAfterPass = async (justPassed: Sentence): Promise<void> => {
  // 진도(current_level/current_no)는 항상 선생님이 지정한 start_level 기준으로만 갱신.
  // 학생이 링크로 다른 레벨 문장을 풀어도 지정 레벨이 흔들리지 않도록 한다.
  const profile = await fetchMyProfile();
  if (!profile) return;
  if (justPassed.level !== profile.start_level) {
    // 지정 외 레벨 학습은 진도에 반영하지 않음
    return;
  }
  await updateMyProgress(profile.start_level, justPassed.no + 1);
};

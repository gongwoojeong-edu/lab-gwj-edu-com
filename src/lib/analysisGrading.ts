// ============================================================
// analysisGrading.ts — 학생 owner_progress vs 원장(admin) 마스터키 비교
// ============================================================
import { supabase } from "@/integrations/supabase/client";

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

export interface OwnerDiffEntry {
  owner_id: string;
  status: "exact" | "partial" | "miss" | "missing";
  master_pos: string | null;
  student_pos: string | null;
}

export interface AnalysisGradeResult {
  rate: number; // 0~1
  diffs: OwnerDiffEntry[];
  masterCount: number;
  hasMaster: boolean;
  /** 마스터키 기준 "필수 owner"(주절 S/V, 접속절 V)가 모두 학생 progress에 채워졌는지 */
  requiredOwnersFilled: boolean;
  /** 미충족된 필수 owner ID 목록 (학생에게 안내용) */
  missingRequiredOwnerIds: string[];
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

/** 원장(admin) user_id 목록 조회 — 첫 번째 admin을 마스터 소유자로 사용 */
const fetchAdminUserIds = async (): Promise<string[]> => {
  const { data } = await supabase
    .from("user_roles")
    .select("user_id")
    .eq("role", "admin");
  return ((data ?? []) as { user_id: string }[]).map((r) => r.user_id);
};

interface OwnerRow {
  owner_id: string;
  user_id: string | null;
  progress: unknown;
}

/** 마스터키(원장 owner_progress) 조회 */
export const fetchMasterAnswers = async (
  sentenceId: string,
): Promise<Record<string, AnyProgress>> => {
  const adminIds = await fetchAdminUserIds();
  if (adminIds.length === 0) return {};
  const { data } = await supabase
    .from("owner_progress")
    .select("owner_id, user_id, progress")
    .eq("sentence_id", sentenceId)
    .in("user_id", adminIds);
  const rows = (data ?? []) as OwnerRow[];
  const map: Record<string, AnyProgress> = {};
  rows.forEach((r) => {
    if (!map[r.owner_id] && r.progress) {
      map[r.owner_id] = r.progress as AnyProgress;
    }
  });
  return map;
};

/** 학생 본인의 owner_progress 조회 */
export const fetchStudentAnswers = async (
  sentenceId: string,
): Promise<Record<string, AnyProgress>> => {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return {};
  const { data } = await supabase
    .from("owner_progress")
    .select("owner_id, progress")
    .eq("sentence_id", sentenceId)
    .eq("user_id", u.user.id);
  const rows = (data ?? []) as { owner_id: string; progress: unknown }[];
  const map: Record<string, AnyProgress> = {};
  rows.forEach((r) => {
    if (r.progress) map[r.owner_id] = r.progress as AnyProgress;
  });
  return map;
};

/**
 * 마스터 owner가 "필수"인지 판정.
 * 규칙:
 *  - 주절(외곽 절이 아님 = 일반 owner) 중 element가 S 또는 V인 owner
 *  - 접속절(noun.form === "접SV" 또는 etc.kind === "접SV" 등 form="접SV") owner의 element=V
 *  - verb POS owner는 항상 필수 (주절/종속절 모두의 동사)
 */
const isRequiredMaster = (m: AnyProgress): boolean => {
  if (!m || !m.pos) return false;
  if (m.pos === "verb") return true;
  if (m.pos === "noun") {
    const form = m.noun?.form ?? "";
    const el = m.noun?.element ?? "";
    // 접속절: form === "접SV" → 동사 element 필수
    if (form === "접SV" && el === "V") return true;
    // 주절 명사/대명사 중 S 또는 V (V는 보통 verb POS이지만 보강)
    if (el === "S" || el === "V") return true;
  }
  return false;
};

/** 일치율 산출: 완전일치 1.0, POS만 같음 0.4, 누락/불일치 0 */
export const gradeAnalysis = async (sentenceId: string): Promise<AnalysisGradeResult> => {
  const [master, student] = await Promise.all([
    fetchMasterAnswers(sentenceId),
    fetchStudentAnswers(sentenceId),
  ]);
  const masterIds = Object.keys(master);
  if (masterIds.length === 0) {
    return {
      rate: 1,
      diffs: [],
      masterCount: 0,
      hasMaster: false,
      requiredOwnersFilled: true,
      missingRequiredOwnerIds: [],
    };
  }
  const diffs: OwnerDiffEntry[] = [];
  let total = 0;
  const missingRequiredOwnerIds: string[] = [];
  for (const ownerId of masterIds) {
    const m = master[ownerId];
    const s = student[ownerId];
    const required = isRequiredMaster(m);
    if (!s || !s.pos) {
      if (required) missingRequiredOwnerIds.push(ownerId);
      diffs.push({ owner_id: ownerId, status: "missing", master_pos: m.pos, student_pos: null });
      continue;
    }
    if (detailsEqual(m, s)) {
      total += 1.0;
      // exact는 diff에 추가하지 않음(통과한 owner)
      continue;
    }
    if (norm(m.pos) === norm(s.pos) && m.pos) {
      total += 0.4;
      diffs.push({ owner_id: ownerId, status: "partial", master_pos: m.pos, student_pos: s.pos });
    } else {
      diffs.push({ owner_id: ownerId, status: "miss", master_pos: m.pos, student_pos: s.pos });
    }
  }
  return {
    rate: total / masterIds.length,
    diffs,
    masterCount: masterIds.length,
    hasMaster: true,
    requiredOwnersFilled: missingRequiredOwnerIds.length === 0,
    missingRequiredOwnerIds,
  };
};

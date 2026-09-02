// ============================================================
// analysisGrading.ts — 학생 owner_progress vs 원장(admin) 마스터키 비교
// ============================================================
import { supabase } from "@/integrations/supabase/client";
import { getCurrentUserId } from "@/lib/authState";

interface AnyProgress {
  pos: string | null;
  /** 마스터키(정답 입력 모드)에서 선생님이 지정한 "필수 분석 지점" 플래그 */
  required?: boolean;
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
  /** 선생님이 마스터 입력 시 "필수 분석"을 명시 지정한 owner가 1개 이상 있는지 */
  hasExplicitRequired: boolean;
  /** 명시 지정된 필수 owner 수 (0이면 휴리스틱 모드) */
  explicitRequiredCount: number;
}

const norm = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
const OWNER_KEY_SEPARATOR = "::";
const SPAN_PREFIX = "span";

const isSpanOwnerId = (ownerId: string) => ownerId.startsWith(`${SPAN_PREFIX}${OWNER_KEY_SEPARATOR}`);

const parseSpanTokenIds = (ownerId: string): string[] => {
  if (!isSpanOwnerId(ownerId)) return [];
  const parts = ownerId.split(OWNER_KEY_SEPARATOR);
  const range = parts[2];
  if (!range) return [];
  const [s, e] = range.split("-").map((n) => Number(n));
  if (!Number.isFinite(s) || !Number.isFinite(e)) return [];
  const ids: string[] = [];
  for (let i = s; i <= e; i++) ids.push(`w${i}`);
  return ids;
};

const ownerToTokenIds = (ownerId: string): string[] => {
  const spanIds = parseSpanTokenIds(ownerId);
  if (spanIds.length > 0) return spanIds;
  const tokenId = ownerId.includes(OWNER_KEY_SEPARATOR)
    ? ownerId.split(OWNER_KEY_SEPARATOR)[0]
    : ownerId;
  return tokenId ? [tokenId] : [];
};

/** 마스터키 유무에 따라 표기 라벨을 결정 — 모든 화면 공통 사용 */
export const rateLabel = (hasMaster: boolean): "정답률" | "분석률" =>
  hasMaster ? "정답률" : "분석률";

/** sentence_progress.status → 화면 라벨 */
export const statusLabel = (
  s: "pending" | "pass" | "fail" | "hold",
): "PASS" | "미통" | "보류" | "진행중" =>
  ({ pass: "PASS", fail: "미통", hold: "보류", pending: "진행중" } as const)[s];

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

/**
 * 마스터(원장) 분석 "위치"만 조회 — 정답 내용은 포함하지 않는다.
 * 학생은 RLS 때문에 원장 owner_progress 행을 직접 읽을 수 없으므로
 * security definer RPC(master_analysis_spots)로 owner_id + required 플래그만 받는다.
 */
export const fetchMasterSpots = async (
  sentenceId: string,
): Promise<{ ownerIds: string[]; requiredIds: string[] }> => {
  const { data, error } = await supabase.rpc("master_analysis_spots", {
    p_sentence_id: sentenceId,
  });
  if (error || !data) return { ownerIds: [], requiredIds: [] };
  const rows = data as { owner_id: string; required: boolean }[];
  return {
    ownerIds: rows.map((r) => r.owner_id),
    requiredIds: rows.filter((r) => r.required).map((r) => r.owner_id),
  };
};


/** 학생 본인의 owner_progress 조회 */
export const fetchStudentAnswers = async (
  sentenceId: string,
): Promise<Record<string, AnyProgress>> => {
  const userId = await getCurrentUserId();
  if (!userId) return {};
  return fetchStudentAnswersByUserId(sentenceId, userId);
};

/** 특정 학생(userId)의 owner_progress 조회 — 선생님 검토 화면용. RLS op2_select 가 teacher/admin 허용. */
export const fetchStudentAnswersByUserId = async (
  sentenceId: string,
  userId: string,
): Promise<Record<string, AnyProgress>> => {
  const { data } = await supabase
    .from("owner_progress")
    .select("owner_id, progress")
    .eq("sentence_id", sentenceId)
    .eq("user_id", userId);
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

/**
 * 일치율 산출: 완전일치 1.0, POS만 같음 0.4, 누락/불일치 0
 *
 * 옵션:
 *  - fallbackRate: 마스터키가 없을 때 rate로 사용할 값 (0~1).
 *      예) 학생 화면에서 "전체 분석가능 owner 대비 채워진 owner 비율"을 미리 계산해 전달.
 *      미전달 시 기존처럼 1.0(=항상 통과처럼 취급되므로 호출부에서 hasMaster를 같이 확인해야 함).
 */
export const gradeAnalysis = async (
  sentenceId: string,
  opts?: { fallbackRate?: number },
): Promise<AnalysisGradeResult> => {
  const [master, student] = await Promise.all([
    fetchMasterAnswers(sentenceId),
    fetchStudentAnswers(sentenceId),
  ]);
  const masterIds = Object.keys(master);
  const filledStudentTokenIds = new Set<string>();
  Object.entries(student).forEach(([ownerId, answer]) => {
    if (!answer?.pos) return;
    ownerToTokenIds(ownerId).forEach((tokenId) => filledStudentTokenIds.add(tokenId));
  });
  // 분석율은 항상 "단어(token) 기준"으로 호출부에서 산정한 fallbackRate를 사용한다.
  // 이유: 교사 정답이 구/절(span) 단위이고 학생이 단어 단위로 분석한 경우 owner_id가
  // 일치하지 않아 매칭률이 비현실적으로 낮게 나오는 문제(예: 모든 단어 분석 → 48%)를 방지.
  const fb = opts?.fallbackRate;
  const safeRate =
    typeof fb === "number" && Number.isFinite(fb) ? Math.max(0, Math.min(1, fb)) : 1;

  if (masterIds.length === 0) {
    return {
      rate: safeRate,
      diffs: [],
      masterCount: 0,
      hasMaster: false,
      requiredOwnersFilled: true,
      missingRequiredOwnerIds: [],
      hasExplicitRequired: false,
      explicitRequiredCount: 0,
    };
  }

  // 선생님이 마스터 입력 시 "필수 분석"을 명시 지정한 owner가 1개라도 있으면
  // 그 목록만 필수로 본다(휴리스틱 S/V 추정은 사용하지 않음).
  const explicitRequiredIds = masterIds.filter((id) => master[id]?.required === true);
  const hasExplicitRequired = explicitRequiredIds.length > 0;

  // diff/필수 owner 체크는 마스터키 기준으로 수행 (학생 화면 안내·교사 비교용).
  // 단, rate 자체는 단어 기준 fallbackRate로 통일한다.
  const diffs: OwnerDiffEntry[] = [];
  const missingRequiredOwnerIds: string[] = [];
  for (const ownerId of masterIds) {
    const m = master[ownerId];
    const s = student[ownerId];
    const required = hasExplicitRequired
      ? explicitRequiredIds.includes(ownerId)
      : isRequiredMaster(m);
    const spanCoveredByStudentTokens = ownerToTokenIds(ownerId).some((tokenId) =>
      filledStudentTokenIds.has(tokenId),
    );
    if ((!s || !s.pos) && !spanCoveredByStudentTokens) {
      if (required) missingRequiredOwnerIds.push(ownerId);
      diffs.push({ owner_id: ownerId, status: "missing", master_pos: m.pos, student_pos: null });
      continue;
    }
    if (!s || !s.pos) {
      continue;
    }
    if (detailsEqual(m, s)) continue;
    if (norm(m.pos) === norm(s.pos) && m.pos) {
      diffs.push({ owner_id: ownerId, status: "partial", master_pos: m.pos, student_pos: s.pos });
    } else {
      diffs.push({ owner_id: ownerId, status: "miss", master_pos: m.pos, student_pos: s.pos });
    }
  }
  return {
    rate: safeRate,
    diffs,
    masterCount: masterIds.length,
    hasMaster: true,
    // 명시 필수 지점이 있으면 "모두 채워짐"만으로 판정한다(비율 우회 없음).
    // 명시 지점이 없는 기존 자료는 종전 정책(단어 기준 분석률 우선)을 유지한다.
    requiredOwnersFilled: hasExplicitRequired
      ? missingRequiredOwnerIds.length === 0
      : safeRate >= 0.3 || missingRequiredOwnerIds.length === 0,
    missingRequiredOwnerIds,
    hasExplicitRequired,
    explicitRequiredCount: explicitRequiredIds.length,
  };
};

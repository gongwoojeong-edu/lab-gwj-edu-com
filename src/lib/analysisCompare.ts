// ============================================================
// analysisCompare.ts — 마스터키 vs 학생 답안 시각 비교용 헬퍼
// 기존 analysisGrading.ts 의 detailsEqual 규칙을 재사용해
// 빨강(diff) / 회색 점선(missing) owner 집합을 산출한다.
// ============================================================
import {
  fetchMasterAnswers,
  fetchStudentAnswersByUserId,
} from "./analysisGrading";
import type { SentenceToken } from "@/data/sentences";

/** Index.tsx 의 wordUnits 분해 규칙과 동일하게 평탄화 — owner_id::idx 매핑용 */
export interface FlatWordUnit {
  word: string;
  tokenId?: string;
}
export const buildWordUnitsFromTokens = (tokens: SentenceToken[]): FlatWordUnit[] => {
  const out: FlatWordUnit[] = [];
  tokens.forEach((t) => {
    if (t.type === "static" && (t.role === "bracket" || t.role === "punct")) {
      out.push({ word: t.text });
      return;
    }
    const text = t.text;
    const parts = text.split(/\s+/).filter(Boolean);
    parts.forEach((p) => {
      if (t.type === "analyzable") out.push({ word: p, tokenId: t.id });
      else out.push({ word: p });
    });
  });
  return out;
};

/** owner_id → 사람이 읽는 단어/구절 surface */
export const ownerIdToSurface = (
  ownerId: string,
  units: FlatWordUnit[],
): string => {
  const SEP = "::";
  const parts = ownerId.split(SEP);
  // span::{sentenceId}::{start}-{end}
  if (parts[0] === "span" || parts[0] === "__span__") {
    const range = parts[parts.length - 1];
    const [s, e] = range.split("-").map((n) => parseInt(n, 10));
    if (!Number.isFinite(s) || !Number.isFinite(e)) return ownerId;
    const slice = units.slice(s, e + 1).map((u) => u.word).filter(Boolean);
    if (slice.length === 0) return `(${range})`;
    const joined = slice.join(" ");
    return joined.length > 48 ? joined.slice(0, 46) + "…" : joined;
  }
  // {tid}::{idx}  — tid 자체는 보통 "{sentenceId}-{n}" (구분자 없음)
  const last = parts[parts.length - 1];
  const idx = parseInt(last, 10);
  if (Number.isFinite(idx)) {
    const u = units[idx];
    if (u?.word) return u.word;
    // fallback: tokenId 매칭
    const tid = parts.slice(0, -1).join(SEP);
    const byTid = units.filter((x) => x.tokenId === tid).map((x) => x.word);
    if (byTid.length > 0) return byTid.join(" ");
  }
  return ownerId;
};

export interface CompareDetailRow {
  ownerId: string;
  status: "exact" | "partial" | "miss" | "missing" | "extra";
  masterPos: string | null;
  studentPos: string | null;
  surface?: string;
}

export interface CompareDiffResult {
  /** POS 또는 세부 불일치 owner 집합 (빨강 음영) */
  diffOwnerIds: Set<string>;
  /** 학생이 미입력한 마스터 owner 집합 (회색 점선) */
  missingOwnerIds: Set<string>;
  /** 학생이 마스터에 없는 owner를 분석한 집합 */
  extraOwnerIds: Set<string>;
  /** 일치율 0~1 */
  rate: number;
  masterCount: number;
  /** 마스터 답안 존재 여부 */
  hasMaster: boolean;
  details: CompareDetailRow[];
}

const norm = (v: unknown): string => (v === null || v === undefined ? "" : String(v));

interface AnyProgress {
  pos: string | null;
  noun?: { form?: string | null; element?: string | null; role?: string | null; subrole?: string | null };
  adj?: { form?: string | null; element?: string | null; role?: string | null };
  adv?: { form?: string | null; subtype?: string | null; role?: string | null };
  etc?: { kind?: string | null; role?: string | null };
  verb?: {
    number?: string | null;
    tense?: string | null;
    aspect?: string | null;
    voice?: string | null;
    proverb?: string | null;
  };
}

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

export const computeCompareDiff = async (
  sentenceId: string,
  studentUserId: string,
): Promise<CompareDiffResult> => {
  const [master, student] = await Promise.all([
    fetchMasterAnswers(sentenceId),
    fetchStudentAnswersByUserId(sentenceId, studentUserId),
  ]);
  const masterIds = Object.keys(master);
  const diffOwnerIds = new Set<string>();
  const missingOwnerIds = new Set<string>();
  const extraOwnerIds = new Set<string>();
  const details: CompareDetailRow[] = [];
  let total = 0;
  for (const ownerId of masterIds) {
    const m = master[ownerId];
    const s = student[ownerId];
    if (!s || !s.pos) {
      missingOwnerIds.add(ownerId);
      details.push({ ownerId, status: "missing", masterPos: m.pos, studentPos: null });
      continue;
    }
    if (detailsEqual(m, s)) {
      total += 1.0;
      details.push({ ownerId, status: "exact", masterPos: m.pos, studentPos: s.pos });
      continue;
    }
    diffOwnerIds.add(ownerId);
    if (norm(m.pos) === norm(s.pos) && m.pos) {
      total += 0.4;
      details.push({ ownerId, status: "partial", masterPos: m.pos, studentPos: s.pos });
    } else {
      details.push({ ownerId, status: "miss", masterPos: m.pos, studentPos: s.pos });
    }
  }
  // 학생이 마스터에 없는 owner를 분석한 경우 → "extra"
  for (const ownerId of Object.keys(student)) {
    if (master[ownerId]) continue;
    const s = student[ownerId];
    if (!s || !s.pos) continue;
    extraOwnerIds.add(ownerId);
    details.push({ ownerId, status: "extra", masterPos: null, studentPos: s.pos });
  }
  return {
    diffOwnerIds,
    missingOwnerIds,
    extraOwnerIds,
    rate: masterIds.length === 0 ? 1 : total / masterIds.length,
    masterCount: masterIds.length,
    hasMaster: masterIds.length > 0,
    details,
  };
};

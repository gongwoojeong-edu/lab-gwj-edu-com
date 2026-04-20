// ============================================================
// labels.ts — 관리자가 분석 메뉴에서 클릭한 문자열만 가지고
// 부배지(품사 라벨)와 SVOC 배지를 만드는 유틸.
// 절대로 원본 sentences.ts 의 koreanLabel / pos 를 추론하지 않는다.
// AI 추론 0%. 클릭 기록 그대로.
// ============================================================
import type {
  NounProgress,
  AdjProgress,
  AdvProgress,
  EtcProgress,
  VerbProgress,
} from "@/components/analyzer/AnalysisPanel";
import type { POS, SentenceElement } from "@/data/sentences";

export interface OwnerProgress {
  pos: POS | null;
  noun: NounProgress;
  adj: AdjProgress;
  adv: AdvProgress;
  etc: EtcProgress;
  verb: VerbProgress;
  completed: boolean;
}

/**
 * 부배지(품사 라벨) — 분석 메뉴에서 마지막으로 누른 레이어 문자열.
 * 약어/치환 금지. 누른 그대로 노출.
 */
export const buildSubBadgeLabel = (p: OwnerProgress | undefined | null): string | undefined => {
  if (!p || !p.pos) return undefined;

  if (p.pos === "명사") {
    const { form, role, element } = p.noun;
    if (form === "접SV" && role) {
      // 예: "관대 주격" → "관대주격"
      return role.replace(/\s+/g, "");
    }
    if (role) return role;
    if (element) return element;
    if (form) return form;
    return "명사";
  }

  if (p.pos === "형용사") {
    const { form, role, element } = p.adj;
    if (form === "접SV" && role) return role.replace(/\s+/g, "");
    if (role) return role;
    if (element) return element;
    if (form) return form;
    return "형용사";
  }

  if (p.pos === "부사") {
    const { form, role, subtype } = p.adv;
    if (role) return role;
    if (subtype) return subtype;
    if (form) return form;
    return "부사";
  }

  if (p.pos === "기타") {
    const { kind, role } = p.etc;
    if (role) return role;
    if (kind) return kind;
    return "기타";
  }

  if (p.pos === "동사") {
    const { number, tense, aspect, voice, proVerb } = p.verb;
    const parts: string[] = [];
    if (number) parts.push(number);
    if (tense) parts.push(tense);
    if (aspect && aspect.length) parts.push(...aspect);
    if (voice) parts.push("수동");
    if (proVerb) parts.push("대동사");
    if (parts.length === 0) return "동사";
    return parts.join("");
  }

  return undefined;
};

/**
 * SVOC 배지 — 분석 메뉴에서 누른 element 그대로.
 * 동사면 항상 V. 기타면 표시 없음.
 * M 은 표시 안 함 (수식어는 별도 처리 가능).
 */
export const buildElementBadge = (
  p: OwnerProgress | undefined | null,
): "S" | "V" | "O" | "C" | "M" | undefined => {
  if (!p || !p.pos) return undefined;

  if (p.pos === "동사") return "V";

  if (p.pos === "명사") {
    const e = p.noun.element;
    // 예외: V-ing의o / to V의o / 전치사의o 는 부배지만 표시, 하단 SVOC 배지 X
    const role = (p.noun.role ?? "").trim();
    const SUPPRESS_ROLES = new Set(["V-ing의o", "to V의o", "전치사의o"]);
    if (SUPPRESS_ROLES.has(role)) return undefined;
    if (e === "S" || e === "O" || e === "C" || e === "M") return e;
    return undefined;
  }

  if (p.pos === "형용사") {
    const e = p.adj.element;
    if (e === "C" || e === "M") return e;
    // 형용사가 form만 있고 element가 없으면 (관계절 같은) 기본 M
    if (p.adj.form && !e) return "M";
    return undefined;
  }

  if (p.pos === "부사") {
    // 부사는 항상 M
    if (p.adv.form || p.adv.subtype || p.adv.role) return "M";
    return undefined;
  }

  return undefined;
};

/**
 * 절(접SV) 여부 판단 — owner progress 만으로.
 */
export const isClauseProgress = (p: OwnerProgress | undefined | null): boolean => {
  if (!p || !p.pos) return false;
  if (p.pos === "명사" && p.noun.form === "접SV") return true;
  if (p.pos === "형용사" && p.adj.form === "접SV") return true;
  if (p.pos === "부사" && p.adv.form === "접SV") return true;
  return false;
};

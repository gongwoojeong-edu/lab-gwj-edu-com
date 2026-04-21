// ============================================================
// handoutCloze — 마스터키 기반으로 학습지의 어법 선택형 문제를 자동 생성
// ============================================================
import type { SentenceToken } from "@/data/sentences";

export interface ClozeSegment {
  /** 일반 텍스트 또는 클로즈 박스 */
  kind: "text" | "cloze";
  text: string;
  choices?: [string, string];
  /** 정답 인덱스 (0 또는 1). 인쇄용엔 노출하지 않으나 구조 유지용 */
  correctIndex?: 0 | 1;
}

/**
 * tokens 의 답안 정보를 참고하여 어법 선택형 문제를 만든다.
 * 규칙:
 *  - what / that : 명사 form="접SV" 또는 형용사 form="접SV" → 토큰 텍스트가 what/that 인 경우에만
 *  - V-ing / V-ed : 형용사 form="V-ing/PP" 또는 부사 form="ing/pp"
 *  - to V / V-ing : 명사 form="to V" 또는 "V-ing"
 */
export const buildClozeSegments = (
  tokens: SentenceToken[] | null | undefined,
): ClozeSegment[] | null => {
  if (!tokens || tokens.length === 0) return null;
  const segments: ClozeSegment[] = [];

  for (const tok of tokens) {
    if (tok.type !== "analyzable") {
      segments.push({ kind: "text", text: tok.text });
      continue;
    }
    const ans = tok.answer;
    const lower = tok.text.toLowerCase().replace(/[^a-z]/g, "");

    // what / that
    if (
      (ans.pos === "명사" && ans.form === "접SV") ||
      (ans.pos === "형용사" && ans.form === "접SV")
    ) {
      if (lower === "what" || lower === "that") {
        segments.push({
          kind: "cloze",
          text: tok.text,
          choices: ["what", "that"],
          correctIndex: lower === "what" ? 0 : 1,
        });
        continue;
      }
    }

    // V-ing / V-ed (분사)
    if (
      (ans.pos === "형용사" && ans.form === "V-ing/PP") ||
      (ans.pos === "부사" && ans.form === "ing/pp")
    ) {
      const isIng = /ing\b/i.test(tok.text);
      segments.push({
        kind: "cloze",
        text: tok.text,
        choices: ["V-ing", "V-ed"],
        correctIndex: isIng ? 0 : 1,
      });
      continue;
    }

    // to V / V-ing (명사적 용법)
    if (ans.pos === "명사" && (ans.form === "to V" || ans.form === "V-ing")) {
      segments.push({
        kind: "cloze",
        text: tok.text,
        choices: ["to V", "V-ing"],
        correctIndex: ans.form === "to V" ? 0 : 1,
      });
      continue;
    }

    segments.push({ kind: "text", text: tok.text });
  }

  // cloze가 하나도 없으면 텍스트만 반환
  const hasCloze = segments.some((s) => s.kind === "cloze");
  if (!hasCloze) return segments;
  return segments;
};

/**
 * 마스터키 기반 주절 핵심 element 힌트 (S — V — O 형태)
 */
export const buildStructureHint = (
  tokens: SentenceToken[] | null | undefined,
): string | null => {
  if (!tokens) return null;
  const seen = new Set<string>();
  const order: string[] = [];
  for (const tok of tokens) {
    if (tok.type !== "analyzable") continue;
    const ans = tok.answer;
    let el: string | null = null;
    if (ans.pos === "명사" && ans.element) el = ans.element;
    else if (ans.pos === "동사") el = "V";
    else if (ans.pos === "형용사" && ans.element) el = ans.element;
    if (!el) continue;
    if (seen.has(el)) continue;
    seen.add(el);
    order.push(el);
  }
  if (order.length === 0) return null;
  return order.join(" — ");
};

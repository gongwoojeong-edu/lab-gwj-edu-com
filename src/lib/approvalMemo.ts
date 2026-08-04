// ============================================================
// 평가 승인 메모 — 고정 서식 4칸 (라벨 고정, 순서 고정)
//   저장 형식: JSON 문자열 (기존 text 컬럼 memo / last_memo / held_memo 호환)
//   { "no_skipping": "", "no_guessing": "", "grammar_watch": "", "other": "" }
//   기존 자유 텍스트 메모는 파싱 실패 시 "other" 로 흡수 (데이터 손실 없음)
// ============================================================

export const MEMO_FIELD_KEYS = [
  "no_skipping",
  "no_guessing",
  "grammar_watch",
  "other",
] as const;

export type MemoFieldKey = (typeof MEMO_FIELD_KEYS)[number];

export const MEMO_FIELD_LABEL: Record<MemoFieldKey, string> = {
  no_skipping: "No skipping — 있는 단어 빼지말고",
  no_guessing: "No guessing — 없는 단어 넣지 말고",
  grammar_watch: "Grammar Watch — 어법파괴금지",
  other: "Other",
};

export type StructuredMemo = Record<MemoFieldKey, string>;

export const emptyMemo = (): StructuredMemo => ({
  no_skipping: "",
  no_guessing: "",
  grammar_watch: "",
  other: "",
});

/** 저장된 값(JSON 문자열 · 객체 · 자유 텍스트)을 4칸 구조로 파싱 */
export function parseMemo(raw: unknown): StructuredMemo {
  const out = emptyMemo();
  if (raw == null) return out;

  let value: unknown = raw;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return out;
    if (trimmed.startsWith("{")) {
      try {
        value = JSON.parse(trimmed);
      } catch {
        out.other = raw;
        return out;
      }
    } else {
      // 기존 자유 텍스트 메모 → Other 로 보존
      out.other = raw;
      return out;
    }
  }

  if (typeof value === "object" && value !== null) {
    const obj = value as Record<string, unknown>;
    let matched = false;
    MEMO_FIELD_KEYS.forEach((k) => {
      const v = obj[k];
      if (typeof v === "string") {
        out[k] = v;
        if (v.trim()) matched = true;
      }
    });
    if (!matched && !MEMO_FIELD_KEYS.some((k) => k in obj)) {
      out.other = typeof raw === "string" ? raw : JSON.stringify(raw);
    }
    return out;
  }

  out.other = String(raw);
  return out;
}

export function isMemoEmpty(memo: StructuredMemo): boolean {
  return MEMO_FIELD_KEYS.every((k) => !memo[k].trim());
}

/** 저장용 문자열 — 모두 비어 있으면 null */
export function serializeMemo(memo: StructuredMemo): string | null {
  const cleaned = emptyMemo();
  MEMO_FIELD_KEYS.forEach((k) => {
    cleaned[k] = memo[k].trim();
  });
  if (isMemoEmpty(cleaned)) return null;
  return JSON.stringify(cleaned);
}

/** 알림/CSV 등 평문이 필요한 곳 */
export function memoToPlainText(raw: unknown): string {
  const memo = parseMemo(raw);
  return MEMO_FIELD_KEYS.filter((k) => memo[k].trim())
    .map((k) => `[${MEMO_FIELD_LABEL[k]}] ${memo[k].trim()}`)
    .join("\n");
}

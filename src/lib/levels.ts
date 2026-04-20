// 학습 레벨: 초3 ~ 고3 (10단계).
// 문장 코드 형식: L{레벨}-{3자리} → 예: L01-001, L10-042

export const LEVELS = [
  { code: "L01", label: "초3" },
  { code: "L02", label: "초4" },
  { code: "L03", label: "초5" },
  { code: "L04", label: "초6" },
  { code: "L05", label: "중1" },
  { code: "L06", label: "중2" },
  { code: "L07", label: "중3" },
  { code: "L08", label: "고1" },
  { code: "L09", label: "고2" },
  { code: "L10", label: "고3" },
] as const;

export type LevelCode = (typeof LEVELS)[number]["code"];
export type LevelLabel = (typeof LEVELS)[number]["label"];

export const LEVEL_LABEL: Record<LevelCode, LevelLabel> = LEVELS.reduce(
  (acc, l) => ({ ...acc, [l.code]: l.label }),
  {} as Record<LevelCode, LevelLabel>,
);

/** L10-001 형식의 문장 코드 생성 */
export const formatSentenceCode = (level: LevelCode, no: number): string =>
  `${level}-${String(no).padStart(3, "0")}`;

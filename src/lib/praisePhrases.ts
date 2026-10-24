// ============================================================
// praisePhrases.ts — 승인 등급별 칭찬 문구 (매우잘함 / 잘함)
//   - 자동 칭찬 문구: 등급별 배열에서 매번 랜덤 선택
//   - 선생님이 직접 적은 칭찬(praiseText)이 있으면 우선 반환
//   - excellent/good 외 등급은 칭찬 없음 → null
// ============================================================
import type { ApprovalGrade } from "@/lib/sentenceApprovals";

/** 매우잘함 — 강렬하고 임팩트 있는 칭찬 */
export const EXCELLENT_PRAISE: string[] = [
  "🔥 완벽해요! 이 감각 그대로!",
  "🌟 정말 훌륭해요! 완벽한 해석이에요!",
  "💎 압도적 완벽함! 최고예요!",
  "🏆 최고의 실력! 끝내주게 잘했어요!",
  "✨ 이거예요! 완벽하게 해냈어요!",
];

/** 잘함 — 따뜻하고 재미있는 칭찬 */
export const GOOD_PRAISE: string[] = [
  "👍 아주 잘했어요! 실력이 쑥쑥 자라요!",
  "✨ 잘했어요! 지금 흐름이 아주 좋아요!",
  "🌈 참 잘했어요! 조금만 더면 완벽!",
  "🚀 잘 나가고 있어요! 계속 가봅시다!",
  "💚 좋아요! 차곡차곡 잘 쌓이고 있어요!",
];

/** 재학습(추가학습) 지적 사항을 해결하고 통과했을 때 — 끈기·성장 칭찬 */
export const COMEBACK_PRAISE: string[] = [
  "💪 끝까지 해냈어요! 다시 도전해서 통과!",
  "🌱 고친 만큼 실력이 자랐어요! 멋져요!",
  "🔁 포기하지 않은 힘! 결국 해냈네요!",
  "🏅 재학습 완벽 해결! 이게 진짜 실력이에요!",
  "☀️ 다시 붙잡고 끝낸 오늘, 정말 잘했어요!",
];

const pickRandom = (arr: string[]): string =>
  arr[Math.floor(Math.random() * arr.length)] ?? arr[0] ?? "";

/**
 * 칭찬 문구 선택.
 * - praiseText(선생님 직접 칭찬)가 비어있지 않으면 그것을 우선 반환.
 * - 없으면 등급별 자동 칭찬. excellent/good 외는 null.
 */
export const pickPraise = (
  grade: ApprovalGrade | null | undefined,
  praiseText?: string | null,
): string | null => {
  const custom = praiseText?.trim();
  if (custom) return custom;
  if (grade === "excellent") return pickRandom(EXCELLENT_PRAISE);
  if (grade === "good") return pickRandom(GOOD_PRAISE);
  return null;
};

/**
 * 재학습(추가학습) 지적 사항을 해결하고 최종 통과했을 때의 칭찬.
 * - 선생님이 직접 적은 칭찬이 있으면 그것을 우선 반환.
 * - 없으면 재학습 해결 전용 자동 칭찬.
 */
export const pickComebackPraise = (praiseText?: string | null): string => {
  const custom = praiseText?.trim();
  if (custom) return custom;
  return pickRandom(COMEBACK_PRAISE);
};

// ============================================================
// 재학습 회차 멘트 — 승인창 '칭찬 한 줄'에 회차에 따라 자동 삽입된다.
//   재학습 1회차 지정 "다시" / 2회차부터 "견뎌" / 재학습 끝내고 통과 "옳지"
// ============================================================

/** 재학습을 처음 지정할 때 */
export const REDO_MENT_FIRST = "다시";
/** 두 번째 이후 재학습을 지정할 때 */
export const REDO_MENT_SECOND = "견뎌";
/** 재학습 이력이 있는 문장을 통과시켰을 때 */
export const REDO_MENT_SUCCESS = "옳지";

/** 자동 삽입되는 멘트 목록 — 선생님이 직접 입력한 문구와 구분한다 */
export const REDO_MENTS: string[] = [REDO_MENT_FIRST, REDO_MENT_SECOND, REDO_MENT_SUCCESS];

/**
 * 재학습 회차에 따른 자동 멘트.
 * @param redoCount 이 문장의 재학습 지정 횟수 (승인 이력 기준)
 * @param willPass  true = 통과 승인, false = 재학습(redo) 지정
 */
export const pickRedoMent = (redoCount: number, willPass: boolean): string | null => {
  if (willPass) return redoCount > 0 ? REDO_MENT_SUCCESS : null;
  return redoCount <= 0 ? REDO_MENT_FIRST : REDO_MENT_SECOND;
};

/** 비어 있거나 자동 멘트인지 — 직접 입력한 칭찬은 덮어쓰지 않는다 */
export const isAutoRedoMent = (text: string | null | undefined): boolean => {
  const t = text?.trim();
  if (!t) return true;
  return REDO_MENTS.includes(t);
};


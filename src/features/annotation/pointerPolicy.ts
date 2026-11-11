// ============================================================
// pointerPolicy — 판서 입력 허용 규칙 (팜 리젝션)
//   · 펜(애플펜슬)은 항상 허용
//   · 손바닥처럼 넓게 닿은 터치는 '마우스·손' 이 켜져 있어도 무시
//   · 한 획은 처음 닿은 포인터 하나로만 그린다 (다른 손가락/손바닥 이동 무시)
//   · 손가락으로 그리는 중 펜이 닿으면 펜이 우선 (손가락 획 버림)
// ============================================================

/** 이 크기(px) 이상으로 닿은 터치는 손바닥으로 간주 */
export const PALM_CONTACT_PX = 28;

export interface PointerInfo {
  pointerType: string;
  width?: number;
  height?: number;
}

export const isPalmContact = (p: PointerInfo) =>
  p.pointerType === "touch" &&
  Math.max(p.width ?? 0, p.height ?? 0) >= PALM_CONTACT_PX;

export const acceptsPointer = (
  p: PointerInfo,
  opts: { allowMouse: boolean; laser: boolean },
) => {
  if (p.pointerType === "pen") return true;
  if (p.pointerType === "mouse") return opts.allowMouse || opts.laser;
  if (p.pointerType === "touch") return opts.allowMouse && !isPalmContact(p);
  return false;
};

/**
 * 이미 그리는 중인 포인터가 있을 때 새 포인터가 획을 넘겨받는가.
 * 손가락 획 도중 펜이 닿은 경우에만 true.
 */
export const preemptsActive = (activeType: string | null, nextType: string) =>
  activeType === "touch" && nextType === "pen";

// 이 기기에서 애플펜슬을 쓴 적이 있는지 — 있으면 수업 화면도 손가락 필기를 기본으로 끈다
const PEN_SEEN_KEY = "gwjt.annot.penSeen";
export const hasSeenPen = () => {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(PEN_SEEN_KEY) === "1";
  } catch {
    return false;
  }
};
export const markPenSeen = () => {
  try {
    window.localStorage.setItem(PEN_SEEN_KEY, "1");
  } catch {
    /* noop */
  }
};

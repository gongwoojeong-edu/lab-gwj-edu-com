// ============================================================
// 판서 레이어 — 공통 타입
//   · 좌표는 0~1 정규화. 색상은 인덱스로만 저장(브랜드 색 변경 대응)
// ============================================================

export type PenColorIndex = 0 | 1 | 2;

export interface Stroke {
  /** 색상 인덱스 (0 검정 / 1 빨강 / 2 퍼플) */
  c: PenColorIndex;
  /** 기준 굵기 — 캔버스 폭 비율 */
  w: number;
  /** [x, y, pressure] — x,y 는 0~1 */
  p: [number, number, number][];
}

export type Strokes = Stroke[];

/** 인덱스 → 실제 색 (프론트 상수) */
export const PEN_COLORS = ["#2A2A2E", "#C0392B", "#6B5C9E"] as const;

export const PEN_COLOR_LABELS = ["검정", "빨강", "퍼플"] as const;

/** 레이저 포인터 (굿노트식) — 저장되지 않고 잠시 뒤 사라지는 잔상 */
export const LASER_COLOR = "#E60012";
export const LASER_GLOW = "rgba(230,0,18,0.45)";
/** 펜을 뗀 뒤 잔상이 그대로 유지되는 시간(ms) */
export const LASER_HOLD_MS = 600;
/** 유지 시간이 지난 뒤 전체 잔상이 함께 사라지는 시간(ms) */
export const LASER_FADE_MS = 700;

export interface LaserPoint {
  x: number;
  y: number;
  t: number;
}

/** 굵기 2단 — 캔버스 폭 비율 */
export const PEN_WIDTHS = { thin: 0.0025, thick: 0.006 } as const;
export type PenWidthKey = keyof typeof PEN_WIDTHS;

export type AnnotationScope = "teacher" | "student" | "memo";

export interface AnnotationRecord {
  id: string;
  strokes: Strokes;
  aspect: number;
  rev: number;
}

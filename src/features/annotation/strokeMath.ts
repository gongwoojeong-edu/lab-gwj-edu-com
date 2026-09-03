// ============================================================
// 판서 좌표 계산 · 렌더링
//   · 저장: x = clientX / width, y = clientY / height (0~1)
//   · 표시: 현재 캔버스 실측 크기를 곱해 복원. aspect(h/w) 가 다르면 y 보정
// ============================================================
import { PEN_COLORS, type Stroke, type Strokes } from "./types";

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** 두 정규화 점 사이 거리를 픽셀로 환산 */
export const pixelDistance = (
  a: [number, number, number],
  b: [number, number, number],
  width: number,
  height: number,
) => Math.hypot((a[0] - b[0]) * width, (a[1] - b[1]) * height);

/**
 * 저장된 aspect 와 현재 aspect 가 다르면 y 를 보정한다.
 * 필기는 폭 기준으로 그려졌으므로 y * (savedAspect / currentAspect).
 */
export const adjustY = (y: number, savedAspect: number, currentAspect: number) => {
  if (!savedAspect || !currentAspect) return y;
  return y * (savedAspect / currentAspect);
};

interface DrawOptions {
  width: number;
  height: number;
  savedAspect: number;
}

const strokePath = (
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  { width, height, savedAspect }: DrawOptions,
) => {
  const currentAspect = width > 0 ? height / width : 1;
  const pts = stroke.p;
  if (pts.length === 0) return;

  const px = (p: [number, number, number]) => p[0] * width;
  const py = (p: [number, number, number]) => adjustY(p[1], savedAspect, currentAspect) * height;

  const baseWidth = stroke.w * width;
  ctx.strokeStyle = PEN_COLORS[stroke.c] ?? PEN_COLORS[0];
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (pts.length === 1) {
    const pressure = pts[0][2] || 0.5;
    ctx.beginPath();
    ctx.fillStyle = ctx.strokeStyle;
    ctx.arc(px(pts[0]), py(pts[0]), Math.max(0.6, (baseWidth * (0.5 + pressure)) / 2), 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  // 압력에 따라 굵기가 바뀌므로 세그먼트 단위로 그린다 (quadraticCurveTo 스무딩)
  for (let i = 1; i < pts.length; i += 1) {
    const prev = pts[i - 1];
    const cur = pts[i];
    const pressure = cur[2] || 0.5;
    ctx.lineWidth = Math.max(0.6, baseWidth * (0.5 + pressure));
    ctx.beginPath();
    ctx.moveTo(px(prev), py(prev));
    const next = pts[i + 1];
    if (next) {
      // prev → cur 를 제어점으로, cur/next 중점까지 곡선
      ctx.quadraticCurveTo(px(cur), py(cur), (px(cur) + px(next)) / 2, (py(cur) + py(next)) / 2);
    } else {
      ctx.lineTo(px(cur), py(cur));
    }
    ctx.stroke();
  }
};

export const drawStrokes = (
  ctx: CanvasRenderingContext2D,
  strokes: Strokes,
  opts: DrawOptions,
) => {
  ctx.clearRect(0, 0, opts.width, opts.height);
  strokes.forEach((s) => strokePath(ctx, s, opts));
};

/** 지우개 — 클릭 지점 근처를 지나는 스트로크의 인덱스 */
export const hitStrokeIndex = (
  strokes: Strokes,
  point: [number, number],
  width: number,
  height: number,
  savedAspect: number,
  tolerancePx = 12,
): number => {
  const currentAspect = width > 0 ? height / width : 1;
  const tx = point[0] * width;
  const ty = point[1] * height;
  for (let i = strokes.length - 1; i >= 0; i -= 1) {
    const pts = strokes[i].p;
    for (let j = 0; j < pts.length; j += 1) {
      const x = pts[j][0] * width;
      const y = adjustY(pts[j][1], savedAspect, currentAspect) * height;
      if (Math.hypot(x - tx, y - ty) <= tolerancePx) return i;
    }
  }
  return -1;
};

export const strokesBytes = (strokes: Strokes) => JSON.stringify(strokes).length;

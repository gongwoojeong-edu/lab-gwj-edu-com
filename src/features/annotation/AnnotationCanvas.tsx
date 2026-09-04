// ============================================================
// AnnotationCanvas — 카드 1개 위에 절대 배치되는 판서 캔버스
//   · 애플펜슬 전용 (pointerType==='pen'), 손가락은 스크롤 전용 → 팜리젝션
//   · 판서 OFF 면 pointer-events:none 으로 완전 투과
//   · 렌더는 requestAnimationFrame 배치
// ============================================================
import { useCallback, useEffect, useRef } from "react";
import { drawStrokes, clamp01, hitStrokeIndex, pixelDistance } from "./strokeMath";
import {
  LASER_COLOR,
  LASER_FADE_MS,
  LASER_GLOW,
  PEN_WIDTHS,
  type LaserPoint,
  type PenColorIndex,
  type PenWidthKey,
  type Stroke,
  type Strokes,
} from "./types";

interface Props {
  strokes: Strokes;
  /** 저장 당시 aspect (h/w) — 재표시 왜곡 보정용 */
  aspect: number;
  enabled: boolean;
  visible?: boolean;
  eraser?: boolean;
  color?: PenColorIndex;
  width?: PenWidthKey;
  allowMouse?: boolean;
  /** 카드 아래로 확장할 여유 필기 공간 (px) */
  extraBottomPx?: number;
  /** 레이저 포인터 모드 — 저장되지 않고 잔상만 남는다 */
  laser?: boolean;
  /** 원격(선생님) 레이저 좌표 — seq 가 바뀔 때마다 잔상에 추가 */
  laserRemote?: { x: number; y: number; seq: number } | null;
  onLaserPoint?: (x: number, y: number) => void;
  onPreview?: (next: Strokes) => void;
  onCommit?: (next: Strokes, aspect: number) => void;
}

export const AnnotationCanvas = ({
  strokes,
  aspect,
  enabled,
  visible = true,
  eraser = false,
  color = 0,
  width = "thin",
  allowMouse = false,
  extraBottomPx = 72,
  laser = false,
  laserRemote = null,
  onLaserPoint,
  onPreview,
  onCommit,
}: Props) => {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sizeRef = useRef({ w: 0, h: 0 });
  const rafRef = useRef<number | null>(null);
  const drawingRef = useRef<Stroke | null>(null);
  const baseRef = useRef<Strokes>(strokes);
  const strokesRef = useRef<Strokes>(strokes);

  strokesRef.current = strokes;

  const laserRef = useRef<LaserPoint[]>([]);
  const laserRafRef = useRef<number | null>(null);

  const drawLaser = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const now = performance.now();
    const pts = laserRef.current.filter((p) => now - p.t < LASER_FADE_MS);
    laserRef.current = pts;
    if (pts.length === 0) return;

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (let i = 1; i < pts.length; i += 1) {
      const age = (now - pts[i].t) / LASER_FADE_MS;
      const alpha = Math.max(0, 1 - age);
      ctx.globalAlpha = alpha * 0.5;
      ctx.strokeStyle = LASER_GLOW;
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.moveTo(pts[i - 1].x * w, pts[i - 1].y * h);
      ctx.lineTo(pts[i].x * w, pts[i].y * h);
      ctx.stroke();

      ctx.globalAlpha = alpha;
      ctx.strokeStyle = LASER_COLOR;
      ctx.lineWidth = 5;
      ctx.stroke();
    }
    // 헤드 (포인터 점)
    const head = pts[pts.length - 1];
    ctx.globalAlpha = Math.max(0, 1 - (now - head.t) / LASER_FADE_MS);
    ctx.fillStyle = "#fff";
    ctx.shadowColor = LASER_COLOR;
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(head.x * w, head.y * h, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }, []);

  const paint = useCallback(() => {
    rafRef.current = null;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const { w, h } = sizeRef.current;
    if (w === 0 || h === 0) return;
    const list = drawingRef.current
      ? [...baseRef.current, drawingRef.current]
      : strokesRef.current;
    drawStrokes(ctx, list, { width: w, height: h, savedAspect: aspect || 1 });
    drawLaser(ctx, w, h);
  }, [aspect, drawLaser]);

  const schedulePaint = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(paint);
  }, [paint]);

  /** 잔상이 남아 있는 동안 연속 렌더 */
  const runLaserLoop = useCallback(() => {
    if (laserRafRef.current != null) return;
    const tick = () => {
      laserRafRef.current = null;
      paint();
      if (laserRef.current.length > 0) {
        laserRafRef.current = requestAnimationFrame(tick);
      }
    };
    laserRafRef.current = requestAnimationFrame(tick);
  }, [paint]);

  const pushLaser = useCallback(
    (x: number, y: number) => {
      laserRef.current = [...laserRef.current, { x, y, t: performance.now() }].slice(-80);
      runLaserLoop();
    },
    [runLaserLoop],
  );

  // 원격 레이저 수신
  useEffect(() => {
    if (!laserRemote) return;
    pushLaser(laserRemote.x, laserRemote.y);
  }, [laserRemote, pushLaser]);

  useEffect(
    () => () => {
      if (laserRafRef.current != null) cancelAnimationFrame(laserRafRef.current);
    },
    [],
  );

  // 카드 크기 추적
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const apply = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      sizeRef.current = { w: rect.width, h: rect.height };
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      const ctx = canvas.getContext("2d");
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
      schedulePaint();
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(wrap);
    window.addEventListener("orientationchange", apply);
    return () => {
      ro.disconnect();
      window.removeEventListener("orientationchange", apply);
    };
  }, [schedulePaint]);

  useEffect(() => {
    schedulePaint();
  }, [strokes, aspect, visible, schedulePaint]);

  useEffect(
    () => () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  const toPoint = (e: React.PointerEvent | PointerEvent): [number, number, number] => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return [
      clamp01((e.clientX - rect.left) / (rect.width || 1)),
      clamp01((e.clientY - rect.top) / (rect.height || 1)),
      e.pressure || 0.5,
    ];
  };

  const accepts = (e: React.PointerEvent) =>
    e.pointerType === "pen" || (allowMouse && e.pointerType === "mouse");

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!enabled || !accepts(e)) return;
    e.preventDefault();
    const pt = toPoint(e);

    if (eraser) {
      const { w, h } = sizeRef.current;
      const idx = hitStrokeIndex(strokesRef.current, [pt[0], pt[1]], w, h, aspect || 1);
      if (idx >= 0) {
        const next = strokesRef.current.filter((_, i) => i !== idx);
        onCommit?.(next, h > 0 && w > 0 ? h / w : 1);
      }
      return;
    }

    e.currentTarget.setPointerCapture(e.pointerId);
    baseRef.current = strokesRef.current;
    drawingRef.current = { c: color, w: PEN_WIDTHS[width], p: [pt] };
    schedulePaint();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const cur = drawingRef.current;
    if (!enabled || !cur || !accepts(e)) return;
    e.preventDefault();
    const { w, h } = sizeRef.current;
    const raw =
      typeof e.nativeEvent.getCoalescedEvents === "function"
        ? e.nativeEvent.getCoalescedEvents()
        : [e.nativeEvent];
    (raw.length ? raw : [e.nativeEvent]).forEach((ev) => {
      const pt = toPoint(ev);
      const last = cur.p[cur.p.length - 1];
      if (last && pixelDistance(last, pt, w, h) < 2) return; // 미세 이동 버림
      cur.p.push(pt);
    });
    schedulePaint();
  };

  const finish = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const cur = drawingRef.current;
    if (!cur) return;
    drawingRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
    const { w, h } = sizeRef.current;
    const next = [...baseRef.current, cur];
    onPreview?.(next);
    onCommit?.(next, w > 0 ? h / w : 1);
    schedulePaint();
  };

  return (
    <div
      ref={wrapRef}
      className="absolute left-0 right-0 top-0 z-20"
      style={{ bottom: -extraBottomPx, pointerEvents: enabled ? "auto" : "none" }}
    >
      <canvas
        ref={canvasRef}
        className="h-full w-full"
        style={{
          touchAction: enabled ? "none" : "auto",
          pointerEvents: enabled ? "auto" : "none",
          opacity: visible ? 1 : 0,
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={finish}
      />
    </div>
  );
};

// ============================================================
// AnnotationCanvas — 카드 1개 위에 절대 배치되는 판서 캔버스
//   · 애플펜슬 전용 (pointerType==='pen'), 손가락은 스크롤 전용 → 팜리젝션
//   · 판서 OFF 면 pointer-events:none 으로 완전 투과
//   · 렌더는 requestAnimationFrame 배치
// ============================================================
import { useCallback, useEffect, useRef } from "react";
import { drawStrokes, clamp01, eraseAtPoint, pixelDistance } from "./strokeMath";
import {
  LASER_COLOR,
  LASER_FADE_MS,
  LASER_GLOW,
  LASER_HOLD_MS,
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
  /** 지우개 드래그 중 임시 결과 — null 이면 지우는 중 아님 */
  const erasingRef = useRef<Strokes | null>(null);
  const baseRef = useRef<Strokes>(strokes);
  const strokesRef = useRef<Strokes>(strokes);

  strokesRef.current = strokes;

  const laserRef = useRef<LaserPoint[]>([]);
  const laserRafRef = useRef<number | null>(null);
  /** 펜을 뗀 시각 — null 이면 필기 중(잔상 페이드 없이 전부 유지) */
  const laserLiftRef = useRef<number | null>(null);

  const drawLaser = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const now = performance.now();
    const pts = laserRef.current;
    if (pts.length === 0) return;

    // 필기 중에는 잔상 전체 유지. 펜을 떼면 LASER_HOLD_MS 동안 유지 후
    // LASER_FADE_MS 에 걸쳐 전체가 함께 사라진다 (굿노트 레이저 포인터 방식).
    const lift = laserLiftRef.current;
    let alpha = 1;
    if (lift != null) {
      const elapsed = now - lift;
      if (elapsed >= LASER_HOLD_MS) {
        alpha = Math.max(0, 1 - (elapsed - LASER_HOLD_MS) / LASER_FADE_MS);
      }
    }
    if (alpha <= 0) {
      laserRef.current = [];
      return;
    }

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (let i = 1; i < pts.length; i += 1) {
      // 끊어진 구간(새 획 시작 마커: t<0)은 연결하지 않음
      if (pts[i].t < 0 || pts[i - 1].t < 0) continue;
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
    // 헤드 (포인터 점) — 필기 중에만 표시
    if (lift == null) {
      const head = pts[pts.length - 1];
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#fff";
      ctx.shadowColor = LASER_COLOR;
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.arc(head.x * w, head.y * h, 5, 0, Math.PI * 2);
      ctx.fill();
    }
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
      : (erasingRef.current ?? strokesRef.current);
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
      // 펜을 떼기 전까지는 잔상을 잘라내지 않는다 (필기 중 앞 획이 사라지면 안 됨).
      // 넉넉한 상한만 두어 메모리만 보호.
      laserRef.current = [...laserRef.current, { x, y, t: performance.now() }].slice(-20000);
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
    e.pointerType === "pen" || ((allowMouse || laser) && e.pointerType === "mouse");

  const interactive = enabled || laser;

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!interactive || !accepts(e)) return;
    e.preventDefault();
    const pt = toPoint(e);

    if (laser) {
      e.currentTarget.setPointerCapture(e.pointerId);
      laserLiftRef.current = null;
      if (laserRef.current.length > 0) {
        // 이전 획과 연결되지 않도록 끊김 마커 삽입 (잔상은 유지)
        laserRef.current = [...laserRef.current, { x: pt[0], y: pt[1], t: -1 }];
      }
      pushLaser(pt[0], pt[1]);
      onLaserPoint?.(pt[0], pt[1]);
      return;
    }

    if (eraser) {
      e.currentTarget.setPointerCapture(e.pointerId);
      const { w, h } = sizeRef.current;
      erasingRef.current = eraseAtPoint(strokesRef.current, [pt[0], pt[1]], w, h, aspect || 1);
      onPreview?.(erasingRef.current);
      schedulePaint();
      return;
    }

    e.currentTarget.setPointerCapture(e.pointerId);
    baseRef.current = strokesRef.current;
    drawingRef.current = { c: color, w: PEN_WIDTHS[width], p: [pt] };
    schedulePaint();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (eraser && erasingRef.current) {
      if (e.buttons === 0) return;
      e.preventDefault();
      const pt = toPoint(e);
      const { w, h } = sizeRef.current;
      const next = eraseAtPoint(erasingRef.current, [pt[0], pt[1]], w, h, aspect || 1);
      if (next.length !== erasingRef.current.length || next !== erasingRef.current) {
        erasingRef.current = next;
        onPreview?.(next);
        schedulePaint();
      }
      return;
    }
    if (laser) {
      if (!accepts(e) || e.buttons === 0) return;
      e.preventDefault();
      const pt = toPoint(e);
      pushLaser(pt[0], pt[1]);
      onLaserPoint?.(pt[0], pt[1]);
      return;
    }
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
    if (eraser && erasingRef.current) {
      const next = erasingRef.current;
      erasingRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* noop */
      }
      const { w, h } = sizeRef.current;
      onPreview?.(next);
      onCommit?.(next, w > 0 ? h / w : 1);
      schedulePaint();
      return;
    }
    if (laser) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* noop */
      }
      laserLiftRef.current = performance.now(); // 잠시 유지 후 전체 페이드
      runLaserLoop();
      return; // 저장하지 않음
    }
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
      style={{ bottom: -extraBottomPx, pointerEvents: interactive ? "auto" : "none" }}
    >
      <canvas
        ref={canvasRef}
        className="h-full w-full"
        style={{
          touchAction: interactive ? "none" : "auto",
          pointerEvents: interactive ? "auto" : "none",
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

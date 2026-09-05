// ============================================================
// AnnotationToolbar — 펜 / 색 / 굵기 / 지우개 / 되돌리기 / 표시토글
//   · 일괄삭제 버튼 없음 (항목 단위만)
// ============================================================
import { useRef, useState } from "react";
import { Eraser, MousePointer2, Pen, Redo2, RefreshCw, Trash2, Undo2, Eye, EyeOff, Sparkles, GripVertical, ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PEN_COLORS, PEN_COLOR_LABELS, type PenColorIndex, type PenWidthKey } from "./types";
import type { SaveState } from "./useAnnotation";

export interface ToolbarState {
  penMode: boolean;
  /** 레이저 포인터 (저장 안 됨, 잠시 뒤 사라짐) */
  laser: boolean;
  eraser: boolean;
  color: PenColorIndex;
  width: PenWidthKey;
  visible: boolean;
  allowMouse: boolean;
}

interface Props extends ToolbarState {
  saveState: SaveState;
  canUndo: boolean;
  canRedo: boolean;
  showMouseToggle?: boolean;
  onChange: (patch: Partial<ToolbarState>) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClearAll: () => void;
  onRetry: () => void;
  className?: string;
}

const SAVE_DOT: Record<SaveState, string> = {
  idle: "bg-emerald-500",
  dirty: "bg-amber-400",
  saving: "bg-amber-400 animate-pulse",
  error: "bg-destructive",
};

export const AnnotationToolbar = ({
  penMode,
  laser,
  eraser,
  color,
  width,
  visible,
  allowMouse,
  saveState,
  canUndo,
  canRedo,
  showMouseToggle = true,
  onChange,
  onUndo,
  onRedo,
  onClearAll,
  onRetry,
  className,
}: Props) => {
  // 드래그 이동 + 접기 — 툴바가 원문을 가리지 않도록
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [collapsed, setCollapsed] = useState(false);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; baseX: number; baseY: number } | null>(null);

  const onGripPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      baseX: offset.x,
      baseY: offset.y,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onGripPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    setOffset({ x: d.baseX + e.clientX - d.startX, y: d.baseY + e.clientY - d.startY });
  };
  const onGripPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (dragRef.current?.pointerId === e.pointerId) dragRef.current = null;
  };

  if (collapsed) {
    return (
      <div
        className={cn("flex items-center gap-1 rounded-lg border bg-card/95 px-1.5 py-1 shadow-sm", className)}
        style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
      >
        <button
          type="button"
          aria-label="판서 도구 이동"
          className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
          onPointerDown={onGripPointerDown}
          onPointerMove={onGripPointerMove}
          onPointerUp={onGripPointerUp}
          onPointerCancel={onGripPointerUp}
        >
          <GripVertical className="w-4 h-4" />
        </button>
        <Pen className="w-3.5 h-3.5 text-muted-foreground" />
        <button
          type="button"
          aria-label="판서 도구 펼치기"
          className="text-muted-foreground hover:text-foreground"
          onClick={() => setCollapsed(false)}
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
  <div
    className={cn(
      "flex flex-wrap items-center gap-1.5 rounded-lg border bg-card/95 px-2 py-1.5 shadow-sm",
      className,
    )}
    style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
  >
    <button
      type="button"
      aria-label="판서 도구 이동"
      className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
      title="드래그해서 도구 모음 위치 이동"
      onPointerDown={onGripPointerDown}
      onPointerMove={onGripPointerMove}
      onPointerUp={onGripPointerUp}
      onPointerCancel={onGripPointerUp}
    >
      <GripVertical className="w-4 h-4" />
    </button>
    <Button
      type="button"
      size="sm"
      variant={penMode ? "default" : "outline"}
      className="h-8 gap-1.5"
      onClick={() => onChange({ penMode: !penMode, eraser: false, laser: false })}
    >
      <Pen className="w-3.5 h-3.5" />
      판서 {penMode ? "ON" : "OFF"}
    </Button>

    {penMode && (
      <>
        <span className="mx-0.5 h-5 w-px bg-border" />
        {/* 펜 종류 선택: 펜 / 레이저 / 지우개 */}
        <Button
          type="button"
          size="sm"
          variant={!laser && !eraser ? "secondary" : "ghost"}
          className="h-8 gap-1 px-2 text-xs"
          onClick={() => onChange({ laser: false, eraser: false })}
          title="펜 — 색상·굵기를 선택해 필기합니다"
        >
          <Pen className="w-3.5 h-3.5" />
          펜
        </Button>
        <Button
          type="button"
          size="sm"
          variant={laser ? "secondary" : "ghost"}
          className="h-8 gap-1 px-2 text-xs"
          onClick={() => onChange({ laser: true, eraser: false })}
          title="레이저 포인터 — 잠시 뒤 사라지고 저장되지 않습니다"
        >
          <Sparkles className="w-3.5 h-3.5" />
          레이저
        </Button>
        <Button
          type="button"
          size="sm"
          variant={eraser ? "secondary" : "ghost"}
          className="h-8 px-2"
          onClick={() => onChange({ eraser: true, laser: false })}
          title="부분 지우개 — 펜이 닿는 부분만 지웁니다"
        >
          <Eraser className="w-3.5 h-3.5" />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 px-2 text-destructive hover:text-destructive"
          title="전체 지우기 — 모든 필기를 지웁니다"
          onClick={() => {
            if (window.confirm("모든 필기를 지울까요?")) onClearAll();
          }}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>


        {!laser && (
          <>
            <span className="mx-0.5 h-5 w-px bg-border" />
            {PEN_COLORS.map((hex, i) => (
          <button
            key={hex}
            type="button"
            aria-label={PEN_COLOR_LABELS[i]}
            onClick={() => onChange({ color: i as PenColorIndex, eraser: false, laser: false })}
            className={cn(
              "h-6 w-6 rounded-full border-2 transition",
              color === i && !eraser ? "border-foreground scale-110" : "border-transparent",
            )}
            style={{ backgroundColor: hex }}
          />
        ))}

            <span className="mx-0.5 h-5 w-px bg-border" />
            {(["thin", "thick"] as PenWidthKey[]).map((k) => (
              <Button
                key={k}
                type="button"
                size="sm"
                variant={width === k ? "secondary" : "ghost"}
                className="h-8 px-2 text-xs"
                onClick={() => onChange({ width: k, eraser: false, laser: false })}
              >
                {k === "thin" ? "얇게" : "굵게"}
              </Button>
            ))}
          </>
        )}

        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 px-2"
          disabled={!canUndo}
          onClick={onUndo}
        >
          <Undo2 className="w-3.5 h-3.5" />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 px-2"
          disabled={!canRedo}
          onClick={onRedo}
        >
          <Redo2 className="w-3.5 h-3.5" />
        </Button>

        {showMouseToggle && (
          <Button
            type="button"
            size="sm"
            variant={allowMouse ? "secondary" : "ghost"}
            className="h-8 gap-1 px-2 text-xs"
            onClick={() => onChange({ allowMouse: !allowMouse })}
            title="마우스로도 그리기"
          >
            <MousePointer2 className="w-3.5 h-3.5" />
            마우스
          </Button>
        )}
      </>
    )}

    <span className="mx-0.5 h-5 w-px bg-border" />
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className="h-8 px-2"
      onClick={() => onChange({ visible: !visible })}
      title={visible ? "판서 숨기기" : "판서 보기"}
    >
      {visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
    </Button>

    <span className={cn("ml-1 h-2 w-2 rounded-full", SAVE_DOT[saveState])} title={saveState} />
    {saveState === "error" && (
      <Button type="button" size="sm" variant="ghost" className="h-8 gap-1 px-2 text-xs" onClick={onRetry}>
        <RefreshCw className="w-3.5 h-3.5" />
        재시도
      </Button>
    )}

    <Button
      type="button"
      size="sm"
      variant="ghost"
      className="h-8 px-2"
      onClick={() => setCollapsed(true)}
      title="도구 모음 접기"
    >
      <ChevronUp className="w-3.5 h-3.5" />
    </Button>
  </div>
  );
};

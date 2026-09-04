// ============================================================
// AnnotationToolbar — 펜 / 색 / 굵기 / 지우개 / 되돌리기 / 표시토글
//   · 일괄삭제 버튼 없음 (항목 단위만)
// ============================================================
import { Eraser, MousePointer2, Pen, Redo2, RefreshCw, Undo2, Eye, EyeOff, Sparkles } from "lucide-react";
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
  onRetry,
  className,
}: Props) => (
  <div
    className={cn(
      "flex flex-wrap items-center gap-1.5 rounded-lg border bg-card/95 px-2 py-1.5 shadow-sm",
      className,
    )}
  >
    <Button
      type="button"
      size="sm"
      variant={penMode ? "default" : "outline"}
      className="h-8 gap-1.5"
      onClick={() => onChange({ penMode: !penMode, eraser: false })}
    >
      <Pen className="w-3.5 h-3.5" />
      판서 {penMode ? "ON" : "OFF"}
    </Button>

    {penMode && (
      <>
        <span className="mx-0.5 h-5 w-px bg-border" />
        {PEN_COLORS.map((hex, i) => (
          <button
            key={hex}
            type="button"
            aria-label={PEN_COLOR_LABELS[i]}
            onClick={() => onChange({ color: i as PenColorIndex, eraser: false })}
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
            onClick={() => onChange({ width: k, eraser: false })}
          >
            {k === "thin" ? "얇게" : "굵게"}
          </Button>
        ))}

        <Button
          type="button"
          size="sm"
          variant={eraser ? "secondary" : "ghost"}
          className="h-8 px-2"
          onClick={() => onChange({ eraser: !eraser })}
          title="획 단위 지우개"
        >
          <Eraser className="w-3.5 h-3.5" />
        </Button>

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
  </div>
);

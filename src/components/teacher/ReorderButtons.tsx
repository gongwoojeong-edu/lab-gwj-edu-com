import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  onMoveUp: () => void;
  onMoveDown: () => void;
  disableUp?: boolean;
  disableDown?: boolean;
  saving?: boolean;
  className?: string;
}

/** 책장 카테고리/지문 순서 변경 (↑↓) */
export const ReorderButtons = ({
  onMoveUp,
  onMoveDown,
  disableUp,
  disableDown,
  saving,
  className,
}: Props) => (
  <div className={cn("inline-flex flex-col gap-0.5", className)}>
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-6 w-6"
      disabled={disableUp || saving}
      onClick={onMoveUp}
      title="위로"
      aria-label="위로 이동"
    >
      {saving ? <Loader2 className="size-3 animate-spin" /> : <ChevronUp className="size-3.5" />}
    </Button>
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-6 w-6"
      disabled={disableDown || saving}
      title="아래로"
      aria-label="아래로 이동"
    >
      <ChevronDown className="size-3.5" />
    </Button>
  </div>
);

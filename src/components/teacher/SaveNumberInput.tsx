import { useEffect, useState } from "react";
import { Check, Loader2, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface SaveNumberInputProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  ariaLabel?: string;
  className?: string;
  /** Returns true on success, false on failure. May throw. */
  onSave: (next: number) => Promise<boolean | void>;
}

type Status = "idle" | "saving" | "saved" | "error";

/**
 * 안정적인 숫자 입력 + 자동 저장 컴포넌트.
 * - 입력은 controlled state 로 관리 (defaultValue 의 stale 문제 방지)
 * - blur 또는 Enter 키에 저장
 * - 실패 시 1회 재시도, 그래도 실패하면 원래 값으로 복구하고 시각적 경고
 */
export const SaveNumberInput = ({
  value,
  min,
  max,
  step = 5,
  suffix,
  ariaLabel,
  className,
  onSave,
}: SaveNumberInputProps) => {
  const [text, setText] = useState(String(value));
  const [status, setStatus] = useState<Status>("idle");

  // 외부 value 가 변경되면 (다른 곳에서 동기화) 그대로 반영
  useEffect(() => {
    setText(String(value));
  }, [value]);

  const clamp = (n: number) => Math.max(min, Math.min(max, Math.round(n)));

  const commit = async () => {
    const parsed = Number(text);
    if (Number.isNaN(parsed)) {
      setText(String(value));
      return;
    }
    const next = clamp(parsed);
    setText(String(next));
    if (next === value) return;

    setStatus("saving");
    let ok = false;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await onSave(next);
        if (result !== false) {
          ok = true;
          break;
        }
      } catch {
        /* retry */
      }
    }
    if (ok) {
      setStatus("saved");
      window.setTimeout(() => setStatus("idle"), 1200);
    } else {
      setStatus("error");
      setText(String(value));
      window.setTimeout(() => setStatus("idle"), 2000);
    }
  };

  return (
    <div className={cn("inline-flex items-center gap-1.5", className)}>
      <Input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={step}
        value={text}
        aria-label={ariaLabel}
        disabled={status === "saving"}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          } else if (e.key === "Escape") {
            setText(String(value));
            (e.target as HTMLInputElement).blur();
          }
        }}
        className={cn(
          "h-9 w-20 text-center font-bold tabular-nums text-base",
          status === "saving" && "opacity-70",
          status === "error" && "border-destructive ring-1 ring-destructive",
          status === "saved" && "border-emerald-500 ring-1 ring-emerald-400/60",
        )}
      />
      <span className="inline-flex items-center text-xs text-muted-foreground min-w-[28px]">
        {status === "saving" && <Loader2 className="size-3.5 animate-spin text-primary" />}
        {status === "saved" && <Check className="size-3.5 text-emerald-500" />}
        {status === "error" && <AlertTriangle className="size-3.5 text-destructive" />}
        {status === "idle" && (suffix ?? "")}
      </span>
    </div>
  );
};

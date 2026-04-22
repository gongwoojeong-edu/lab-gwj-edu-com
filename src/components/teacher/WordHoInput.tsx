import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  upsertHandoutResult,
  WORD_HO_PASS_THRESHOLD,
  type HandoutResult,
} from "@/lib/handoutResults";
import { toast } from "sonner";

interface Props {
  userId: string;
  teacherId: string | null;
  testDate: string;
  /** 문장별 행을 분리할 때 전달. 미전달 시 sentence_id=null 행 사용. */
  sentenceId?: string | null;
  current: HandoutResult | null;
  onSaved: (row: HandoutResult) => void;
  onEnterNext?: () => void;
  registerInput?: (userId: string, el: HTMLInputElement | null) => void;
  /** true 면 수정 불가(회색). 인쇄 전 등 잠금 상태에 사용. */
  disabled?: boolean;
}

type Status = "idle" | "saving" | "saved" | "error";

/** "8/10" → 80, "85" → 85, "" → null */
const parseScoreInput = (raw: string): number | null | "INVALID" => {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  // a/b 형태
  const m = trimmed.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  if (m) {
    const num = Number(m[1]);
    const den = Number(m[2]);
    if (!Number.isFinite(num) || !Number.isFinite(den) || den <= 0) return "INVALID";
    const pct = Math.round((num / den) * 100);
    if (pct < 0 || pct > 100) return "INVALID";
    return pct;
  }
  const n = Number(trimmed);
  if (Number.isNaN(n) || n < 0 || n > 100) return "INVALID";
  return n;
};

const WordHoInput = forwardRef<HTMLInputElement, Props>(function WordHoInput(
  {
    userId,
    teacherId,
    testDate,
    sentenceId,
    current,
    onSaved,
    onEnterNext,
    registerInput,
    disabled,
  },
  ref,
) {
  const [val, setVal] = useState<string>(
    current?.word_ho_score != null ? String(current.word_ho_score) : "",
  );
  const [status, setStatus] = useState<Status>("idle");
  const inputRef = useRef<HTMLInputElement>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);

  useEffect(() => {
    setVal(current?.word_ho_score != null ? String(current.word_ho_score) : "");
  }, [current?.id, current?.word_ho_score]);

  useEffect(() => {
    registerInput?.(userId, inputRef.current);
    return () => registerInput?.(userId, null);
  }, [userId, registerInput]);

  const flashSaved = () => {
    setStatus("saved");
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setStatus("idle"), 1200);
  };

  const save = async () => {
    const parsed = parseScoreInput(val);
    if (parsed === "INVALID") {
      setStatus("error");
      toast.error("0~100 점수 또는 8/10 형식을 입력하세요");
      return;
    }
    // 정규화: a/b → 80 처럼 입력란에도 반영
    if (parsed != null && String(parsed) !== val.trim()) {
      setVal(String(parsed));
    }
    if ((current?.word_ho_score ?? null) === parsed) return;
    setStatus("saving");
    try {
      const row = await upsertHandoutResult({
        userId,
        teacherId,
        testDate,
        sentenceId: sentenceId ?? null,
        wordHoScore: parsed,
      });
      onSaved(row);
      flashSaved();
    } catch (e) {
      setStatus("error");
      toast.error("저장 실패", { description: (e as Error).message });
    }
  };

  const parsedPreview = parseScoreInput(val);
  const numeric =
    parsedPreview === "INVALID" || parsedPreview == null ? null : parsedPreview;
  const isLow =
    numeric != null && numeric < WORD_HO_PASS_THRESHOLD;

  return (
    <div className="flex items-center gap-2">
      <Input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        value={val}
        disabled={disabled}
        onChange={(e) => setVal(e.target.value)}
        onBlur={() => {
          if (!disabled) void save();
        }}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "Enter") {
            e.preventDefault();
            save().then(() => onEnterNext?.());
          }
        }}
        className={cn(
          "h-9 w-24 text-center text-base font-semibold tabular-nums",
          status === "error" && "border-destructive",
          isLow && status !== "error" && "border-amber-500 text-amber-700",
          disabled && "bg-muted/50 text-muted-foreground cursor-not-allowed",
        )}
        placeholder={disabled ? "—" : "85 또는 8/10"}
        title={disabled ? "인쇄 후 입력 가능" : "점수 또는 a/b 형식 입력"}
      />
      {isLow && !disabled && (
        <span className="text-[10px] font-bold text-amber-600 tracking-wide">
          재시
        </span>
      )}
      <div className="w-4 flex items-center justify-center">
        {status === "saving" && (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
        )}
        {status === "saved" && (
          <Check className="w-3.5 h-3.5 text-primary animate-fade-in" />
        )}
      </div>
    </div>
  );
});

export default WordHoInput;

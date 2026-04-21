import { useEffect, useRef, useState } from "react";
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
  current: HandoutResult | null;
  onSaved: (row: HandoutResult) => void;
  onEnterNext?: () => void;
  registerInput?: (userId: string, el: HTMLInputElement | null) => void;
}

type Status = "idle" | "saving" | "saved" | "error";

const WordHoInput = ({
  userId,
  teacherId,
  testDate,
  current,
  onSaved,
  onEnterNext,
  registerInput,
}: Props) => {
  const [val, setVal] = useState<string>(
    current?.word_ho_score != null ? String(current.word_ho_score) : "",
  );
  const [status, setStatus] = useState<Status>("idle");
  const inputRef = useRef<HTMLInputElement>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    const trimmed = val.trim();
    const num = trimmed === "" ? null : Number(trimmed);
    if (num != null && (Number.isNaN(num) || num < 0 || num > 100)) {
      setStatus("error");
      toast.error("0~100 사이 숫자를 입력하세요");
      return;
    }
    if ((current?.word_ho_score ?? null) === num) return;
    setStatus("saving");
    try {
      const row = await upsertHandoutResult({
        userId,
        teacherId,
        testDate,
        wordHoScore: num,
      });
      onSaved(row);
      flashSaved();
    } catch (e) {
      setStatus("error");
      toast.error("저장 실패", { description: (e as Error).message });
    }
  };

  const numeric = val.trim() === "" ? null : Number(val);
  const isLow =
    numeric != null && !Number.isNaN(numeric) && numeric < WORD_HO_PASS_THRESHOLD;

  return (
    <div className="flex items-center gap-2">
      <Input
        ref={inputRef}
        type="number"
        min={0}
        max={100}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            save().then(() => onEnterNext?.());
          }
        }}
        className={cn(
          "h-8 w-16 text-center text-sm tabular-nums",
          status === "error" && "border-destructive focus-visible:ring-destructive",
          isLow &&
            status !== "error" &&
            "border-amber-500 focus-visible:ring-amber-500",
        )}
        placeholder="—"
      />
      {isLow && (
        <span className="text-[10px] font-bold text-amber-600">재시</span>
      )}
      <div className="w-4 flex items-center justify-center">
        {status === "saving" && (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
        )}
        {status === "saved" && (
          <Check className="w-3.5 h-3.5 text-emerald-500 animate-fade-in" />
        )}
      </div>
    </div>
  );
};

export default WordHoInput;

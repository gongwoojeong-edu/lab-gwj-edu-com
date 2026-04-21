import { useEffect, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { upsertHandoutResult, type HandoutResult } from "@/lib/handoutResults";
import { toast } from "sonner";

interface Props {
  userId: string;
  teacherId: string | null;
  testDate: string;
  current: HandoutResult | null;
  /** Called after a successful save with the updated row. */
  onSaved: (row: HandoutResult) => void;
  /** Move focus to the next student's word input on Enter. */
  onEnterNext?: () => void;
  /** Register the word input ref by user_id. */
  registerInput?: (userId: string, el: HTMLInputElement | null) => void;
}

type Status = "idle" | "saving" | "saved" | "error";

const HandoutInputRow = ({
  userId,
  teacherId,
  testDate,
  current,
  onSaved,
  onEnterNext,
  registerInput,
}: Props) => {
  const [wordVal, setWordVal] = useState<string>(
    current?.word_ho_score != null ? String(current.word_ho_score) : "",
  );
  const [syntaxVal, setSyntaxVal] = useState<"PASS" | "FAIL" | null>(
    current?.syntax_ho_result ?? null,
  );
  const [status, setStatus] = useState<Status>("idle");
  const inputRef = useRef<HTMLInputElement>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setWordVal(current?.word_ho_score != null ? String(current.word_ho_score) : "");
    setSyntaxVal(current?.syntax_ho_result ?? null);
  }, [current?.id, current?.word_ho_score, current?.syntax_ho_result]);

  useEffect(() => {
    registerInput?.(userId, inputRef.current);
    return () => registerInput?.(userId, null);
  }, [userId, registerInput]);

  const flashSaved = () => {
    setStatus("saved");
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setStatus("idle"), 1200);
  };

  const saveWord = async () => {
    const trimmed = wordVal.trim();
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

  const saveSyntax = async (next: "PASS" | "FAIL") => {
    const newVal = syntaxVal === next ? null : next; // toggle off
    setSyntaxVal(newVal);
    setStatus("saving");
    try {
      const row = await upsertHandoutResult({
        userId,
        teacherId,
        testDate,
        syntaxHoResult: newVal,
      });
      onSaved(row);
      flashSaved();
    } catch (e) {
      setStatus("error");
      toast.error("저장 실패", { description: (e as Error).message });
    }
  };

  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <Input
          ref={inputRef}
          type="number"
          min={0}
          max={100}
          value={wordVal}
          onChange={(e) => setWordVal(e.target.value)}
          onBlur={saveWord}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              saveWord().then(() => onEnterNext?.());
            }
          }}
          className={cn(
            "h-8 w-16 text-center text-sm tabular-nums",
            status === "error" && "border-destructive focus-visible:ring-destructive",
          )}
          placeholder="—"
        />
      </div>
      <div className="flex gap-1">
        <Button
          type="button"
          size="sm"
          variant={syntaxVal === "PASS" ? "default" : "outline"}
          className={cn(
            "h-8 w-8 p-0 text-xs font-bold",
            syntaxVal === "PASS" && "bg-emerald-600 hover:bg-emerald-700",
          )}
          onClick={() => saveSyntax("PASS")}
        >
          P
        </Button>
        <Button
          type="button"
          size="sm"
          variant={syntaxVal === "FAIL" ? "default" : "outline"}
          className={cn(
            "h-8 w-8 p-0 text-xs font-bold",
            syntaxVal === "FAIL" && "bg-amber-600 hover:bg-amber-700",
          )}
          onClick={() => saveSyntax("FAIL")}
        >
          F
        </Button>
      </div>
      <div className="w-4 flex items-center justify-center">
        {status === "saving" && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
        {status === "saved" && <Check className="w-3.5 h-3.5 text-emerald-500 animate-fade-in" />}
      </div>
    </div>
  );
};

export default HandoutInputRow;

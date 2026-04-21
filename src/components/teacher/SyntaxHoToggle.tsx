import { useEffect, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { upsertHandoutResult, type HandoutResult } from "@/lib/handoutResults";
import { toast } from "sonner";

interface Props {
  userId: string;
  teacherId: string | null;
  testDate: string;
  current: HandoutResult | null;
  onSaved: (row: HandoutResult) => void;
}

type Status = "idle" | "saving" | "saved" | "error";

const SyntaxHoToggle = ({
  userId,
  teacherId,
  testDate,
  current,
  onSaved,
}: Props) => {
  const [val, setVal] = useState<"PASS" | "FAIL" | null>(
    current?.syntax_ho_result ?? null,
  );
  const [status, setStatus] = useState<Status>("idle");
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setVal(current?.syntax_ho_result ?? null);
  }, [current?.id, current?.syntax_ho_result]);

  const flashSaved = () => {
    setStatus("saved");
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setStatus("idle"), 1200);
  };

  const save = async (next: "PASS" | "FAIL") => {
    const newVal = val === next ? null : next; // toggle off
    setVal(newVal);
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

  // Segmented control 스타일
  const segBtn = (active: boolean, tone: "pass" | "fail") =>
    cn(
      "h-8 w-10 text-xs font-bold rounded-md transition-colors",
      "flex items-center justify-center",
      active
        ? tone === "pass"
          ? "bg-primary text-primary-foreground shadow-sm"
          : "bg-amber-500 text-white shadow-sm"
        : "text-muted-foreground hover:bg-primary/5",
    );

  return (
    <div className="flex items-center gap-2">
      <div className="inline-flex items-center gap-0.5 rounded-lg border border-input bg-muted/30 p-0.5">
        <button
          type="button"
          className={segBtn(val === "PASS", "pass")}
          onClick={() => save("PASS")}
          aria-pressed={val === "PASS"}
        >
          P
        </button>
        <button
          type="button"
          className={segBtn(val === "FAIL", "fail")}
          onClick={() => save("FAIL")}
          aria-pressed={val === "FAIL"}
        >
          F
        </button>
      </div>
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
};

export default SyntaxHoToggle;

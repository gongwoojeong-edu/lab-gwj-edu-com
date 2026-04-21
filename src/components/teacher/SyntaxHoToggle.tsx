import { useEffect, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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

  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-1">
        <Button
          type="button"
          size="sm"
          variant={val === "PASS" ? "default" : "outline"}
          className={cn(
            "h-8 w-8 p-0 text-xs font-bold",
            val === "PASS" && "bg-emerald-600 hover:bg-emerald-700",
          )}
          onClick={() => save("PASS")}
        >
          P
        </Button>
        <Button
          type="button"
          size="sm"
          variant={val === "FAIL" ? "default" : "outline"}
          className={cn(
            "h-8 w-8 p-0 text-xs font-bold",
            val === "FAIL" && "bg-amber-600 hover:bg-amber-700",
          )}
          onClick={() => save("FAIL")}
        >
          F
        </Button>
      </div>
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

export default SyntaxHoToggle;

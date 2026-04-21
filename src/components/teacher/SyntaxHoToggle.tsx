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

  const cycle = async () => {
    // null → PASS → FAIL → null
    const next: "PASS" | "FAIL" | null =
      val === null ? "PASS" : val === "PASS" ? "FAIL" : null;
    setVal(next);
    setStatus("saving");
    try {
      const row = await upsertHandoutResult({
        userId,
        teacherId,
        testDate,
        syntaxHoResult: next,
      });
      onSaved(row);
      flashSaved();
    } catch (e) {
      setStatus("error");
      toast.error("저장 실패", { description: (e as Error).message });
    }
  };

  const label = val === "PASS" ? "P" : val === "FAIL" ? "F" : "—";
  const tone =
    val === "PASS"
      ? "bg-primary text-primary-foreground hover:bg-primary/90"
      : val === "FAIL"
        ? "bg-amber-500 text-white hover:bg-amber-500/90"
        : "bg-muted text-muted-foreground hover:bg-muted/80";

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        size="sm"
        onClick={cycle}
        className={cn("h-9 w-12 font-bold text-base", tone)}
      >
        {label}
      </Button>
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

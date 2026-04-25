// ============================================================
// WorkbookModeToggle — 학생별 워크북 인쇄 모드 토글 (공용)
// unit_only(유닛만) ↔ both(유닛+문장)
// 한 곳에서 변경하면 student_profiles.unit_workbook_mode 가 바뀌어
// 다른 모든 화면(과제/요청확인/학습결과/책장)에 즉시 반영된다.
// ============================================================
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";

export type WorkbookMode = "unit_only" | "both";

interface Props {
  userId: string;
  value: WorkbookMode;
  studentLabel?: string;
  size?: "sm" | "md";
  onChange?: (mode: WorkbookMode) => void;
  className?: string;
}

export const WorkbookModeToggle = ({
  userId,
  value,
  studentLabel,
  size = "sm",
  onChange,
  className,
}: Props) => {
  const [current, setCurrent] = useState<WorkbookMode>(value);
  const [saving, setSaving] = useState(false);

  const handleChange = async (next: string) => {
    const mode = (next === "unit_only" ? "unit_only" : "both") as WorkbookMode;
    if (mode === current) return;
    const prev = current;
    setCurrent(mode);
    setSaving(true);
    try {
      const { error } = await supabase
        .from("student_profiles")
        .update({ unit_workbook_mode: mode })
        .eq("user_id", userId);
      if (error) throw error;
      toast({
        title: `📘 ${studentLabel ? studentLabel + " " : ""}워크북 모드: ${mode === "unit_only" ? "유닛만" : "유닛+문장"}`,
      });
      onChange?.(mode);
    } catch (e) {
      setCurrent(prev);
      toast({ title: "저장 실패", description: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const triggerCls =
    size === "md"
      ? "h-9 w-32 text-sm"
      : "h-7 w-24 text-xs";

  return (
    <Select value={current} onValueChange={handleChange} disabled={saving}>
      <SelectTrigger className={`${triggerCls} ${className ?? ""}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="both">유닛+문장</SelectItem>
        <SelectItem value="unit_only">유닛만</SelectItem>
      </SelectContent>
    </Select>
  );
};

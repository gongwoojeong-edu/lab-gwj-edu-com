import { Switch } from "@/components/ui/switch";
import { ShieldCheck } from "lucide-react";
import { useHintSettings } from "./HintSettingsContext";

/**
 * 헤더에 노출되는 디렉터(원장) 전용 학생별 힌트 토글.
 * 추후 학생 관리 페이지로 이전될 예정 — 현재는 데모용 글로벌 토글.
 */
export const AdminHintToggle = () => {
  const { hintEnabled, setHintEnabled, isAdmin } = useHintSettings();
  if (!isAdmin) return null;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-card border border-border shadow-sm">
      <ShieldCheck className="size-3.5 text-primary" />
      <span className="text-[11px] font-semibold text-foreground font-kr">
        힌트 허용
      </span>
      <Switch
        checked={hintEnabled}
        onCheckedChange={setHintEnabled}
        className="scale-75 -mx-1"
        aria-label="학생 한글 힌트 허용"
      />
    </div>
  );
};

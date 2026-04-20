import { Switch } from "@/components/ui/switch";
import { ShieldCheck, Spline, MousePointer2 } from "lucide-react";
import { useHintSettings } from "./HintSettingsContext";

/**
 * 헤더에 노출되는 디렉터(원장) 전용 토글 모음.
 * - 학생별 한글 힌트 허용
 * - 수식선(화살표) 표시
 * - 지시어(대명사) 화살표 표시
 */
export const AdminHintToggle = () => {
  const {
    hintEnabled,
    setHintEnabled,
    isAdmin,
    showModifierArrows,
    setShowModifierArrows,
    showReferentArrows,
    setShowReferentArrows,
  } = useHintSettings();
  if (!isAdmin) return null;

  return (
    <div className="flex items-center gap-2">
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
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-card border border-border shadow-sm">
        <Spline className="size-3.5 text-primary" />
        <span className="text-[11px] font-semibold text-foreground font-kr">
          수식선 표시
        </span>
        <Switch
          checked={showModifierArrows}
          onCheckedChange={setShowModifierArrows}
          className="scale-75 -mx-1"
          aria-label="수식 화살표 overlay 표시"
        />
      </div>
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-card border border-border shadow-sm">
        <MousePointer2 className="size-3.5 text-muted-foreground" />
        <span className="text-[11px] font-semibold text-foreground font-kr">
          지시어 표시
        </span>
        <Switch
          checked={showReferentArrows}
          onCheckedChange={setShowReferentArrows}
          className="scale-75 -mx-1"
          aria-label="대명사 지시어 화살표 overlay 표시"
        />
      </div>
    </div>
  );
};

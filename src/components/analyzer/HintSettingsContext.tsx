import { createContext, useContext, useState, type ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";

/**
 * 학생별 힌트(한국어 번역) + Admin 표시 옵션 컨텍스트.
 * isAdmin은 실제 user_roles 기반으로 판정한다 (admin || teacher).
 *
 * 정책 변경: 분석된 화살표(수식선/지시어)는 항상 표시.
 * showModifierArrows / showReferentArrows 는 호환을 위해 남기되 항상 true 고정.
 */
interface HintSettings {
  hintEnabled: boolean;
  setHintEnabled: (v: boolean) => void;
  /** 디렉터(원장)/선생님 전용 토글이 노출되는지 여부 */
  isAdmin: boolean;
  /** 항상 true (호환용) */
  showModifierArrows: boolean;
  setShowModifierArrows: (v: boolean) => void;
  showReferentArrows: boolean;
  setShowReferentArrows: (v: boolean) => void;
}

const HintSettingsContext = createContext<HintSettings | null>(null);

const noop = () => {};

export const HintSettingsProvider = ({ children }: { children: ReactNode }) => {
  const [hintEnabled, setHintEnabled] = useState(true);
  const { roles } = useAuth();
  const isAdmin = roles.includes("admin") || roles.includes("teacher");
  return (
    <HintSettingsContext.Provider
      value={{
        hintEnabled,
        setHintEnabled,
        isAdmin,
        showModifierArrows: true,
        setShowModifierArrows: noop,
        showReferentArrows: true,
        setShowReferentArrows: noop,
      }}
    >
      {children}
    </HintSettingsContext.Provider>
  );
};

export const useHintSettings = () => {
  const ctx = useContext(HintSettingsContext);
  if (!ctx) throw new Error("useHintSettings must be used within HintSettingsProvider");
  return ctx;
};

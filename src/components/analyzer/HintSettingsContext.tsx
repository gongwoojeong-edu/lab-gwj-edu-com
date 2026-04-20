import { createContext, useContext, useState, type ReactNode } from "react";

/**
 * 학생별 힌트(한국어 번역) + Admin 표시 옵션 컨텍스트.
 * 추후 Lovable Cloud의 student.settings 와 연동될 예정.
 */
interface HintSettings {
  hintEnabled: boolean;
  setHintEnabled: (v: boolean) => void;
  /** 디렉터(원장) 전용 토글이 노출되는지 여부 — 데모용 항상 true */
  isAdmin: boolean;
  /** 수식 화살표 overlay 표시 여부 (Admin 토글) */
  showModifierArrows: boolean;
  setShowModifierArrows: (v: boolean) => void;
  /** 대명사 지시어 화살표 overlay 표시 여부 (Admin 토글) */
  showReferentArrows: boolean;
  setShowReferentArrows: (v: boolean) => void;
}

const HintSettingsContext = createContext<HintSettings | null>(null);

export const HintSettingsProvider = ({ children }: { children: ReactNode }) => {
  const [hintEnabled, setHintEnabled] = useState(true);
  const [showModifierArrows, setShowModifierArrows] = useState(true);
  const [showReferentArrows, setShowReferentArrows] = useState(true);
  return (
    <HintSettingsContext.Provider
      value={{
        hintEnabled,
        setHintEnabled,
        isAdmin: true,
        showModifierArrows,
        setShowModifierArrows,
        showReferentArrows,
        setShowReferentArrows,
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

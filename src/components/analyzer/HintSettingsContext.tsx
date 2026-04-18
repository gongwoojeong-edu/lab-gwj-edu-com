import { createContext, useContext, useState, type ReactNode } from "react";

/**
 * 학생별 힌트(한국어 번역) 사용 권한 컨텍스트.
 * 추후 Lovable Cloud의 student.settings.hintEnabled 컬럼과 연동될 예정.
 * 현재는 클라이언트 상태로 Admin 토글을 시뮬레이션한다.
 */
interface HintSettings {
  hintEnabled: boolean;
  setHintEnabled: (v: boolean) => void;
  /** 디렉터(원장) 전용 토글이 노출되는지 여부 — 데모용 항상 true */
  isAdmin: boolean;
}

const HintSettingsContext = createContext<HintSettings | null>(null);

export const HintSettingsProvider = ({ children }: { children: ReactNode }) => {
  const [hintEnabled, setHintEnabled] = useState(true);
  return (
    <HintSettingsContext.Provider value={{ hintEnabled, setHintEnabled, isAdmin: true }}>
      {children}
    </HintSettingsContext.Provider>
  );
};

export const useHintSettings = () => {
  const ctx = useContext(HintSettingsContext);
  if (!ctx) throw new Error("useHintSettings must be used within HintSettingsProvider");
  return ctx;
};

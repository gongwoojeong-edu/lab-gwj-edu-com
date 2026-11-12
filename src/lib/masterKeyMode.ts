// ============================================================
// masterKeyMode.ts — 요청함 "마스터 등록"(?master=1) 진입 규칙 (순수 모듈)
// 마스터키 = 구문 분석 + 한글 해석. 단어 학습·단어 테스트는 건너뛴다.
// 학생이 주소만 바꿔 단어 단계를 건너뛰지 못하도록 선생님/관리자만 인정한다.
// ============================================================

export type StepFlags = { pre: boolean; analysis: boolean; translation: boolean; wordtest: boolean };

export const isMasterKeyMode = (search: string, roles: readonly string[]): boolean => {
  const staff = roles.includes("teacher") || roles.includes("admin");
  return staff && new URLSearchParams(search).get("master") === "1";
};

/** 마스터 등록 모드에서는 분석·한글 해석만 켠다. */
export const applyMasterKeyFlags = (flags: StepFlags, masterMode: boolean): StepFlags =>
  masterMode ? { pre: false, wordtest: false, analysis: true, translation: true } : flags;

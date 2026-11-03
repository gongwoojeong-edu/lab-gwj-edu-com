/**
 * 핵심 분석 지점 규칙 — 학생 화면 음영(분석 안내)은 이 규칙에 맞는 곳과
 * 선생님이 ★필수로 지정한 곳에만 칠한다.
 * 동사 / 준동사(to V, V-ing, PP) / 접속사(접SV 절, 기타>접속) / 특수구문(기타>도치·생략·동격·명령문 등).
 * DB 함수 master_analysis_spots 의 core 컬럼과 같은 규칙이다.
 */
export const VERBAL_OR_CLAUSE_FORMS = ["to V", "V-ing", "V-ing/PP", "V-ed", "PP", "접SV"];

export const isCoreAnalysisSpot = (p: unknown): boolean => {
  if (!p || typeof p !== "object") return false;
  const v = p as { pos?: string; form?: string; kind?: string };
  if (v.pos === "동사") return true;
  if (v.form && VERBAL_OR_CLAUSE_FORMS.includes(v.form)) return true;
  if (v.pos === "기타" && !!v.kind) return true;
  return false;
};

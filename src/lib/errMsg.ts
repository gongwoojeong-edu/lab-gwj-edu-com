// 표준 에러 메시지 추출기 — Supabase 에러 객체 / Error / string 모두 안전 처리
export const errMsg = (e: unknown): string => {
  if (!e) return "알 수 없는 오류";
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  if (typeof e === "object") {
    const o = e as { message?: string; error_description?: string; details?: string; hint?: string };
    return (
      o.message ?? o.error_description ?? o.details ?? o.hint ?? JSON.stringify(e)
    );
  }
  return String(e);
};

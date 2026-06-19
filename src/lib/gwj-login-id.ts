/** 단어·잉글랩·공우정구문랩 공통 로그인 ID 규칙 */

export const GWJ_LOGIN = {
  student: {
    prefix: "gwj",
    digits: 4,
    label: "학번 (숫자 4자리)",
    placeholder: "0001",
  },
  teacher: {
    prefix: "gwjt",
    digits: 3,
    label: "번호 (숫자 3자리)",
    placeholder: "001",
  },
} as const;

export function digitsOnly(raw: string, maxLen: number): string {
  return raw.replace(/\D/g, "").slice(0, maxLen);
}

export function buildLoginId(
  role: keyof typeof GWJ_LOGIN,
  digits: string,
): string | null {
  const cfg = GWJ_LOGIN[role];
  const d = digitsOnly(digits, cfg.digits);
  if (d.length !== cfg.digits) return null;
  return `${cfg.prefix}${d}`;
}

export function loginIdToAuthEmail(loginId: string): string {
  const id = loginId.trim().toLowerCase();
  if (!id || id.length < 4) return "";
  return `${id}@gwj.local`;
}

/** 아이디 + 마지막 숫자 한 번 더 (gwj0222 → gwj02222, gwjt512 → gwjt5122) */
export function defaultPasswordFromLoginId(loginId: string): string {
  const t = loginId.trim().toLowerCase();
  const last = t.match(/\d$/)?.[0];
  return last ? `${t}${last}` : t;
}

export function isGwjTeacherAuthEmail(email: string): boolean {
  return /^gwjt[0-9]+@gwj\.local$/i.test(email.trim());
}

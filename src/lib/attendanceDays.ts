// ============================================================
// attendanceDays — Orbit 반 요일 → 오늘 등원 판정
// ============================================================

export type WeekdayCode = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";

const JS_DAY_TO_CODE: WeekdayCode[] = [
  "SUN",
  "MON",
  "TUE",
  "WED",
  "THU",
  "FRI",
  "SAT",
];

const TOKEN_MAP: Record<string, WeekdayCode> = {
  MON: "MON",
  MONDAY: "MON",
  TUE: "TUE",
  TUES: "TUE",
  TUESDAY: "TUE",
  WED: "WED",
  WEDNESDAY: "WED",
  THU: "THU",
  THUR: "THU",
  THURS: "THU",
  THURSDAY: "THU",
  FRI: "FRI",
  FRIDAY: "FRI",
  SAT: "SAT",
  SATURDAY: "SAT",
  SUN: "SUN",
  SUNDAY: "SUN",
  월: "MON",
  화: "TUE",
  수: "WED",
  목: "THU",
  금: "FRI",
  토: "SAT",
  일: "SUN",
};

export const WEEKDAY_LABEL: Record<WeekdayCode, string> = {
  MON: "월",
  TUE: "화",
  WED: "수",
  THU: "목",
  FRI: "금",
  SAT: "토",
  SUN: "일",
};

export function normalizeDayToken(raw: string): WeekdayCode | null {
  const t = raw.trim().toUpperCase();
  if (!t) return null;
  if (TOKEN_MAP[t]) return TOKEN_MAP[t];
  // 한글 한 글자
  if (TOKEN_MAP[raw.trim()]) return TOKEN_MAP[raw.trim()];
  return null;
}

/** Orbit/DB에서 온 값을 WeekdayCode[] 로 정규화. 파싱 실패·빈값 → null */
export function parseOrbitDays(input: unknown): WeekdayCode[] | null {
  if (input == null) return null;
  const out: WeekdayCode[] = [];
  const push = (code: WeekdayCode | null) => {
    if (code && !out.includes(code)) out.push(code);
  };

  if (Array.isArray(input)) {
    input.forEach((v) => {
      if (typeof v === "string") push(normalizeDayToken(v));
      else if (typeof v === "number") {
        // 0=일 … 6=토 (JS) 또는 1=월 … 7=일
        if (v >= 0 && v <= 6) push(JS_DAY_TO_CODE[v]);
        else if (v >= 1 && v <= 7) push(JS_DAY_TO_CODE[v % 7]);
      }
    });
  } else if (typeof input === "string") {
    const s = input.trim();
    if (!s) return null;
    // "MON,TUE" / "월화수목" / "월·화·수"
    const parts = s.split(/[,|/\s·･]+/).filter(Boolean);
    if (parts.length > 1) {
      parts.forEach((p) => push(normalizeDayToken(p)));
    } else {
      // 붙여쓴 한글 요일
      for (const ch of s) {
        push(normalizeDayToken(ch));
      }
      if (out.length === 0) push(normalizeDayToken(s));
    }
  }

  return out.length > 0 ? out : null;
}

/**
 * 수업요일 → 등원요일.
 * 주 4회(월화수목) 구문반: 화·목만 등원.
 * 그 외(2·3회 등): Orbit 요일 그대로.
 * null/빈값: 미정 → 호출부에서 매일 fallback.
 */
export function toAttendanceDays(
  classDays: WeekdayCode[] | null | undefined,
): WeekdayCode[] | null {
  if (!classDays || classDays.length === 0) return null;
  const set = new Set(classDays);
  const isMonThuFour =
    set.size === 4 &&
    set.has("MON") &&
    set.has("TUE") &&
    set.has("WED") &&
    set.has("THU");
  if (isMonThuFour) return ["TUE", "THU"];
  return [...classDays];
}

/** 등원요일 미정이면 true(매일). 정해져 있으면 해당 요일만. */
export function isAttendingOnDate(
  classDays: WeekdayCode[] | null | undefined,
  date: Date = new Date(),
): boolean {
  const attend = toAttendanceDays(classDays ?? null);
  if (!attend) return true;
  const code = JS_DAY_TO_CODE[date.getDay()];
  return attend.includes(code);
}

export function formatAttendanceDays(
  classDays: WeekdayCode[] | null | undefined,
): string {
  const attend = toAttendanceDays(classDays ?? null);
  if (!attend) return "매일(미정)";
  return attend.map((d) => WEEKDAY_LABEL[d]).join("");
}

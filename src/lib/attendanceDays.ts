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
        if (v >= 0 && v <= 6) push(JS_DAY_TO_CODE[v]);
        else if (v >= 1 && v <= 7) push(JS_DAY_TO_CODE[v % 7]);
      }
    });
  } else if (typeof input === "string") {
    const s = input.trim();
    if (!s) return null;
    const parts = s.split(/[,|/\s·･]+/).filter(Boolean);
    if (parts.length > 1) {
      parts.forEach((p) => push(normalizeDayToken(p)));
    } else {
      const chunk = s.match(/[월화수목금토일]{2,}/)?.[0];
      if (chunk) {
        for (const ch of chunk) push(normalizeDayToken(ch));
      } else if (/토요|토요일|토반/.test(s)) {
        push("SAT");
      } else if (/^일요|일요일$/.test(s)) {
        push("SUN");
      } else {
        push(normalizeDayToken(s));
      }
    }
  }

  return out.length > 0 ? out : null;
}

/** 반 이름에서만 추론 (「일반」의 일 오인 없음) */
export function inferDaysFromClassName(
  className: string | null | undefined,
): WeekdayCode[] | null {
  if (!className) return null;
  const compact = className.replace(/\s+/g, "");
  if (/토요|토요일/.test(compact)) return ["SAT"];
  if (/일요|일요일/.test(compact) && !/일반/.test(compact)) return ["SUN"];
  const chunk = compact.match(/[월화수목금토일]{2,}/)?.[0];
  if (!chunk) return null;
  const out: WeekdayCode[] = [];
  for (const ch of chunk) {
    const c = normalizeDayToken(ch);
    if (c && !out.includes(c)) out.push(c);
  }
  return out.length > 0 ? out : null;
}

export function isHighSchoolGrade(grade: string | null | undefined): boolean {
  if (!grade) return false;
  const g = grade.replace(/\s+/g, "").replace(/고등/, "고");
  return /^고[123]/.test(g) || /^고등/.test(grade.replace(/\s+/g, ""));
}

/**
 * 수업요일 → 등원요일.
 * 주 4회(월화수목) 구문반: 화·목만 등원.
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

/**
 * 대시보드 「오늘 등원자」전용.
 * - 휴퇴원(orbit_enrollment_active=false) 제외
 * - 요일이 있으면 그 날만
 * - 요일 미정: 토요=고등부만, 일요=숨김, 평일=표시(기존 구문 운영 fallback)
 * - 「매일」로 전원·휴퇴 노출하지 않음
 */
export function isDashboardAttendingToday(input: {
  classDays?: string[] | null;
  className?: string | null;
  actualGrade?: string | null;
  enrollmentActive?: boolean | null;
  date?: Date;
}): boolean {
  if (input.enrollmentActive === false) return false;

  const date = input.date ?? new Date();
  const today = JS_DAY_TO_CODE[date.getDay()];

  const fromDb = parseOrbitDays(input.classDays ?? null);
  const fromName = inferDaysFromClassName(input.className);
  const effective = toAttendanceDays(fromDb ?? fromName);

  if (effective) return effective.includes(today);

  // 요일 미정
  if (today === "SAT") return isHighSchoolGrade(input.actualGrade);
  if (today === "SUN") return false;
  // 평일 미정: 재원생만 이미 통과했으므로 표시 (구문 주중반)
  return true;
}

/** @deprecated 대시보드에서는 isDashboardAttendingToday 사용 */
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
  className?: string | null,
  actualGrade?: string | null,
): string {
  const fromDb = parseOrbitDays(classDays ?? null);
  const fromName = inferDaysFromClassName(className);
  const attend = toAttendanceDays(fromDb ?? fromName);
  if (attend) return attend.map((d) => WEEKDAY_LABEL[d]).join("");
  if (isHighSchoolGrade(actualGrade)) return "토(고등부)";
  return "평일(미정)";
}

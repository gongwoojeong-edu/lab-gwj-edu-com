// ============================================================
// attendanceDays — Orbit 반 요일/시간표 → 오늘 등원 판정
// ============================================================

export type WeekdayCode = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";

/** day → "HH:MM" */
export type ClassScheduleMap = Partial<Record<WeekdayCode, string>>;

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

export function todayWeekdayCode(date: Date = new Date()): WeekdayCode {
  return JS_DAY_TO_CODE[date.getDay()];
}

export function normalizeDayToken(raw: string): WeekdayCode | null {
  const t = raw.trim().toUpperCase();
  if (!t) return null;
  if (TOKEN_MAP[t]) return TOKEN_MAP[t];
  if (TOKEN_MAP[raw.trim()]) return TOKEN_MAP[raw.trim()];
  return null;
}

/** "14:00" / "14:00:00" / "2:30 PM" → "HH:MM" */
export function normalizeTimeToken(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    // 분 단위(0~24*60) 또는 시(0~23)
    if (raw >= 0 && raw < 24) {
      return `${String(Math.floor(raw)).padStart(2, "0")}:00`;
    }
    if (raw >= 0 && raw < 24 * 60) {
      const h = Math.floor(raw / 60);
      const m = Math.floor(raw % 60);
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }
  }
  const s = String(raw).trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?/);
  if (!m) return null;
  const h = Math.min(23, Math.max(0, Number(m[1])));
  const min = Math.min(59, Math.max(0, Number(m[2])));
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

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

/** 반 이름에 명시된 요일만 (고등부≠토요) */
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

export function parseClassSchedule(raw: unknown): ClassScheduleMap | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: ClassScheduleMap = {};
  let hit = 0;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const day = normalizeDayToken(k);
    const time = normalizeTimeToken(v);
    if (day && time) {
      out[day] = time;
      hit += 1;
    }
  }
  return hit > 0 ? out : null;
}

/** 오늘 수업 시작 HH:MM. 없으면 null */
export function todayClassStartTime(
  schedule: ClassScheduleMap | null | undefined,
  date: Date = new Date(),
): string | null {
  if (!schedule) return null;
  return schedule[todayWeekdayCode(date)] ?? null;
}

/**
 * 대시보드 등원: Orbit 요일(또는 반명에 명시된 요일)만.
 * 고등부 휴리스틱·매일 fallback 없음 — 전승우처럼 토요 아닌 고등부 제외.
 */
export function isDashboardAttendingToday(input: {
  classDays?: string[] | null;
  className?: string | null;
  enrollmentActive?: boolean | null;
  date?: Date;
}): boolean {
  if (input.enrollmentActive === false) return false;

  const date = input.date ?? new Date();
  const today = todayWeekdayCode(date);

  const fromDb = parseOrbitDays(input.classDays ?? null);
  const fromName = inferDaysFromClassName(input.className);
  // DB 요일 우선. 반명은 DB가 비었을 때만(토요반 등)
  const effective = toAttendanceDays(fromDb ?? fromName);
  if (!effective) return false;
  return effective.includes(today);
}

export function formatAttendanceDays(
  classDays: WeekdayCode[] | null | undefined,
  className?: string | null,
): string {
  const fromDb = parseOrbitDays(classDays ?? null);
  const fromName = inferDaysFromClassName(className);
  const attend = toAttendanceDays(fromDb ?? fromName);
  if (attend) return attend.map((d) => WEEKDAY_LABEL[d]).join("");
  return "미정";
}

/** 등원자 정렬: 오늘 시작시각 → 반명 → 이름 */
export function compareAttendeesBySchedule(
  a: {
    schedule?: ClassScheduleMap | null;
    className?: string | null;
    name: string;
  },
  b: {
    schedule?: ClassScheduleMap | null;
    className?: string | null;
    name: string;
  },
  date: Date = new Date(),
): number {
  const ta = todayClassStartTime(a.schedule, date) ?? "99:99";
  const tb = todayClassStartTime(b.schedule, date) ?? "99:99";
  if (ta !== tb) return ta.localeCompare(tb);
  const ca = a.className ?? "";
  const cb = b.className ?? "";
  if (ca !== cb) return ca.localeCompare(cb, "ko");
  return a.name.localeCompare(b.name, "ko");
}

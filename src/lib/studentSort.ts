/**
 * 학생 드롭다운/목록 정렬 유틸.
 * 반별(시간대 고려) → 학년 → 가나다순.
 *
 * orbit_class_name 예: "초등영어 A", "중등영어 C", "고등영어 B"
 *  - 초등 → 중등 → 고등 순으로 그룹핑
 *  - 같은 그룹 내에서는 반 라벨(A/B/C…)로 정렬(대체로 시간대 순으로 편성됨)
 *  - 반 없는 학생은 맨 뒤
 */
export type SortableStudent = {
  display_name?: string | null;
  student_no?: string | null;
  orbit_class_name?: string | null;
  /** { MON: "16:00", ... } — 반 시간표 (시간대 정렬용) */
  orbit_class_schedule?: Record<string, string> | null;
  actual_grade?: string | null;
  campus?: string | null;
};

/** 반 시간표에서 가장 이른 수업 시작 시각 ("HH:MM"). 없으면 null */
export function earliestClassTime(
  schedule: Record<string, string> | null | undefined,
): string | null {
  if (!schedule) return null;
  const times = Object.values(schedule)
    .map((v) => String(v ?? "").trim())
    .filter((v) => /^\d{1,2}:\d{2}/.test(v))
    .map((v) => {
      const [h, m] = v.split(":");
      return `${h.padStart(2, "0")}:${m.slice(0, 2)}`;
    });
  if (times.length === 0) return null;
  return times.sort()[0];
}


const SCHOOL_ORDER: Record<string, number> = { 초등: 1, 중등: 2, 고등: 3 };

const gradeRank = (g: string | null | undefined): number => {
  if (!g) return 9999;
  const s = g.trim();
  const map: Record<string, number> = {
    "초1": 1, "초2": 2, "초3": 3, "초4": 4, "초5": 5, "초6": 6,
    "중1": 7, "중2": 8, "중3": 9,
    "고1": 10, "고2": 11, "고3": 12,
  };
  if (map[s] != null) return map[s];
  const m = s.match(/(초|중|고)\s*(\d)/);
  if (m) return ({ 초: 0, 중: 6, 고: 9 } as Record<string, number>)[m[1]] + Number(m[2]);
  return 9998;
};

const classKey = (name: string | null | undefined) => {
  if (!name) return { school: 9, label: "\uffff" };
  const s = name.trim();
  const m = s.match(/^(초등|중등|고등)/);
  const school = m ? SCHOOL_ORDER[m[1]] ?? 8 : 8;
  return { school, label: s };
};

export function compareStudents(a: SortableStudent, b: SortableStudent): number {
  // 분원
  const ca = (a.campus ?? "").trim();
  const cb = (b.campus ?? "").trim();
  if (ca !== cb) {
    if (!ca) return 1;
    if (!cb) return -1;
    const c = ca.localeCompare(cb, "ko");
    if (c !== 0) return c;
  }
  // 반 (초→중→고 → 라벨)
  const ka = classKey(a.orbit_class_name);
  const kb = classKey(b.orbit_class_name);
  if (ka.school !== kb.school) return ka.school - kb.school;
  const lc = ka.label.localeCompare(kb.label, "ko");
  if (lc !== 0) return lc;
  // 학년
  const ga = gradeRank(a.actual_grade);
  const gb = gradeRank(b.actual_grade);
  if (ga !== gb) return ga - gb;
  // 가나다순 (이름)
  const na = (a.display_name ?? a.student_no ?? "").trim();
  const nb = (b.display_name ?? b.student_no ?? "").trim();
  return na.localeCompare(nb, "ko");
}

export function sortStudents<T extends SortableStudent>(list: T[]): T[] {
  return [...list].sort(compareStudents);
}

/** 드롭다운 옵션에서 반 라벨 표시용 */
export function classBadge(name: string | null | undefined): string {
  if (!name) return "미배정";
  return name.trim();
}

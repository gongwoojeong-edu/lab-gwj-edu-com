import { supabase } from "@/integrations/supabase/client";
import { filterStudentsForTeacherView } from "@/lib/teacher-scope";

const db = supabase as unknown as { from: (table: string) => any };

export type RosterMemberKind = "student" | "teacher";

export type RosterMember = {
  key: string;
  kind: RosterMemberKind;
  name: string;
  loginId: string;
  authUserId: string | null;
  campus: string | null;
  englishClass: string | null;
  grade: string | null;
  learningLevel: string | null;
  teacherRank: number | null;
  teacherId: string | null;
  homeroomTeacherId: string | null;
};

const TEACHER_NO_RE = /^gwjt\d{3}$/i;
const STUDENT_NO_RE = /^gwj\d{4}$/i;

function displayLoginId(studentNo: string): string {
  const id = studentNo.trim().toLowerCase();
  if (id.startsWith("gwjt")) return id.slice(4);
  if (id.startsWith("gwj")) return id.slice(3);
  return id;
}

export async function fetchMemberRoster(): Promise<RosterMember[]> {
  const [profilesRes, staffRes] = await Promise.all([
    db
      .from("student_profiles")
      .select(
        "user_id, student_no, display_name, campus, orbit_class_name, actual_grade, start_level, teacher_id, homeroom_teacher_id",
      )
      .order("student_no"),
    db
      .from("orbit_staff_cache")
      .select("id, name, employee_no, campus_name, auth_user_id, rank, active, subjects")
      .eq("active", true)
      .order("name"),
  ]);

  if (profilesRes.error) throw profilesRes.error;

  const members: RosterMember[] = [];

  for (const row of profilesRes.data ?? []) {
    const no = (row.student_no ?? "").trim().toLowerCase();
    if (!STUDENT_NO_RE.test(no) || TEACHER_NO_RE.test(no)) continue;
    members.push({
      key: `student:${row.user_id}`,
      kind: "student",
      name: row.display_name?.trim() || no,
      loginId: displayLoginId(no),
      authUserId: row.user_id,
      campus: row.campus ?? null,
      englishClass: row.orbit_class_name ?? null,
      grade: row.actual_grade ?? null,
      learningLevel: row.start_level ?? null,
      teacherRank: null,
      teacherId: row.teacher_id ?? null,
      homeroomTeacherId: row.homeroom_teacher_id ?? null,
    });
  }

  if (!staffRes.error) {
    const seenAuth = new Set<string>();
    for (const row of staffRes.data ?? []) {
      const loginRaw = (row.employee_no ?? "").trim().toLowerCase();
      if (!loginRaw.startsWith("gwjt")) continue;
      const loginId = loginRaw.slice(4);
      if (!loginId) continue;
      if (row.auth_user_id) {
        if (seenAuth.has(row.auth_user_id)) continue;
        seenAuth.add(row.auth_user_id);
      }
      const subjects = (row.subjects ?? []) as string[];
      const isEnglish =
        subjects.length === 0 || subjects.some((s) => /영어|english/i.test(String(s)));
      if (!isEnglish) continue;

      members.push({
        key: `teacher:${row.id}`,
        kind: "teacher",
        name: row.name,
        loginId,
        authUserId: row.auth_user_id,
        campus: row.campus_name ?? null,
        englishClass: null,
        grade: null,
        learningLevel: null,
        teacherRank: row.rank ?? null,
        teacherId: null,
        homeroomTeacherId: null,
      });
    }
  }

  members.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "teacher" ? -1 : 1;
    return a.name.localeCompare(b.name, "ko");
  });

  return members;
}

export function filterRosterForTeacherView(
  members: RosterMember[],
  teacherAuthUserId: string | null | undefined,
  emulateTeacherScope: boolean,
): RosterMember[] {
  if (!emulateTeacherScope || !teacherAuthUserId) return members;

  return members.filter((m) => {
    if (m.kind === "teacher") return true;
    return filterStudentsForTeacherView(
      [
        {
          teacher_id: m.teacherId,
          homeroom_teacher_id: m.homeroomTeacherId,
        },
      ],
      teacherAuthUserId,
      true,
    ).length > 0;
  });
}

import type { StudentProfile } from "@/lib/studentProfile";

type StudentTeacherFields = Pick<StudentProfile, "teacher_id" | "homeroom_teacher_id">;

/** 담당(또는 담임) 선생님 auth user id 기준 — eng 학습기 student_profiles */
export function isStudentOfTeacher(
  student: StudentTeacherFields,
  teacherAuthUserId: string,
): boolean {
  return (
    student.teacher_id === teacherAuthUserId ||
    student.homeroom_teacher_id === teacherAuthUserId
  );
}

/** 분원장+ 선생님화면 미리보기: 해당 선생님 담당 학생만 표시 */
export function filterStudentsForTeacherView<T extends StudentTeacherFields>(
  students: T[],
  teacherAuthUserId: string | null | undefined,
  emulateTeacherScope: boolean,
): T[] {
  if (!emulateTeacherScope || !teacherAuthUserId) return students;
  return students.filter((s) => isStudentOfTeacher(s, teacherAuthUserId));
}

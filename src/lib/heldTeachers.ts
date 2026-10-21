import { supabase } from "@/integrations/supabase/client";

export interface HeldTeacher { id: string; name: string }

export async function fetchHeldTeachers(): Promise<HeldTeacher[]> {
  const [roles, staff, profiles] = await Promise.all([
    supabase.from("user_roles").select("user_id").in("role", ["teacher", "admin"]),
    supabase.from("orbit_staff_cache").select("auth_user_id, name").eq("active", true),
    supabase.from("student_profiles").select("user_id, display_name, student_no"),
  ]);
  for (const result of [roles, staff, profiles]) if (result.error) throw result.error;
  const names = new Map<string, string>();
  for (const p of profiles.data ?? []) names.set(p.user_id, p.display_name || p.student_no);
  for (const s of staff.data ?? []) if (s.auth_user_id) names.set(s.auth_user_id, s.name);
  return [...new Set((roles.data ?? []).map(r => r.user_id))]
    .map(id => ({ id, name: names.get(id) || "선생님" }))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

export function filterHeldByTeacher<T extends { held_teacher_id?: string | null }>(rows: T[], teacherId: string): T[] {
  if (teacherId === "all") return rows;
  return rows.filter(row => teacherId === "unassigned" ? !row.held_teacher_id : row.held_teacher_id === teacherId);
}
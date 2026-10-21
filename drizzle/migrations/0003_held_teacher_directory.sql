CREATE OR REPLACE FUNCTION public.held_teacher_directory() RETURNS TABLE(id uuid, name text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT r.user_id, COALESCE(s.name, p.display_name, p.student_no, '선생님')
  FROM public.user_roles r
  LEFT JOIN public.orbit_staff_cache s ON s.auth_user_id = r.user_id AND s.active = true
  LEFT JOIN public.student_profiles p ON p.user_id = r.user_id
  WHERE r.role IN ('teacher', 'admin') AND (public.has_role(auth.uid(), 'teacher') OR public.has_role(auth.uid(), 'admin'))
  ORDER BY 2;
$$;
REVOKE ALL ON FUNCTION public.held_teacher_directory() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.held_teacher_directory() TO authenticated, service_role;
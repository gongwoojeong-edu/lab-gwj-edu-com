UPDATE public.student_profiles
SET orbit_enrollment_active = false,
    orbit_class_id = NULL,
    orbit_class_name = NULL,
    orbit_class_days = NULL,
    orbit_class_schedule = NULL,
    updated_at = now()
WHERE student_no = 'gwj3001'
  AND display_name = '박시형';
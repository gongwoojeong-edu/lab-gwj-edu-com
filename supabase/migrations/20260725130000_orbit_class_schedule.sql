-- 반별 요일→시작시각 (예: {"SAT":"14:00","TUE":"16:00"})
ALTER TABLE public.student_profiles
  ADD COLUMN IF NOT EXISTS orbit_class_schedule jsonb NULL;

COMMENT ON COLUMN public.student_profiles.orbit_class_schedule IS
  'Orbit 반 시간표. 키=MON..SUN, 값=HH:MM 시작시각. 등원자 정렬용.';

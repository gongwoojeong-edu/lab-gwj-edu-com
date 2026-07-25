ALTER TABLE public.student_profiles
  ADD COLUMN IF NOT EXISTS orbit_class_days text[] NULL;

COMMENT ON COLUMN public.student_profiles.orbit_class_days IS
  'Orbit 반 수업요일 (MON..SUN). NULL/빈배열 = 등원요일 미정 → 프론트에서 매일 등원 fallback. 월화수목 4일제는 프론트에서 화·목만 등원 처리.';

CREATE INDEX IF NOT EXISTS idx_student_profiles_orbit_class_days
  ON public.student_profiles USING GIN (orbit_class_days)
  WHERE orbit_class_days IS NOT NULL;
ALTER TABLE public.student_profiles
  ADD COLUMN IF NOT EXISTS start_series_id uuid,
  ADD COLUMN IF NOT EXISTS start_volume_id uuid,
  ADD COLUMN IF NOT EXISTS start_unit_id uuid;

CREATE INDEX IF NOT EXISTS idx_student_profiles_start_series
  ON public.student_profiles (start_series_id);
CREATE INDEX IF NOT EXISTS idx_student_profiles_start_volume
  ON public.student_profiles (start_volume_id);
CREATE INDEX IF NOT EXISTS idx_student_profiles_start_unit
  ON public.student_profiles (start_unit_id);
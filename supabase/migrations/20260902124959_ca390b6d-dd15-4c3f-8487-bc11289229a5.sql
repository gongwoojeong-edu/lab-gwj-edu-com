ALTER TABLE public.student_profiles
  ADD COLUMN IF NOT EXISTS track_b_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS track_b_label text,
  ADD COLUMN IF NOT EXISTS track_b_series_id uuid,
  ADD COLUMN IF NOT EXISTS track_b_volume_id uuid,
  ADD COLUMN IF NOT EXISTS track_b_unit_id uuid,
  ADD COLUMN IF NOT EXISTS track_a_label text;
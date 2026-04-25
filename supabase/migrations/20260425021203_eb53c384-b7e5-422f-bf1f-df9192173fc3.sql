ALTER TABLE public.student_profiles
ADD COLUMN IF NOT EXISTS unit_workbook_mode text NOT NULL DEFAULT 'both';

ALTER TABLE public.student_profiles
DROP CONSTRAINT IF EXISTS student_profiles_unit_workbook_mode_check;

ALTER TABLE public.student_profiles
ADD CONSTRAINT student_profiles_unit_workbook_mode_check
CHECK (unit_workbook_mode IN ('unit_only', 'both'));
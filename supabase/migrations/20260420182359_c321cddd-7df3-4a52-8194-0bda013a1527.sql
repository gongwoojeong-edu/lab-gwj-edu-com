ALTER TABLE public.student_profiles ADD COLUMN IF NOT EXISTS teacher_pin text;
ALTER TABLE public.word_pre_results ADD COLUMN IF NOT EXISTS assist_log jsonb NOT NULL DEFAULT '[]'::jsonb;
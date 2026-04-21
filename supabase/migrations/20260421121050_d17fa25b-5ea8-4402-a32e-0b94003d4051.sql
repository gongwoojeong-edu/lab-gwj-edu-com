ALTER TABLE public.sentence_attempt_logs
  ADD COLUMN IF NOT EXISTS attempt_source text NOT NULL DEFAULT 'regular';

ALTER TABLE public.student_profiles
  ADD COLUMN IF NOT EXISTS word_test_time_limit_sec integer NOT NULL DEFAULT 20;
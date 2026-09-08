ALTER TABLE public.student_passage_overrides
  ADD COLUMN IF NOT EXISTS skip_sentence boolean NOT NULL DEFAULT false;
ALTER TABLE public.sentence_approvals DROP CONSTRAINT sentence_approvals_grade_check;
ALTER TABLE public.sentence_approvals ADD CONSTRAINT sentence_approvals_grade_check CHECK (grade = ANY (ARRAY['excellent','good','fair','poor','redo','coach']::text[]));
ALTER TABLE public.sentence_progress ADD COLUMN IF NOT EXISTS coach_flagged_at timestamptz;
ALTER TABLE public.sentence_progress ADD COLUMN IF NOT EXISTS last_coach_memo text;
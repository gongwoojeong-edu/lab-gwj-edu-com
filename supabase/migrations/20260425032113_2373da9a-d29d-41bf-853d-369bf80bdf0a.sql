ALTER TABLE public.sentence_progress
DROP CONSTRAINT IF EXISTS sentence_progress_status_check;

ALTER TABLE public.sentence_progress
ADD CONSTRAINT sentence_progress_status_check
CHECK (status = ANY (ARRAY['pending'::text, 'pass'::text, 'fail'::text, 'hold'::text]));
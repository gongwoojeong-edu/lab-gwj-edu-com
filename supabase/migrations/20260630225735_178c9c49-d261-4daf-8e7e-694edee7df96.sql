ALTER TABLE public.sentence_progress 
  ADD COLUMN IF NOT EXISTS redo_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_redo_memo text;
CREATE INDEX IF NOT EXISTS sentence_progress_redo_idx ON public.sentence_progress(user_id) WHERE redo_requested_at IS NOT NULL;
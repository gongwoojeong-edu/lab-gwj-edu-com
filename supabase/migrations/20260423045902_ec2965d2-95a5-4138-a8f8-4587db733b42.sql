
ALTER TABLE public.sentence_progress
  ADD COLUMN IF NOT EXISTS analysis_match_rate numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_sentence_progress_last_activity_at
  ON public.sentence_progress (last_activity_at DESC);

ALTER TABLE public.sentence_progress REPLICA IDENTITY FULL;
ALTER TABLE public.word_test_results REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'sentence_progress'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.sentence_progress';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'word_test_results'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.word_test_results';
  END IF;
END $$;

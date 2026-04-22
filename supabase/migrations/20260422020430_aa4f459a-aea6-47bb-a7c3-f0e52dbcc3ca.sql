ALTER TABLE public.handout_results
ADD COLUMN IF NOT EXISTS sentence_id text;

CREATE UNIQUE INDEX IF NOT EXISTS handout_results_user_date_sentence_unique_idx
ON public.handout_results (
  user_id,
  test_date,
  COALESCE(sentence_id, '')
);

CREATE INDEX IF NOT EXISTS handout_results_user_date_idx
ON public.handout_results (user_id, test_date);

CREATE INDEX IF NOT EXISTS handout_results_sentence_idx
ON public.handout_results (sentence_id);
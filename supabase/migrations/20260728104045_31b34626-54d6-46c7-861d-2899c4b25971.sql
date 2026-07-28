CREATE INDEX IF NOT EXISTS idx_word_test_results_taken_user
ON public.word_test_results (taken_at, user_id)
INCLUDE (score);

CREATE INDEX IF NOT EXISTS idx_handout_results_test_date_user
ON public.handout_results (test_date, user_id)
INCLUDE (word_ho_score, syntax_ho_result);

ANALYZE public.word_test_results;
ANALYZE public.handout_results;
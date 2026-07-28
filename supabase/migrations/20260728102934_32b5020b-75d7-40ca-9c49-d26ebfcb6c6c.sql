-- Speed up teacher dashboard KPI counts by making date-range scans index-backed.
CREATE INDEX IF NOT EXISTS idx_sentence_attempt_logs_completed_user
ON public.sentence_attempt_logs (completed_at, user_id)
WHERE completed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sentence_progress_passed_at_user_pass
ON public.sentence_progress (passed_at, user_id)
WHERE status = 'pass' AND passed_at IS NOT NULL;

-- Speed up repeated word-test lookups by sentence/student and daily per-student score scans.
CREATE INDEX IF NOT EXISTS idx_word_test_results_sentence_user
ON public.word_test_results (sentence_id, user_id)
INCLUDE (passed, score)
WHERE sentence_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_word_test_results_user_taken_at
ON public.word_test_results (user_id, taken_at)
INCLUDE (score, passed)
WHERE taken_at IS NOT NULL;

-- Speed up frequently repeated passage listing inside units.
CREATE INDEX IF NOT EXISTS idx_textbook_passages_unit_passage_no
ON public.textbook_passages (unit_id, passage_no);

-- Keep planner statistics fresh immediately after adding indexes.
ANALYZE public.sentence_attempt_logs;
ANALYZE public.sentence_progress;
ANALYZE public.word_test_results;
ANALYZE public.textbook_passages;
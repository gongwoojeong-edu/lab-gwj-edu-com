-- Hot path: sentence_progress is repeatedly fetched by (user_id, sentence_id), sometimes ordered by updated_at.
CREATE INDEX IF NOT EXISTS idx_sentence_progress_user_sentence_updated
ON public.sentence_progress (user_id, sentence_id, updated_at DESC)
INCLUDE (
  assignment_id,
  status,
  pre_done,
  word_test_done,
  analysis_done,
  translation_done,
  mem_passed_at,
  last_activity_at
);

-- Hot path: class/dashboard and assignment summaries fetch progress by sentence then many users.
CREATE INDEX IF NOT EXISTS idx_sentence_progress_sentence_user
ON public.sentence_progress (sentence_id, user_id)
INCLUDE (
  assignment_id,
  status,
  pre_done,
  word_test_done,
  analysis_done,
  translation_done,
  updated_at,
  last_activity_at
);

-- Hot path: word pre results by sentence + many users, ordered by latest attempt.
CREATE INDEX IF NOT EXISTS idx_word_pre_results_sentence_user_taken
ON public.word_pre_results (sentence_id, user_id, taken_at DESC)
INCLUDE (completed, known_words, unknown_words);

-- Hot path: translation existence/status by sentence + many users.
CREATE INDEX IF NOT EXISTS idx_sentence_translations_sentence_user
ON public.sentence_translations (sentence_id, user_id)
INCLUDE (submitted_at);

-- Hot path: analysis attempts by sentence + many users.
CREATE INDEX IF NOT EXISTS idx_sentence_attempt_logs_sentence_user
ON public.sentence_attempt_logs (sentence_id, user_id)
INCLUDE (analysis_passed, analysis_match_rate, word_test_passed, word_test_score, completed_at, assignment_id);

-- Hot path: pass check for word tests.
CREATE INDEX IF NOT EXISTS idx_word_test_results_sentence_user_passed
ON public.word_test_results (sentence_id, user_id, passed)
INCLUDE (score, mode, taken_at);

-- Hot path: idioms list by user in analysis screens.
CREATE INDEX IF NOT EXISTS idx_idioms_user_created
ON public.idioms (user_id, created_at ASC);

-- Hot path: teacher PIN uniqueness/list checks.
CREATE INDEX IF NOT EXISTS idx_student_profiles_teacher_pin_present
ON public.student_profiles (teacher_pin)
WHERE teacher_pin IS NOT NULL AND teacher_pin <> '';

ANALYZE public.sentence_progress;
ANALYZE public.word_pre_results;
ANALYZE public.sentence_translations;
ANALYZE public.sentence_attempt_logs;
ANALYZE public.word_test_results;
ANALYZE public.idioms;
ANALYZE public.student_profiles;
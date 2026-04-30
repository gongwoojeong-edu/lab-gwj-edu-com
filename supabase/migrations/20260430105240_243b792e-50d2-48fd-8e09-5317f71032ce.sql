UPDATE public.sentence_progress
SET status = 'pending',
    passed_at = NULL,
    updated_at = now()
WHERE status = 'pass'
  AND COALESCE(analysis_done, false) = false
  AND COALESCE(translation_done, false) = false;
UPDATE public.sentence_progress
SET analysis_done = false,
    analysis_match_rate = NULL,
    status = 'pending',
    updated_at = now()
WHERE user_id = 'a97ec14c-89c7-4f09-b4f5-8fa2dcd28ca0'
  AND sentence_id = 'L08-U260339-006';
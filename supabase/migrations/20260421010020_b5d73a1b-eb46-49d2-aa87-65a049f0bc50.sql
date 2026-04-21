UPDATE public.sentence_progress
SET pre_done = true,
    analysis_done = true,
    translation_done = true,
    updated_at = now()
WHERE user_id = '060beb9c-d432-43bd-bc82-34384ff91f96'
  AND sentence_id = 's1';
UPDATE public.word_test_results
SET remediation_done = true
WHERE id = 'fc94dae6-3d10-4fc3-a5f2-e6bf4be07f05';

INSERT INTO public.word_pre_results (user_id, sentence_id, known_words, unknown_words, completed, assist_log)
VALUES (
  '060beb9c-d432-43bd-bc82-34384ff91f96',
  's1',
  ARRAY['driving force','solidify','era','patronage','invention','significant','medium','influenced','aided','development']::text[],
  ARRAY[]::text[],
  true,
  '{}'::jsonb
);
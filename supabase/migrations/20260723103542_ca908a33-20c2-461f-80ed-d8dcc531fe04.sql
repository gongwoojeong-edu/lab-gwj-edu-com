-- 이미 '보류' 상태인 승인 행에 대해 학생이 다음 학습을 진행할 수 있도록
-- sentence_progress 를 임시 통과(pass) 로 반영한다.
WITH held AS (
  SELECT DISTINCT ON (sa.user_id, sa.sentence_id)
    sa.user_id, sa.sentence_id, sa.held_at, sa.held_memo
  FROM public.sentence_approvals sa
  WHERE sa.status = 'held'
  ORDER BY sa.user_id, sa.sentence_id, sa.held_at DESC NULLS LAST
),
upd AS (
  UPDATE public.sentence_progress sp
  SET status = 'pass',
      passed_at = COALESCE(sp.passed_at, h.held_at, now()),
      translation_done = true,
      analysis_done = true,
      word_test_done = true,
      last_memo = COALESCE(sp.last_memo, h.held_memo),
      redo_requested_at = NULL,
      updated_at = now()
  FROM held h
  WHERE sp.user_id = h.user_id AND sp.sentence_id = h.sentence_id
  RETURNING sp.user_id, sp.sentence_id
)
INSERT INTO public.sentence_progress
  (user_id, sentence_id, pre_done, analysis_done, translation_done, word_test_done, status, passed_at, last_memo)
SELECT h.user_id, h.sentence_id, false, true, true, true, 'pass', COALESCE(h.held_at, now()), h.held_memo
FROM held h
LEFT JOIN upd u ON u.user_id = h.user_id AND u.sentence_id = h.sentence_id
WHERE u.user_id IS NULL;
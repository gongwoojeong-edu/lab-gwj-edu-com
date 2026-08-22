UPDATE public.sentence_progress sp
SET assignment_id = a.id
FROM public.assignments a
WHERE sp.assignment_id IS NULL
  AND a.student_id = sp.user_id
  AND a.sentence_id = sp.sentence_id
  AND sp.user_id IN ('a6865c03-b08f-44bb-9f5a-ed1d36a08d8f','b71f3532-4ec4-41b1-8a7a-fab28fbf4a91')
  AND NOT EXISTS (
    SELECT 1 FROM public.sentence_progress s2
    WHERE s2.user_id = sp.user_id AND s2.sentence_id = sp.sentence_id AND s2.assignment_id = a.id
  );
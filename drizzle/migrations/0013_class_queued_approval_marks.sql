CREATE OR REPLACE FUNCTION public.class_queued_approval_marks()
RETURNS TABLE(approval_id uuid, sentence_id text, user_id uuid, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.approval_id, c.sentence_id, c.user_id, c.created_at
  FROM public.class_review_items c
  WHERE c.status = 'open'
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher'))
$$;
REVOKE ALL ON FUNCTION public.class_queued_approval_marks() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.class_queued_approval_marks() TO authenticated, service_role;
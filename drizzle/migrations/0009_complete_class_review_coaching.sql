CREATE OR REPLACE FUNCTION public.complete_class_review_coaching(p_ids uuid[]) RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE r record; a record; n integer := 0; t timestamptz := clock_timestamp();
BEGIN
 IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher')) THEN RAISE EXCEPTION '선생님만 수업 완료를 처리할 수 있습니다'; END IF;
 FOR r IN SELECT * FROM public.class_review_items WHERE id = ANY(p_ids) AND status = 'open' ORDER BY id FOR UPDATE LOOP
  IF NOT public.has_role(auth.uid(), 'admin') AND r.teacher_id IS DISTINCT FROM auth.uid() AND r.created_by IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION '담당 수업 자료만 처리할 수 있습니다'; END IF;
  SELECT * INTO a FROM public.sentence_approvals WHERE id = r.approval_id AND user_id = r.user_id AND sentence_id = r.sentence_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '제출 기록을 찾을 수 없습니다. 승인창에서 수업 문장을 다시 담아주세요'; END IF;
  IF EXISTS (SELECT 1 FROM public.sentence_approvals WHERE user_id = a.user_id AND sentence_id = a.sentence_id AND assignment_id IS NOT DISTINCT FROM a.assignment_id AND attempt_no > a.attempt_no) THEN RAISE EXCEPTION '새 제출이 있습니다. 최신 승인창에서 수업 문장을 다시 담아주세요'; END IF;
  UPDATE public.sentence_approvals SET status = 'approved', grade = 'coach', memo = NULL, praise_text = NULL, resolved_feedback = false, approved_by = auth.uid(), approved_at = t WHERE id = a.id;
  UPDATE public.sentence_progress SET status = 'pending', last_grade = 'coach', last_memo = NULL, coach_flagged_at = t, last_coach_memo = NULL, redo_requested_at = t, last_redo_memo = NULL WHERE user_id = r.user_id AND sentence_id = r.sentence_id AND assignment_id IS NOT DISTINCT FROM a.assignment_id;
  IF NOT FOUND THEN
   INSERT INTO public.sentence_progress (user_id,sentence_id,assignment_id,status,last_grade,coach_flagged_at,redo_requested_at) VALUES (r.user_id,r.sentence_id,a.assignment_id,'pending','coach',t,t);
  END IF;
  INSERT INTO public.student_notifications (user_id,kind,title,body,grade,sentence_id,approval_id,sent_by) VALUES (r.user_id,'evaluation','수업 코칭 — 한 번 더 제출해주세요',NULL,'coach',r.sentence_id,a.id,auth.uid());
  UPDATE public.class_review_items SET status = 'done', done_at = t WHERE id = r.id;
  n := n + 1;
 END LOOP;
 RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.complete_class_review_coaching(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_class_review_coaching(uuid[]) TO authenticated, service_role;
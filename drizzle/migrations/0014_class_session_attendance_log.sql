CREATE TABLE public.class_session_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  sentence_id text NOT NULL,
  approval_id uuid,
  teacher_id uuid,
  held_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX class_session_attendance_user_sentence_idx ON public.class_session_attendance (user_id, sentence_id, held_at DESC);
CREATE INDEX class_session_attendance_held_idx ON public.class_session_attendance (held_at);
GRANT SELECT, INSERT ON public.class_session_attendance TO authenticated;
GRANT ALL ON public.class_session_attendance TO service_role;
ALTER TABLE public.class_session_attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own or staff class sessions" ON public.class_session_attendance FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'teacher') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "staff record class sessions" ON public.class_session_attendance FOR INSERT TO authenticated
  WITH CHECK ((public.has_role(auth.uid(),'teacher') OR public.has_role(auth.uid(),'admin')) AND teacher_id = auth.uid());

INSERT INTO public.class_session_attendance (user_id, sentence_id, approval_id, teacher_id, held_at, created_at)
SELECT n.user_id, n.sentence_id, n.approval_id, n.sent_by, n.created_at, n.created_at
FROM public.student_notifications n
WHERE n.title = '수업 코칭 — 한 번 더 제출해주세요' AND n.sentence_id IS NOT NULL;

INSERT INTO public.class_session_attendance (user_id, sentence_id, approval_id, teacher_id, held_at, created_at)
SELECT c.user_id, c.sentence_id, c.approval_id, coalesce(c.teacher_id, c.created_by), c.done_at, c.done_at
FROM public.class_review_items c
WHERE c.status = 'done' AND c.done_at IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.class_session_attendance s WHERE s.user_id = c.user_id AND s.sentence_id = c.sentence_id AND abs(extract(epoch FROM s.held_at - c.done_at)) < 5);

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
  INSERT INTO public.class_session_attendance (user_id,sentence_id,approval_id,teacher_id,held_at) VALUES (r.user_id,r.sentence_id,a.id,auth.uid(),t);
  UPDATE public.class_review_items SET status = 'done', done_at = t WHERE id = r.id;
  n := n + 1;
 END LOOP;
 RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.complete_class_review_coaching(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_class_review_coaching(uuid[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.complete_class_review_attendance(p_ids uuid[], p_student_ids uuid[]) RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE r record; s record; a record; target_assignment uuid; target_approval uuid; n integer := 0; t timestamptz := clock_timestamp(); admin_user boolean := public.has_role(auth.uid(), 'admin');
BEGIN
 IF NOT (admin_user OR public.has_role(auth.uid(), 'teacher')) THEN RAISE EXCEPTION '선생님만 수업 완료를 처리할 수 있습니다'; END IF;
 IF coalesce(cardinality(p_ids),0)=0 OR coalesce(cardinality(p_student_ids),0)=0 THEN RAISE EXCEPTION '수업 문장과 참여 학생을 선택해 주세요'; END IF;
 PERFORM 1 FROM public.class_review_items WHERE id = ANY(p_ids) ORDER BY id FOR UPDATE;
 IF (SELECT count(*) FROM public.class_review_items WHERE id = ANY(p_ids) AND status='open') <> (SELECT count(DISTINCT x) FROM unnest(p_ids) x) THEN RAISE EXCEPTION '수업 자료가 변경되었습니다. 다시 불러와 주세요'; END IF;
 FOR r IN SELECT * FROM public.class_review_items WHERE id = ANY(p_ids) LOOP
  IF NOT admin_user AND r.teacher_id IS DISTINCT FROM auth.uid() AND r.created_by IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION '담당 수업 자료만 처리할 수 있습니다'; END IF;
 END LOOP;
 IF (SELECT count(*) FROM public.student_profiles WHERE user_id=ANY(p_student_ids) AND (admin_user OR teacher_id=auth.uid() OR teacher_id IS NULL)) <> (SELECT count(DISTINCT x) FROM unnest(p_student_ids) x) THEN RAISE EXCEPTION '담당 학생만 참여자로 지정할 수 있습니다'; END IF;
 FOR r IN SELECT DISTINCT sentence_id FROM public.class_review_items WHERE id=ANY(p_ids) ORDER BY sentence_id LOOP
  FOR s IN SELECT DISTINCT x AS user_id FROM unnest(p_student_ids) x ORDER BY x LOOP
   SELECT * INTO a FROM public.sentence_approvals WHERE user_id=s.user_id AND sentence_id=r.sentence_id ORDER BY requested_at DESC, attempt_no DESC, id LIMIT 1 FOR UPDATE;
   target_assignment := NULL; target_approval := NULL;
   IF FOUND THEN
    target_assignment := a.assignment_id; target_approval := a.id;
    IF EXISTS (SELECT 1 FROM public.class_review_items c JOIN public.sentence_approvals old ON old.id=c.approval_id WHERE c.id=ANY(p_ids) AND c.user_id=s.user_id AND c.sentence_id=r.sentence_id AND old.assignment_id IS NOT DISTINCT FROM a.assignment_id AND old.attempt_no < a.attempt_no) THEN RAISE EXCEPTION '새 제출이 있습니다. 최신 승인창에서 수업 문장을 다시 담아주세요'; END IF;
    UPDATE public.sentence_approvals SET status='approved',grade='coach',memo=NULL,praise_text=NULL,resolved_feedback=false,approved_by=auth.uid(),approved_at=t WHERE id=a.id;
   ELSE
    SELECT assignment_id INTO target_assignment FROM public.sentence_progress WHERE user_id=s.user_id AND sentence_id=r.sentence_id ORDER BY updated_at DESC,id LIMIT 1 FOR UPDATE;
   END IF;
   UPDATE public.sentence_progress SET status='pending',last_grade='coach',last_memo=NULL,coach_flagged_at=t,last_coach_memo=NULL,redo_requested_at=t,last_redo_memo=NULL WHERE user_id=s.user_id AND sentence_id=r.sentence_id AND assignment_id IS NOT DISTINCT FROM target_assignment;
   IF NOT FOUND THEN INSERT INTO public.sentence_progress(user_id,sentence_id,assignment_id,status,last_grade,coach_flagged_at,redo_requested_at) VALUES(s.user_id,r.sentence_id,target_assignment,'pending','coach',t,t); END IF;
   INSERT INTO public.student_notifications(user_id,kind,title,body,grade,sentence_id,approval_id,sent_by) VALUES(s.user_id,'evaluation','수업 코칭 — 한 번 더 제출해주세요',NULL,'coach',r.sentence_id,target_approval,auth.uid());
   INSERT INTO public.class_session_attendance(user_id,sentence_id,approval_id,teacher_id,held_at) VALUES(s.user_id,r.sentence_id,target_approval,auth.uid(),t);
   INSERT INTO public.class_review_items(sentence_id,user_id,approval_id,teacher_id,created_by,status,done_at) VALUES(r.sentence_id,s.user_id,target_approval,auth.uid(),auth.uid(),'done',t) ON CONFLICT(sentence_id,user_id,teacher_id) DO UPDATE SET approval_id=excluded.approval_id,status='done',done_at=t;
   n := n+1;
  END LOOP;
 END LOOP;
 UPDATE public.class_review_items SET status='done',done_at=t WHERE id=ANY(p_ids) AND user_id=ANY(p_student_ids);
 DELETE FROM public.class_review_items WHERE id=ANY(p_ids) AND NOT(user_id=ANY(p_student_ids));
 RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.complete_class_review_attendance(uuid[],uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.complete_class_review_attendance(uuid[],uuid[]) TO authenticated,service_role;
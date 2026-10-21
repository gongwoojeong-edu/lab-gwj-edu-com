ALTER TABLE public.sentence_approvals ADD COLUMN held_teacher_id uuid;
COMMENT ON COLUMN public.sentence_approvals.held_teacher_id IS 'Assigned teacher for held coaching; held_by remains the actor who placed the request on hold.';
CREATE INDEX sentence_approvals_held_teacher_idx ON public.sentence_approvals (held_teacher_id) WHERE status = 'held';
UPDATE public.sentence_approvals a SET held_teacher_id = a.held_by WHERE a.status = 'held' AND EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = a.held_by AND r.role IN ('teacher','admin'));
CREATE OR REPLACE FUNCTION public.validate_held_teacher_assignment() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.held_teacher_id IS DISTINCT FROM OLD.held_teacher_id AND NEW.held_teacher_id IS NOT NULL THEN
    IF NOT (public.has_role(auth.uid(), 'teacher') OR public.has_role(auth.uid(), 'admin') OR auth.role() = 'service_role') THEN
      RAISE EXCEPTION 'Only staff can assign a held teacher';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = NEW.held_teacher_id AND role IN ('teacher','admin')) THEN
      RAISE EXCEPTION 'Assigned teacher must be a teacher or admin';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER validate_held_teacher_assignment BEFORE UPDATE ON public.sentence_approvals FOR EACH ROW EXECUTE FUNCTION public.validate_held_teacher_assignment();
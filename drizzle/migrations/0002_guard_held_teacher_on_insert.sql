CREATE OR REPLACE FUNCTION public.validate_held_teacher_assignment() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE changed boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN changed := NEW.held_teacher_id IS NOT NULL;
  ELSE changed := NEW.held_teacher_id IS DISTINCT FROM OLD.held_teacher_id;
  END IF;
  IF changed THEN
    IF NOT (public.has_role(auth.uid(), 'teacher') OR public.has_role(auth.uid(), 'admin') OR auth.role() = 'service_role') THEN
      RAISE EXCEPTION 'Only staff can assign a held teacher';
    END IF;
    IF NEW.held_teacher_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = NEW.held_teacher_id AND role IN ('teacher','admin')) THEN
      RAISE EXCEPTION 'Assigned teacher must be a teacher or admin';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER validate_held_teacher_assignment ON public.sentence_approvals;
CREATE TRIGGER validate_held_teacher_assignment BEFORE INSERT OR UPDATE ON public.sentence_approvals FOR EACH ROW EXECUTE FUNCTION public.validate_held_teacher_assignment();
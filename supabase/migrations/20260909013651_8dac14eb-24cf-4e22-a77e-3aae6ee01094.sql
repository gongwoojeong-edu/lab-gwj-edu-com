CREATE TABLE public.student_unit_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  unit_id uuid NOT NULL REFERENCES public.textbook_units(id) ON DELETE CASCADE,
  skip_unit boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, unit_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_unit_overrides TO authenticated;
GRANT ALL ON public.student_unit_overrides TO service_role;

ALTER TABLE public.student_unit_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY suo_select ON public.student_unit_overrides
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(),'teacher') OR public.has_role(auth.uid(),'admin'));

CREATE POLICY suo_insert ON public.student_unit_overrides
FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(),'teacher') OR public.has_role(auth.uid(),'admin'));

CREATE POLICY suo_update ON public.student_unit_overrides
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(),'teacher') OR public.has_role(auth.uid(),'admin'))
WITH CHECK (public.has_role(auth.uid(),'teacher') OR public.has_role(auth.uid(),'admin'));

CREATE POLICY suo_delete ON public.student_unit_overrides
FOR DELETE TO authenticated
USING (public.has_role(auth.uid(),'teacher') OR public.has_role(auth.uid(),'admin'));

CREATE TRIGGER suo_set_updated_at
BEFORE UPDATE ON public.student_unit_overrides
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_suo_user ON public.student_unit_overrides(user_id) WHERE skip_unit;

DROP POLICY IF EXISTS st2_update ON public.sentence_translations;
CREATE POLICY st2_update ON public.sentence_translations
FOR UPDATE
USING (user_id = auth.uid() OR public.has_role(auth.uid(),'teacher') OR public.has_role(auth.uid(),'admin'))
WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(),'teacher') OR public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS st2_insert ON public.sentence_translations;
CREATE POLICY st2_insert ON public.sentence_translations
FOR INSERT
WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(),'teacher') OR public.has_role(auth.uid(),'admin'));
CREATE TABLE public.student_idiom_bank (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  expression text NOT NULL,
  meaning text NOT NULL,
  sentence_id text,
  approval_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX student_idiom_bank_user_idx ON public.student_idiom_bank (user_id, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_idiom_bank TO authenticated;
GRANT ALL ON public.student_idiom_bank TO service_role;
ALTER TABLE public.student_idiom_bank ENABLE ROW LEVEL SECURITY;
CREATE POLICY sib_select ON public.student_idiom_bank FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'teacher') OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY sib_insert_staff ON public.student_idiom_bank FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'teacher') OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY sib_update_staff ON public.student_idiom_bank FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'teacher') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'teacher') OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY sib_delete_staff ON public.student_idiom_bank FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'teacher') OR public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.idiom_test_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  item_ids jsonb NOT NULL,
  total integer NOT NULL,
  assigned_by uuid,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  correct integer,
  score numeric,
  results jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idiom_test_assignments_user_idx ON public.idiom_test_assignments (user_id, assigned_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.idiom_test_assignments TO authenticated;
GRANT ALL ON public.idiom_test_assignments TO service_role;
ALTER TABLE public.idiom_test_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY ita_select ON public.idiom_test_assignments FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'teacher') OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY ita_insert_staff ON public.idiom_test_assignments FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'teacher') OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY ita_update_own ON public.idiom_test_assignments FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'teacher') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'teacher') OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY ita_delete_staff ON public.idiom_test_assignments FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'teacher') OR public.has_role(auth.uid(), 'admin'));
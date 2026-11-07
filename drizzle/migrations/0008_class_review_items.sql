CREATE TABLE public.class_review_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sentence_id text NOT NULL,
  user_id uuid NOT NULL,
  approval_id uuid,
  teacher_id uuid,
  note text,
  status text NOT NULL DEFAULT 'open',
  created_by uuid NOT NULL DEFAULT auth.uid(),
  done_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT class_review_items_status_chk CHECK (status IN ('open','done')),
  CONSTRAINT class_review_items_uniq UNIQUE (sentence_id, user_id, teacher_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_review_items TO authenticated;
GRANT ALL ON public.class_review_items TO service_role;
ALTER TABLE public.class_review_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read class review" ON public.class_review_items FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR (public.has_role(auth.uid(),'teacher') AND (teacher_id = auth.uid() OR created_by = auth.uid())));
CREATE POLICY "staff insert class review" ON public.class_review_items FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'teacher'));
CREATE POLICY "staff update class review" ON public.class_review_items FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR (public.has_role(auth.uid(),'teacher') AND (teacher_id = auth.uid() OR created_by = auth.uid())));
CREATE POLICY "staff delete class review" ON public.class_review_items FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR (public.has_role(auth.uid(),'teacher') AND (teacher_id = auth.uid() OR created_by = auth.uid())));
CREATE TRIGGER class_review_items_updated BEFORE UPDATE ON public.class_review_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
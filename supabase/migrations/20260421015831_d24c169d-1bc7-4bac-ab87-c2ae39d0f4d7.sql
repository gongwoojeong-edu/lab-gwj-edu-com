-- textbooks: 교재 (레벨별 묶음)
CREATE TABLE public.textbooks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  level TEXT NOT NULL,
  unit_no INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (level, unit_no)
);

CREATE INDEX idx_textbooks_level ON public.textbooks(level);

ALTER TABLE public.textbooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "textbooks_select_authenticated"
ON public.textbooks FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "textbooks_insert_staff"
ON public.textbooks FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'teacher') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "textbooks_update_staff"
ON public.textbooks FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'teacher') OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'teacher') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "textbooks_delete_staff"
ON public.textbooks FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_textbooks_updated_at
BEFORE UPDATE ON public.textbooks
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- textbook_passages: 교재에 속한 지문
CREATE TABLE public.textbook_passages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  textbook_id UUID NOT NULL REFERENCES public.textbooks(id) ON DELETE CASCADE,
  passage_no INTEGER NOT NULL,
  code TEXT NOT NULL UNIQUE,
  english TEXT NOT NULL,
  korean TEXT,
  tokens JSONB,
  analysis_status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_textbook_passages_textbook ON public.textbook_passages(textbook_id, passage_no);
CREATE INDEX idx_textbook_passages_code ON public.textbook_passages(code);

ALTER TABLE public.textbook_passages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "textbook_passages_select_authenticated"
ON public.textbook_passages FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "textbook_passages_insert_staff"
ON public.textbook_passages FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'teacher') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "textbook_passages_update_staff"
ON public.textbook_passages FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'teacher') OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'teacher') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "textbook_passages_delete_staff"
ON public.textbook_passages FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_textbook_passages_updated_at
BEFORE UPDATE ON public.textbook_passages
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
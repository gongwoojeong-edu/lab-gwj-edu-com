CREATE TABLE public.sentence_word_extractions (
  sentence_id text PRIMARY KEY,
  english text NOT NULL,
  words jsonb NOT NULL DEFAULT '[]'::jsonb,
  model text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sentence_word_extractions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "swe_select_authenticated"
ON public.sentence_word_extractions
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "swe_insert_staff"
ON public.sentence_word_extractions
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'teacher'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "swe_update_staff"
ON public.sentence_word_extractions
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'teacher'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'teacher'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "swe_delete_staff"
ON public.sentence_word_extractions
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER swe_set_updated_at
BEFORE UPDATE ON public.sentence_word_extractions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
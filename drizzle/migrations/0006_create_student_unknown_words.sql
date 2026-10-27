CREATE TABLE public.student_unknown_words (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  word text NOT NULL,
  sentence_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX student_unknown_words_user_word_unique
  ON public.student_unknown_words (user_id, lower(word));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_unknown_words TO authenticated;
GRANT ALL ON public.student_unknown_words TO service_role;

ALTER TABLE public.student_unknown_words ENABLE ROW LEVEL SECURITY;

CREATE POLICY suw_select ON public.student_unknown_words
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'teacher')
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY suw_insert_own ON public.student_unknown_words
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY suw_delete ON public.student_unknown_words
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'teacher')
    OR public.has_role(auth.uid(), 'admin')
  );
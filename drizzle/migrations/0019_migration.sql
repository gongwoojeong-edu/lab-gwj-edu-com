CREATE TABLE public.pronoun_referents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  sentence_id text NOT NULL,
  word_index integer NOT NULL,
  word text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('in_sentence','outside','non_pronoun')),
  target_index integer,
  outside_text text,
  non_pronoun_type text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, sentence_id, word_index)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pronoun_referents TO authenticated;
GRANT ALL ON public.pronoun_referents TO service_role;
ALTER TABLE public.pronoun_referents ENABLE ROW LEVEL SECURITY;
CREATE POLICY pronoun_referents_own_all ON public.pronoun_referents
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY pronoun_referents_staff_read ON public.pronoun_referents
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'teacher') OR public.has_role(auth.uid(),'admin'));
CREATE INDEX pronoun_referents_sentence_idx ON public.pronoun_referents (sentence_id);
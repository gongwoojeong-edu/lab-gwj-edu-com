CREATE TABLE public.teaching_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  teacher_id uuid,
  sentence_id text NOT NULL,
  question text NOT NULL,
  choices jsonb,
  answer text,
  answered_at timestamptz,
  verdict text CHECK (verdict IN ('correct','wrong')),
  judged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_teaching_questions_user_sentence ON public.teaching_questions (user_id, sentence_id, created_at);

GRANT SELECT, INSERT, UPDATE ON public.teaching_questions TO authenticated;
GRANT ALL ON public.teaching_questions TO service_role;

ALTER TABLE public.teaching_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "students read own questions"
  ON public.teaching_questions FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'teacher') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "teachers create questions"
  ON public.teaching_questions FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'teacher') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "students answer own questions"
  ON public.teaching_questions FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "teachers judge questions"
  ON public.teaching_questions FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'teacher') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'teacher') OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_teaching_questions_updated_at
  BEFORE UPDATE ON public.teaching_questions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.teaching_questions;
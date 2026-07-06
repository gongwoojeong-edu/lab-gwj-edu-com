CREATE TABLE IF NOT EXISTS public.passage_audio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sentence_id text NOT NULL,
  storage_path text NOT NULL,
  voice_label text DEFAULT 'nova',
  duration_ms integer,
  source text NOT NULL DEFAULT 'tts' CHECK (source IN ('upload', 'tts')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sentence_id)
);

GRANT SELECT ON public.passage_audio TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.passage_audio TO authenticated;
GRANT ALL ON public.passage_audio TO service_role;

CREATE INDEX IF NOT EXISTS idx_passage_audio_sentence
  ON public.passage_audio (sentence_id);

ALTER TABLE public.passage_audio ENABLE ROW LEVEL SECURITY;

CREATE POLICY "passage_audio_select_authenticated"
  ON public.passage_audio FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "passage_audio_staff_write"
  ON public.passage_audio FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'teacher'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'teacher'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE TRIGGER trg_set_updated_at_passage_audio
  BEFORE UPDATE ON public.passage_audio
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "passage_audio_storage_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'passage-audio');

CREATE POLICY "passage_audio_storage_staff_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'passage-audio'
    AND (
      public.has_role(auth.uid(), 'teacher'::app_role)
      OR public.has_role(auth.uid(), 'admin'::app_role)
    )
  );

CREATE POLICY "passage_audio_storage_staff_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'passage-audio'
    AND (
      public.has_role(auth.uid(), 'teacher'::app_role)
      OR public.has_role(auth.uid(), 'admin'::app_role)
    )
  );

CREATE POLICY "passage_audio_storage_staff_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'passage-audio'
    AND (
      public.has_role(auth.uid(), 'teacher'::app_role)
      OR public.has_role(auth.uid(), 'admin'::app_role)
    )
  );
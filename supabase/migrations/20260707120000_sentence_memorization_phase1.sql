-- 문장암기 Phase 1: 방향 설정, 단락흐름, 녹음, Storage

DO $$ BEGIN
  CREATE TYPE public.mem_direction_setting AS ENUM ('ko_to_en', 'en_to_ko', 'both');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.textbook_units
  ADD COLUMN IF NOT EXISTS default_mem_direction public.mem_direction_setting NOT NULL DEFAULT 'ko_to_en',
  ADD COLUMN IF NOT EXISTS mem_require_record boolean NOT NULL DEFAULT false;

ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS mem_direction public.mem_direction_setting;

CREATE TABLE IF NOT EXISTS public.paragraph_flow_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.textbook_units(id) ON DELETE CASCADE,
  best_score integer,
  attempt_count integer NOT NULL DEFAULT 0,
  passed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, unit_id)
);

CREATE TABLE IF NOT EXISTS public.memorization_recordings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sentence_id text NOT NULL,
  storage_path text NOT NULL,
  mime text,
  duration_ms integer,
  mem_direction text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mem_recordings_user_sentence
  ON public.memorization_recordings (user_id, sentence_id);
CREATE INDEX IF NOT EXISTS idx_paragraph_flow_user_unit
  ON public.paragraph_flow_progress (user_id, unit_id);

ALTER TABLE public.paragraph_flow_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memorization_recordings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "paragraph_flow_own_all"
  ON public.paragraph_flow_progress FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "mem_recordings_select_own_or_staff"
  ON public.memorization_recordings FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'teacher'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "mem_recordings_insert_own"
  ON public.memorization_recordings FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Storage bucket: mem-recordings (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('mem-recordings', 'mem-recordings', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "mem_recordings_storage_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'mem-recordings'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.has_role(auth.uid(), 'teacher'::app_role)
      OR public.has_role(auth.uid(), 'admin'::app_role)
    )
  );

CREATE POLICY "mem_recordings_storage_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'mem-recordings'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

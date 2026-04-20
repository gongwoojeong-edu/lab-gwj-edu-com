
-- Anonymous-friendly schema: user_id nullable; RLS allows ops where user_id IS NULL OR user_id = auth.uid()

-- 1. sentence_progress
CREATE TABLE public.sentence_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  sentence_id TEXT NOT NULL,
  analysis_done BOOLEAN NOT NULL DEFAULT false,
  translation_done BOOLEAN NOT NULL DEFAULT false,
  word_test_done BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'in_progress',
  passed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, sentence_id)
);

-- 2. owner_progress
CREATE TABLE public.owner_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  sentence_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  progress JSONB,
  custom_answer JSONB,
  completed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, sentence_id, owner_id)
);

-- 3. sentence_translations
CREATE TABLE public.sentence_translations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  sentence_id TEXT NOT NULL,
  text TEXT NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, sentence_id)
);

-- 4. word_test_results
CREATE TABLE public.word_test_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  sentence_id TEXT NOT NULL,
  items JSONB NOT NULL,
  score NUMERIC NOT NULL,
  passed BOOLEAN NOT NULL,
  taken_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. badge_offsets
CREATE TABLE public.badge_offsets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  sentence_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  dx INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, sentence_id, owner_id)
);

-- 6. modifier_relations
CREATE TABLE public.modifier_relations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  sentence_id TEXT NOT NULL,
  source_owner_id TEXT NOT NULL,
  target_owner_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, sentence_id, source_owner_id)
);

-- 7. referent_relations
CREATE TABLE public.referent_relations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  sentence_id TEXT NOT NULL,
  source_owner_id TEXT NOT NULL,
  target_owner_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, sentence_id, source_owner_id)
);

-- 8. idioms
CREATE TABLE public.idioms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  sentence_id TEXT NOT NULL,
  indices INTEGER[] NOT NULL,
  surface TEXT NOT NULL,
  meaning TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, sentence_id, indices)
);

-- 9. user_sentences (future library/shelf)
CREATE TABLE public.user_sentences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  text TEXT NOT NULL,
  level TEXT,
  code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- updated_at trigger function
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_sentence_progress_updated BEFORE UPDATE ON public.sentence_progress FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_owner_progress_updated BEFORE UPDATE ON public.owner_progress FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_badge_offsets_updated BEFORE UPDATE ON public.badge_offsets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Enable RLS
ALTER TABLE public.sentence_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sentence_translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.word_test_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.badge_offsets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modifier_relations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referent_relations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idioms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sentences ENABLE ROW LEVEL SECURITY;

-- RLS policies: anonymous (user_id IS NULL) or owner (user_id = auth.uid())
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['sentence_progress','owner_progress','sentence_translations','word_test_results','badge_offsets','modifier_relations','referent_relations','idioms','user_sentences']
  LOOP
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (user_id IS NULL OR user_id = auth.uid())', t||'_select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (user_id IS NULL OR user_id = auth.uid())', t||'_insert', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE USING (user_id IS NULL OR user_id = auth.uid()) WITH CHECK (user_id IS NULL OR user_id = auth.uid())', t||'_update', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE USING (user_id IS NULL OR user_id = auth.uid())', t||'_delete', t);
  END LOOP;
END $$;

-- Helpful indexes
CREATE INDEX idx_owner_progress_sentence ON public.owner_progress(sentence_id);
CREATE INDEX idx_badge_offsets_sentence ON public.badge_offsets(sentence_id);
CREATE INDEX idx_modifier_relations_sentence ON public.modifier_relations(sentence_id);
CREATE INDEX idx_referent_relations_sentence ON public.referent_relations(sentence_id);
CREATE INDEX idx_idioms_sentence ON public.idioms(sentence_id);

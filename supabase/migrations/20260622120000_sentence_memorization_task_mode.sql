-- 문장암기 Phase 0: task_mode (분석만/암기만/분석+암기), mem_* 메타, assignments 확장

DO $$ BEGIN
  CREATE TYPE public.passage_task_mode AS ENUM (
    'analysis_only',
    'memorize_only',
    'analysis_and_memorize'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.passage_mem_status AS ENUM ('draft', 'ready');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- units: default task for passages (null task_mode inherits this)
ALTER TABLE public.textbook_units
  ADD COLUMN IF NOT EXISTS default_task_mode public.passage_task_mode
    NOT NULL DEFAULT 'analysis_and_memorize';

-- passages: per-sentence task + memorization assets
ALTER TABLE public.textbook_passages
  ADD COLUMN IF NOT EXISTS task_mode public.passage_task_mode,
  ADD COLUMN IF NOT EXISTS mem_status public.passage_mem_status NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS mem_tokens jsonb,
  ADD COLUMN IF NOT EXISTS mem_korean_chunks jsonb,
  ADD COLUMN IF NOT EXISTS mem_cloze_spec jsonb,
  ADD COLUMN IF NOT EXISTS korean_source text DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS mem_composed_at timestamptz;

-- student override: task_mode (skip_pre unchanged)
ALTER TABLE public.student_passage_overrides
  ADD COLUMN IF NOT EXISTS task_mode public.passage_task_mode;

-- assignments: unit-level task + task_mode override
ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS unit_id uuid REFERENCES public.textbook_units(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS task_mode public.passage_task_mode;

CREATE INDEX IF NOT EXISTS idx_assignments_unit_id ON public.assignments (unit_id);
CREATE INDEX IF NOT EXISTS idx_textbook_passages_mem_status ON public.textbook_passages (mem_status);

-- sentence_progress: memorization step flags
ALTER TABLE public.sentence_progress
  ADD COLUMN IF NOT EXISTS mem_listen_done boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mem_scramble_done boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mem_cloze_done boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mem_speech_done boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mem_record_done boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mem_ko_to_en_done boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mem_en_to_ko_done boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mem_direction text,
  ADD COLUMN IF NOT EXISTS mem_passed_at timestamptz,
  ADD COLUMN IF NOT EXISTS mem_attempt_count integer NOT NULL DEFAULT 0;

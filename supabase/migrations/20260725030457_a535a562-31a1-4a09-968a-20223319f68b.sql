
ALTER TABLE public.textbook_units
  ADD COLUMN IF NOT EXISTS mem_include_interpret boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mem_include_translate boolean NOT NULL DEFAULT false;

ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS mem_include_interpret boolean,
  ADD COLUMN IF NOT EXISTS mem_include_translate boolean;

ALTER TABLE public.sentence_progress
  ADD COLUMN IF NOT EXISTS mem_interpret_done boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mem_translate_done boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mem_interpret_score int,
  ADD COLUMN IF NOT EXISTS mem_translate_score int;

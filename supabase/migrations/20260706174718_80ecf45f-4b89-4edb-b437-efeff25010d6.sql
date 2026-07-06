ALTER TABLE public.sentence_progress
  ADD COLUMN IF NOT EXISTS mem_dictation_done boolean NOT NULL DEFAULT false;

ALTER TABLE public.textbook_units
  ADD COLUMN IF NOT EXISTS mem_dictation_blank_ratio real NOT NULL DEFAULT 0.35
    CHECK (mem_dictation_blank_ratio >= 0.15 AND mem_dictation_blank_ratio <= 0.65);

COMMENT ON COLUMN public.textbook_units.mem_dictation_blank_ratio IS
  'D 받아쓰기 빈칸 비율 (0.15~0.65). 전체 받아쓰기 불가.';
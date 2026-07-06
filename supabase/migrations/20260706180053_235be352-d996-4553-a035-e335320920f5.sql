ALTER TABLE public.sentence_progress
  ADD COLUMN IF NOT EXISTS mem_dictation_score smallint
    CHECK (mem_dictation_score IS NULL OR (mem_dictation_score >= 0 AND mem_dictation_score <= 100));

ALTER TABLE public.textbook_units
  ADD COLUMN IF NOT EXISTS mem_dictation_min_score smallint NOT NULL DEFAULT 0
    CHECK (mem_dictation_min_score >= 0 AND mem_dictation_min_score <= 100);

COMMENT ON COLUMN public.sentence_progress.mem_dictation_score IS
  'D. 받아쓰기 정답률 0–100 (빈칸별 채점, 오답이어도 진행 가능)';

COMMENT ON COLUMN public.textbook_units.mem_dictation_min_score IS
  '받아쓰기 권장 최저점 0=기준 없음, 80=80점 미달 시 안내(진행은 허용)';
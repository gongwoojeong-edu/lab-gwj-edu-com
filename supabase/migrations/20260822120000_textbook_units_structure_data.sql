ALTER TABLE public.textbook_units
  ADD COLUMN IF NOT EXISTS structure_data jsonb;

COMMENT ON COLUMN public.textbook_units.structure_data IS
  '신텍스스튜디오 구조도 JSON (nodes + optional svg) — import-claude-handout structure 필드';

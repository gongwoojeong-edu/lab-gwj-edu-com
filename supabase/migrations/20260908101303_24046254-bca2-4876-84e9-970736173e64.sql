ALTER TABLE public.textbook_units
  ADD COLUMN IF NOT EXISTS excluded_from_scope boolean NOT NULL DEFAULT false;
ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS include_pre boolean NOT NULL DEFAULT true;
ALTER TABLE public.textbook_units
  ADD COLUMN IF NOT EXISTS structure_pdf_url text,
  ADD COLUMN IF NOT EXISTS structure_pdf_name text,
  ADD COLUMN IF NOT EXISTS structure_pdf_uploaded_at timestamptz;
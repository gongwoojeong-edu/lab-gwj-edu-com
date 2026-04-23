-- Move analysis PDF columns from textbook_passages to textbook_units
ALTER TABLE public.textbook_units
  ADD COLUMN IF NOT EXISTS analysis_pdf_url text,
  ADD COLUMN IF NOT EXISTS analysis_pdf_name text,
  ADD COLUMN IF NOT EXISTS analysis_pdf_uploaded_at timestamptz;

-- Migrate any data that may already exist on passages → take latest non-null per unit
UPDATE public.textbook_units u
SET analysis_pdf_url = src.analysis_pdf_url,
    analysis_pdf_name = src.analysis_pdf_name,
    analysis_pdf_uploaded_at = src.analysis_pdf_uploaded_at
FROM (
  SELECT DISTINCT ON (unit_id)
    unit_id, analysis_pdf_url, analysis_pdf_name, analysis_pdf_uploaded_at
  FROM public.textbook_passages
  WHERE analysis_pdf_url IS NOT NULL
  ORDER BY unit_id, analysis_pdf_uploaded_at DESC NULLS LAST
) src
WHERE u.id = src.unit_id;

-- Drop columns from passages
ALTER TABLE public.textbook_passages
  DROP COLUMN IF EXISTS analysis_pdf_url,
  DROP COLUMN IF EXISTS analysis_pdf_name,
  DROP COLUMN IF EXISTS analysis_pdf_uploaded_at;
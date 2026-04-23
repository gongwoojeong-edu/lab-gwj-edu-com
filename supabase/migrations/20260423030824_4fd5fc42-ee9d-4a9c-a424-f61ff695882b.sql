
-- 1. Storage bucket for analysis materials (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('analysis-materials', 'analysis-materials', false)
ON CONFLICT (id) DO NOTHING;

-- 2. Storage RLS policies
CREATE POLICY "analysis_materials_select_authenticated"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'analysis-materials');

CREATE POLICY "analysis_materials_insert_staff"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'analysis-materials'
  AND (public.has_role(auth.uid(), 'teacher'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role))
);

CREATE POLICY "analysis_materials_update_staff"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'analysis-materials'
  AND (public.has_role(auth.uid(), 'teacher'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role))
);

CREATE POLICY "analysis_materials_delete_staff"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'analysis-materials'
  AND (public.has_role(auth.uid(), 'teacher'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role))
);

-- 3. Add columns to textbook_passages
ALTER TABLE public.textbook_passages
  ADD COLUMN IF NOT EXISTS analysis_pdf_url text,
  ADD COLUMN IF NOT EXISTS analysis_pdf_name text,
  ADD COLUMN IF NOT EXISTS analysis_pdf_uploaded_at timestamptz;

-- 4. Add columns to print_requests
ALTER TABLE public.print_requests
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'handout',
  ADD COLUMN IF NOT EXISTS file_url text;

-- Optional check for kind values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'print_requests_kind_check'
  ) THEN
    ALTER TABLE public.print_requests
      ADD CONSTRAINT print_requests_kind_check CHECK (kind IN ('handout', 'analysis'));
  END IF;
END $$;

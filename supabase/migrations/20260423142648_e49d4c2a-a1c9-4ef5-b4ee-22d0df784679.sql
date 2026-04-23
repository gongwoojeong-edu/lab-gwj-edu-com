-- Import tokens for external integrations (e.g., Claude Passage Analyzer)
CREATE TABLE public.import_tokens (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  teacher_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE,
  label text NOT NULL DEFAULT 'Claude 지문분석기',
  last_used_at timestamp with time zone,
  revoked boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_import_tokens_teacher ON public.import_tokens(teacher_id);
CREATE INDEX idx_import_tokens_hash ON public.import_tokens(token_hash) WHERE revoked = false;

ALTER TABLE public.import_tokens ENABLE ROW LEVEL SECURITY;

-- Teachers can view their own tokens; admins can view all
CREATE POLICY "import_tokens_select_self_or_admin"
ON public.import_tokens
FOR SELECT
USING (teacher_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

-- Teachers can issue tokens for themselves
CREATE POLICY "import_tokens_insert_self"
ON public.import_tokens
FOR INSERT
WITH CHECK (
  teacher_id = auth.uid()
  AND (public.has_role(auth.uid(), 'teacher'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role))
);

-- Teachers can update (revoke) their own tokens
CREATE POLICY "import_tokens_update_self_or_admin"
ON public.import_tokens
FOR UPDATE
USING (teacher_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (teacher_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

-- Admins can delete tokens
CREATE POLICY "import_tokens_delete_admin"
ON public.import_tokens
FOR DELETE
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Trigger to auto-update updated_at
CREATE TRIGGER import_tokens_set_updated_at
BEFORE UPDATE ON public.import_tokens
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- Make analysis-materials bucket policies allow service role uploads (already private, service role bypasses RLS)
-- No bucket changes needed; we'll upload via service role in edge function.

-- 1) Status enum
DO $$ BEGIN
  CREATE TYPE public.analysis_review_status AS ENUM ('pending','approved','rejected','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Table
CREATE TABLE IF NOT EXISTS public.analysis_review_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  sentence_id text NOT NULL,
  attempt_no integer NOT NULL DEFAULT 1,
  analysis_rate numeric NOT NULL DEFAULT 0,
  required_filled boolean NOT NULL DEFAULT false,
  track text NOT NULL DEFAULT 'normal' CHECK (track IN ('normal','fail_assist')),
  status public.analysis_review_status NOT NULL DEFAULT 'pending',
  requested_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  responded_by uuid,
  response_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_arr_status_requested
  ON public.analysis_review_requests (status, requested_at);
CREATE INDEX IF NOT EXISTS idx_arr_user_sentence
  ON public.analysis_review_requests (user_id, sentence_id);

-- Only one open (pending/approved) request per user/sentence/attempt
CREATE UNIQUE INDEX IF NOT EXISTS uq_arr_open_per_attempt
  ON public.analysis_review_requests (user_id, sentence_id, attempt_no)
  WHERE status IN ('pending','approved');

-- 3) updated_at trigger
DROP TRIGGER IF EXISTS trg_arr_updated_at ON public.analysis_review_requests;
CREATE TRIGGER trg_arr_updated_at
  BEFORE UPDATE ON public.analysis_review_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4) RLS
ALTER TABLE public.analysis_review_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS arr_select ON public.analysis_review_requests;
CREATE POLICY arr_select ON public.analysis_review_requests
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'teacher'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

DROP POLICY IF EXISTS arr_insert_self ON public.analysis_review_requests;
CREATE POLICY arr_insert_self ON public.analysis_review_requests
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Student can update only their own row to cancel; staff can update anything
DROP POLICY IF EXISTS arr_update ON public.analysis_review_requests;
CREATE POLICY arr_update ON public.analysis_review_requests
  FOR UPDATE USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'teacher'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  ) WITH CHECK (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'teacher'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

DROP POLICY IF EXISTS arr_delete_staff ON public.analysis_review_requests;
CREATE POLICY arr_delete_staff ON public.analysis_review_requests
  FOR DELETE USING (
    public.has_role(auth.uid(), 'admin'::app_role)
  );

-- 5) Realtime
ALTER TABLE public.analysis_review_requests REPLICA IDENTITY FULL;
DO $$ BEGIN
  PERFORM 1 FROM pg_publication_tables
   WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='analysis_review_requests';
  IF NOT FOUND THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.analysis_review_requests';
  END IF;
END $$;

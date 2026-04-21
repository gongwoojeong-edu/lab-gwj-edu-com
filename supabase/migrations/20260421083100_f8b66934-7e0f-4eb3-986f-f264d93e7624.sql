-- Enum for print request status
DO $$ BEGIN
  CREATE TYPE public.print_request_status AS ENUM ('pending', 'printed', 'canceled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.print_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  teacher_id uuid,
  sentence_id text NOT NULL,
  status public.print_request_status NOT NULL DEFAULT 'pending',
  note text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  handled_at timestamptz,
  handled_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One pending request per user/sentence
CREATE UNIQUE INDEX print_requests_pending_unique
  ON public.print_requests (user_id, sentence_id)
  WHERE status = 'pending';

CREATE INDEX print_requests_status_idx ON public.print_requests (status, requested_at);
CREATE INDEX print_requests_user_idx ON public.print_requests (user_id);

ALTER TABLE public.print_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY pr_select ON public.print_requests
  FOR SELECT USING (
    user_id = auth.uid()
    OR has_role(auth.uid(), 'teacher'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY pr_insert_self ON public.print_requests
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY pr_update_staff ON public.print_requests
  FOR UPDATE USING (
    has_role(auth.uid(), 'teacher'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
  ) WITH CHECK (
    has_role(auth.uid(), 'teacher'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY pr_delete_staff ON public.print_requests
  FOR DELETE USING (
    has_role(auth.uid(), 'teacher'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
  );

CREATE TRIGGER print_requests_set_updated
  BEFORE UPDATE ON public.print_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.print_requests;
ALTER TABLE public.print_requests REPLICA IDENTITY FULL;
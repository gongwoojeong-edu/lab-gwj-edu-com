
-- handout_results table
CREATE TABLE public.handout_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  teacher_id uuid,
  test_date date NOT NULL DEFAULT CURRENT_DATE,
  session_no integer NOT NULL DEFAULT 1,
  word_ho_score numeric(5,2),
  syntax_ho_result text CHECK (syntax_ho_result IN ('PASS','FAIL')),
  is_integrated boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, test_date)
);

CREATE INDEX idx_handout_results_user_date ON public.handout_results (user_id, test_date DESC);

ALTER TABLE public.handout_results ENABLE ROW LEVEL SECURITY;

-- RLS: student can read own
CREATE POLICY "hr_select_self_or_staff" ON public.handout_results
FOR SELECT USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'teacher')
  OR public.has_role(auth.uid(), 'admin')
);

-- RLS: staff can insert/update/delete
CREATE POLICY "hr_staff_insert" ON public.handout_results
FOR INSERT WITH CHECK (
  public.has_role(auth.uid(), 'teacher')
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "hr_staff_update" ON public.handout_results
FOR UPDATE USING (
  public.has_role(auth.uid(), 'teacher')
  OR public.has_role(auth.uid(), 'admin')
) WITH CHECK (
  public.has_role(auth.uid(), 'teacher')
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "hr_staff_delete" ON public.handout_results
FOR DELETE USING (
  public.has_role(auth.uid(), 'admin')
);

-- updated_at trigger
CREATE TRIGGER trg_handout_results_updated_at
BEFORE UPDATE ON public.handout_results
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- next_session_no helper
CREATE OR REPLACE FUNCTION public.next_session_no(p_user_id uuid, p_test_date date)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT count(*)::int + 1
     FROM public.handout_results
     WHERE user_id = p_user_id
       AND test_date < p_test_date),
    1
  );
$$;

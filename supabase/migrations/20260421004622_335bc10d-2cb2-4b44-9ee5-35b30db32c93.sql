-- student_profiles 컬럼 추가
ALTER TABLE public.student_profiles
  ADD COLUMN IF NOT EXISTS word_test_pass_threshold numeric NOT NULL DEFAULT 0.8,
  ADD COLUMN IF NOT EXISTS points integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_streak integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS best_streak integer NOT NULL DEFAULT 0;

-- word_test_results 컬럼 추가
ALTER TABLE public.word_test_results
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'mixed',
  ADD COLUMN IF NOT EXISTS attempt_no integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS wrong_words jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS remediation_done boolean NOT NULL DEFAULT false;

-- points_log 신규
CREATE TABLE IF NOT EXISTS public.points_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  sentence_id text,
  delta integer NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.points_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY pl_select ON public.points_log
  FOR SELECT USING (
    user_id = auth.uid()
    OR has_role(auth.uid(), 'teacher'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY pl_insert ON public.points_log
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_points_log_user_created
  ON public.points_log(user_id, created_at DESC);

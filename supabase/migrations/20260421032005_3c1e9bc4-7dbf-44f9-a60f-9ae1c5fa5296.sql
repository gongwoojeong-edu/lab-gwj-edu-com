-- 1) sentence_attempt_logs 신규 테이블
CREATE TABLE IF NOT EXISTS public.sentence_attempt_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  sentence_id text NOT NULL,
  attempt_no integer NOT NULL DEFAULT 1,
  analysis_match_rate numeric NOT NULL DEFAULT 0,
  analysis_passed boolean NOT NULL DEFAULT false,
  word_test_score numeric NOT NULL DEFAULT 0,
  word_test_passed boolean NOT NULL DEFAULT false,
  owner_diff jsonb NOT NULL DEFAULT '[]'::jsonb,
  translation_text text,
  started_at timestamptz,
  completed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sal_user_sentence
  ON public.sentence_attempt_logs (user_id, sentence_id, completed_at DESC);

ALTER TABLE public.sentence_attempt_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY sal_select
  ON public.sentence_attempt_logs
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR has_role(auth.uid(), 'teacher'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY sal_insert
  ON public.sentence_attempt_logs
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- 2) student_profiles 컬럼 추가
ALTER TABLE public.student_profiles
  ADD COLUMN IF NOT EXISTS analysis_pass_threshold numeric NOT NULL DEFAULT 0.8,
  ADD COLUMN IF NOT EXISTS hint_mode_enabled boolean NOT NULL DEFAULT false;

-- 3) sentence_progress.status 정규화
UPDATE public.sentence_progress
  SET status = 'pending'
  WHERE status = 'in_progress';

ALTER TABLE public.sentence_progress
  ALTER COLUMN status SET DEFAULT 'pending';

ALTER TABLE public.sentence_progress
  DROP CONSTRAINT IF EXISTS sentence_progress_status_check;

ALTER TABLE public.sentence_progress
  ADD CONSTRAINT sentence_progress_status_check
  CHECK (status IN ('pending', 'pass', 'fail'));
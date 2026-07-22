
-- 1) assignments: round_no
ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS round_no INT NOT NULL DEFAULT 1;

-- 2) sentence_progress: assignment_id
ALTER TABLE public.sentence_progress
  ADD COLUMN IF NOT EXISTS assignment_id UUID NULL
    REFERENCES public.assignments(id) ON DELETE SET NULL;

-- 기존 전역 유니크 제거 후, 부분 유니크로 분리
ALTER TABLE public.sentence_progress
  DROP CONSTRAINT IF EXISTS sentence_progress_user_id_sentence_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS sentence_progress_user_sent_assign_uniq
  ON public.sentence_progress (user_id, sentence_id, assignment_id)
  WHERE assignment_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS sentence_progress_user_sent_legacy_uniq
  ON public.sentence_progress (user_id, sentence_id)
  WHERE assignment_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_sentence_progress_assignment
  ON public.sentence_progress (assignment_id);

-- 3) sentence_attempt_logs: assignment_id
ALTER TABLE public.sentence_attempt_logs
  ADD COLUMN IF NOT EXISTS assignment_id UUID NULL
    REFERENCES public.assignments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sal_assignment
  ON public.sentence_attempt_logs (assignment_id);

-- 4) sentence_approvals: assignment_id
ALTER TABLE public.sentence_approvals
  ADD COLUMN IF NOT EXISTS assignment_id UUID NULL
    REFERENCES public.assignments(id) ON DELETE SET NULL;

-- 승인 유니크: (user, sentence, assignment, attempt_no)로 확장
ALTER TABLE public.sentence_approvals
  DROP CONSTRAINT IF EXISTS sentence_approvals_user_id_sentence_id_attempt_no_key;

CREATE UNIQUE INDEX IF NOT EXISTS sentence_approvals_user_sent_assign_attempt_uniq
  ON public.sentence_approvals (user_id, sentence_id, COALESCE(assignment_id, '00000000-0000-0000-0000-000000000000'::uuid), attempt_no);

CREATE INDEX IF NOT EXISTS idx_sentence_approvals_assignment
  ON public.sentence_approvals (assignment_id);

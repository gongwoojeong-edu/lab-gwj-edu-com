ALTER TABLE public.sentence_approvals DROP CONSTRAINT IF EXISTS sentence_approvals_status_check;
ALTER TABLE public.sentence_approvals
  ADD CONSTRAINT sentence_approvals_status_check
  CHECK (status IN ('pending','approved','held'));
ALTER TABLE public.sentence_approvals
  ADD COLUMN IF NOT EXISTS held_at timestamptz,
  ADD COLUMN IF NOT EXISTS held_memo text,
  ADD COLUMN IF NOT EXISTS held_by uuid;
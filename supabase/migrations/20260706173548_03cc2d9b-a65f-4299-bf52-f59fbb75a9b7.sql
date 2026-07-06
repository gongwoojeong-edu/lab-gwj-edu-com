ALTER TABLE public.assignments
  ALTER COLUMN due_at DROP NOT NULL;

COMMENT ON COLUMN public.assignments.due_at IS
  '마감일시. NULL이면 무기한 과제.';

-- student_notifications: 학생에게 전달되는 평가/시스템 알림함
CREATE TABLE IF NOT EXISTS public.student_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL DEFAULT 'evaluation', -- evaluation | system | retest
  title text NOT NULL,
  body text,
  grade text,            -- ApprovalGrade
  sentence_id text,
  approval_id uuid,
  sent_by uuid,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_notifications TO authenticated;
GRANT ALL ON public.student_notifications TO service_role;

ALTER TABLE public.student_notifications ENABLE ROW LEVEL SECURITY;

-- 본인 알림 조회/수정(읽음처리)
CREATE POLICY "own notifications read"
  ON public.student_notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'teacher'));

CREATE POLICY "own notifications update"
  ON public.student_notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'teacher'))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'teacher'));

-- 선생님(또는 학생 본인 PIN 흐름 호환)이 알림 생성
CREATE POLICY "teacher or self insert notifications"
  ON public.student_notifications FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'teacher')
    OR sent_by = auth.uid()
    OR user_id = auth.uid()
  );

CREATE POLICY "teacher delete notifications"
  ON public.student_notifications FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'teacher'));

CREATE TRIGGER trg_set_updated_at_student_notifications
  BEFORE UPDATE ON public.student_notifications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_student_notifications_user_unread
  ON public.student_notifications (user_id, read_at, created_at DESC);

-- 실시간 구독 활성화
ALTER PUBLICATION supabase_realtime ADD TABLE public.student_notifications;

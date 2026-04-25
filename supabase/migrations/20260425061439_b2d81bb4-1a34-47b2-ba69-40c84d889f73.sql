-- 학생×지문 단위 학습 옵션 오버라이드
CREATE TABLE public.student_passage_overrides (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  sentence_id TEXT NOT NULL,
  skip_pre BOOLEAN NOT NULL DEFAULT false,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, sentence_id)
);

CREATE INDEX idx_spo_user ON public.student_passage_overrides(user_id);
CREATE INDEX idx_spo_sentence ON public.student_passage_overrides(sentence_id);

ALTER TABLE public.student_passage_overrides ENABLE ROW LEVEL SECURITY;

-- 학생 본인 또는 교사/관리자 조회 가능
CREATE POLICY spo_select
ON public.student_passage_overrides
FOR SELECT
USING (
  user_id = auth.uid()
  OR has_role(auth.uid(), 'teacher'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- 교사/관리자만 생성/수정/삭제
CREATE POLICY spo_insert_staff
ON public.student_passage_overrides
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'teacher'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY spo_update_staff
ON public.student_passage_overrides
FOR UPDATE
USING (
  has_role(auth.uid(), 'teacher'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'teacher'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY spo_delete_staff
ON public.student_passage_overrides
FOR DELETE
USING (
  has_role(auth.uid(), 'teacher'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE TRIGGER spo_set_updated_at
BEFORE UPDATE ON public.student_passage_overrides
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
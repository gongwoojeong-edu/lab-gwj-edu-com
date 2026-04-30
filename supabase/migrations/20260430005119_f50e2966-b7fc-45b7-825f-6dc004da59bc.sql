-- 1) 학생 실제 학년 컬럼 추가 (학습 레벨과 분리)
ALTER TABLE public.student_profiles
  ADD COLUMN IF NOT EXISTS actual_grade text;

COMMENT ON COLUMN public.student_profiles.actual_grade IS
  '학생의 실제 학년 (예: 초6, 중1, 고1). 학습 레벨(start_level/current_level)과는 별개. 선생님이 편집.';

-- 2) 200명 운영 대비 인덱스
CREATE INDEX IF NOT EXISTS idx_textbook_passages_textbook_passage_no
  ON public.textbook_passages (textbook_id, passage_no);

CREATE INDEX IF NOT EXISTS idx_textbook_passages_code
  ON public.textbook_passages (code);

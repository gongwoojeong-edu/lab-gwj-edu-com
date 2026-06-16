
-- 1) sentence_approvals 테이블
CREATE TABLE public.sentence_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  sentence_id text NOT NULL,
  attempt_no integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved')),
  grade text CHECK (grade IN ('excellent','good','fair','poor','redo')),
  memo text,
  approved_by uuid,
  requested_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, sentence_id, attempt_no)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sentence_approvals TO authenticated;
GRANT ALL ON public.sentence_approvals TO service_role;

ALTER TABLE public.sentence_approvals ENABLE ROW LEVEL SECURITY;

-- 학생: 본인 행 조회/생성
CREATE POLICY "students select own approvals"
ON public.sentence_approvals FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(),'teacher') OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "students insert own approvals"
ON public.sentence_approvals FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- 학생 본인도 자기 행 update 가능 (대기 → 대기 갱신 등)
CREATE POLICY "students update own pending approvals"
ON public.sentence_approvals FOR UPDATE
TO authenticated
USING (auth.uid() = user_id AND status = 'pending')
WITH CHECK (auth.uid() = user_id);

-- 선생님: 승인/수정/삭제
CREATE POLICY "teachers approve any"
ON public.sentence_approvals FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(),'teacher') OR public.has_role(auth.uid(),'admin'))
WITH CHECK (public.has_role(auth.uid(),'teacher') OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "teachers delete any"
ON public.sentence_approvals FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(),'teacher') OR public.has_role(auth.uid(),'admin'));

CREATE TRIGGER set_sentence_approvals_updated_at
BEFORE UPDATE ON public.sentence_approvals
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 실시간 구독 활성화
ALTER TABLE public.sentence_approvals REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sentence_approvals;

-- 2) sentence_progress 컬럼 2개 추가
ALTER TABLE public.sentence_progress
  ADD COLUMN IF NOT EXISTS last_grade text,
  ADD COLUMN IF NOT EXISTS last_memo text;

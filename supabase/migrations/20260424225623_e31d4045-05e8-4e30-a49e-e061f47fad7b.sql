-- 레벨 라벨 오버라이드 저장 테이블
-- 코드(L01)는 levels.ts에 고정, 표시용 라벨만 DB에서 덮어씀
CREATE TABLE IF NOT EXISTS public.level_labels (
  level text PRIMARY KEY,
  label text NOT NULL,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.level_labels ENABLE ROW LEVEL SECURITY;

-- 모든 인증 사용자 조회 가능 (라벨은 공개 정보)
CREATE POLICY "level_labels_select_authenticated"
ON public.level_labels FOR SELECT
TO authenticated
USING (true);

-- 교사/관리자만 수정
CREATE POLICY "level_labels_insert_staff"
ON public.level_labels FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'teacher'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "level_labels_update_staff"
ON public.level_labels FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'teacher'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'teacher'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "level_labels_delete_admin"
ON public.level_labels FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER level_labels_set_updated_at
BEFORE UPDATE ON public.level_labels
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
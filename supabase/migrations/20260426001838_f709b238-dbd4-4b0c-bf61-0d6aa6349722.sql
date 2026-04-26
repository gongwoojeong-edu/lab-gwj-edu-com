-- user_roles SELECT 정책 완화: admin/teacher 행은 모든 인증 사용자에게 노출
-- (student 행은 여전히 본인 또는 admin만 조회 가능 — 개인정보 보호 유지)
DROP POLICY IF EXISTS user_roles_select_own_or_admin ON public.user_roles;

CREATE POLICY user_roles_select_own_or_admin
ON public.user_roles
FOR SELECT
USING (
  user_id = auth.uid()
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'teacher'::app_role)
  OR role IN ('admin'::app_role, 'teacher'::app_role)
);
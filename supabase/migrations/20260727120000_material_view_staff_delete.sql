-- 선생님/관리자가 자료열람 요청 기록을 정리할 수 있도록
DROP POLICY IF EXISTS "mvr_delete_staff" ON public.material_view_requests;
CREATE POLICY "mvr_delete_staff" ON public.material_view_requests
  FOR DELETE
  USING (
    public.has_role(auth.uid(), 'teacher'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

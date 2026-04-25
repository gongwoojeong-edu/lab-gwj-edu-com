-- 선생님(teacher)도 처리완료된 분석 요청 행을 삭제할 수 있도록 RLS 정책 갱신
DROP POLICY IF EXISTS arr_delete_staff ON public.analysis_review_requests;
CREATE POLICY arr_delete_staff
ON public.analysis_review_requests
FOR DELETE
USING (
  has_role(auth.uid(), 'teacher'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
);
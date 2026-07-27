-- 요청확인: 2026-07-01(KST) 이전 내역 삭제 (7월분부터 유지)
-- Lovable Cloud SQL Editor에서 실행

BEGIN;

DELETE FROM public.print_requests
WHERE requested_at < TIMESTAMPTZ '2026-06-30 15:00:00+00';

DELETE FROM public.analysis_review_requests
WHERE requested_at < TIMESTAMPTZ '2026-06-30 15:00:00+00';

DELETE FROM public.material_view_requests
WHERE requested_at < TIMESTAMPTZ '2026-06-30 15:00:00+00';

-- 유닛 인쇄 대기만 제거 (이미 인쇄·학습완료된 워크플로는 유지)
DELETE FROM public.unit_workflows
WHERE status = 'print_pending'
  AND print_requested_at < TIMESTAMPTZ '2026-06-30 15:00:00+00';

-- 자료열람 staff 삭제 권한 (앱 버튼용, 없으면 추가)
DROP POLICY IF EXISTS "mvr_delete_staff" ON public.material_view_requests;
CREATE POLICY "mvr_delete_staff" ON public.material_view_requests
  FOR DELETE
  USING (
    public.has_role(auth.uid(), 'teacher'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

COMMIT;

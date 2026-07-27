-- 요청확인: 2026-07-01(KST) 이전 내역 1회 정리용 (7월분부터 유지)
-- Lovable Cloud SQL Editor에서 실행

BEGIN;

DELETE FROM public.print_requests
WHERE requested_at < TIMESTAMPTZ '2026-06-30 15:00:00+00';

DELETE FROM public.analysis_review_requests
WHERE requested_at < TIMESTAMPTZ '2026-06-30 15:00:00+00';

DELETE FROM public.material_view_requests
WHERE requested_at < TIMESTAMPTZ '2026-06-30 15:00:00+00';

DELETE FROM public.unit_workflows
WHERE status = 'print_pending'
  AND print_requested_at < TIMESTAMPTZ '2026-06-30 15:00:00+00';

COMMIT;

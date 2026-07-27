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
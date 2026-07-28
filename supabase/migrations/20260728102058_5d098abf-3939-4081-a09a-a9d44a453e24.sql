
CREATE OR REPLACE FUNCTION public.class_kpis_today()
RETURNS TABLE (
  active_today integer,
  total_students integer,
  pass_sentences_today integer,
  weekly_active_students integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH bounds AS (
    SELECT
      date_trunc('day', (now() AT TIME ZONE 'Asia/Seoul'))
        AT TIME ZONE 'Asia/Seoul' AS day_start,
      (date_trunc('day', (now() AT TIME ZONE 'Asia/Seoul'))
        AT TIME ZONE 'Asia/Seoul') + interval '1 day' AS day_end,
      now() - interval '7 days' AS week_start
  )
  SELECT
    (SELECT COUNT(DISTINCT user_id)::int
       FROM public.sentence_attempt_logs, bounds
       WHERE completed_at >= bounds.day_start
         AND completed_at <  bounds.day_end),
    (SELECT COUNT(*)::int FROM public.student_profiles),
    (SELECT COUNT(*)::int
       FROM public.sentence_progress, bounds
       WHERE status = 'pass'
         AND passed_at >= bounds.day_start
         AND passed_at <  bounds.day_end),
    (SELECT COUNT(DISTINCT user_id)::int
       FROM public.sentence_attempt_logs, bounds
       WHERE completed_at >= bounds.week_start);
$$;

GRANT EXECUTE ON FUNCTION public.class_kpis_today() TO authenticated;

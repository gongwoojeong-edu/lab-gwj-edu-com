CREATE OR REPLACE FUNCTION public.class_kpis_today()
RETURNS TABLE (
  active_today integer,
  total_students integer,
  pass_sentences_today integer,
  weekly_active_students integer,
  avg_integrated_today numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH bounds AS (
    SELECT
      date_trunc('day', (now() AT TIME ZONE 'Asia/Seoul'))
        AT TIME ZONE 'Asia/Seoul' AS day_start,
      (date_trunc('day', (now() AT TIME ZONE 'Asia/Seoul'))
        AT TIME ZONE 'Asia/Seoul') + interval '1 day' AS day_end,
      ((now() AT TIME ZONE 'Asia/Seoul')::date) AS today_date,
      now() - interval '7 days' AS week_start
  ),
  active_today_users AS (
    SELECT DISTINCT sal.user_id
    FROM public.sentence_attempt_logs sal, bounds b
    WHERE sal.completed_at >= b.day_start
      AND sal.completed_at <  b.day_end
  ),
  analysis_avg AS (
    SELECT sal.user_id, AVG(COALESCE(sal.analysis_match_rate, 0) * 100)::numeric AS score
    FROM public.sentence_attempt_logs sal, bounds b
    WHERE sal.completed_at >= b.day_start
      AND sal.completed_at <  b.day_end
    GROUP BY sal.user_id
  ),
  word_avg AS (
    SELECT wtr.user_id, AVG(COALESCE(wtr.score, 0) * 100)::numeric AS score
    FROM public.word_test_results wtr, bounds b
    WHERE wtr.taken_at >= b.day_start
      AND wtr.taken_at <  b.day_end
    GROUP BY wtr.user_id
  ),
  handout_avg AS (
    SELECT
      hr.user_id,
      AVG(hr.word_ho_score)::numeric AS word_ho,
      AVG(CASE WHEN hr.syntax_ho_result = 'PASS' THEN 100::numeric
               WHEN hr.syntax_ho_result = 'FAIL' THEN 0::numeric
               ELSE NULL::numeric END) AS syntax_ho
    FROM public.handout_results hr, bounds b
    WHERE hr.test_date = b.today_date
    GROUP BY hr.user_id
  ),
  integrated_users AS (
    SELECT user_id FROM active_today_users
    UNION
    SELECT user_id FROM handout_avg
  ),
  integrated_scores AS (
    SELECT
      u.user_id,
      (
        COALESCE(a.score, 0) * CASE WHEN a.score IS NULL THEN 0 ELSE 0.4 END +
        COALESCE(w.score, 0) * CASE WHEN w.score IS NULL THEN 0 ELSE 0.3 END +
        COALESCE(h.word_ho, 0) * CASE WHEN h.word_ho IS NULL THEN 0 ELSE 0.2 END +
        COALESCE(h.syntax_ho, 0) * CASE WHEN h.syntax_ho IS NULL THEN 0 ELSE 0.1 END
      ) /
      NULLIF(
        CASE WHEN a.score IS NULL THEN 0 ELSE 0.4 END +
        CASE WHEN w.score IS NULL THEN 0 ELSE 0.3 END +
        CASE WHEN h.word_ho IS NULL THEN 0 ELSE 0.2 END +
        CASE WHEN h.syntax_ho IS NULL THEN 0 ELSE 0.1 END,
        0
      ) AS integrated_score
    FROM integrated_users u
    LEFT JOIN analysis_avg a ON a.user_id = u.user_id
    LEFT JOIN word_avg w ON w.user_id = u.user_id
    LEFT JOIN handout_avg h ON h.user_id = u.user_id
  )
  SELECT
    (SELECT COUNT(*)::int FROM active_today_users),
    (SELECT COUNT(*)::int FROM public.student_profiles WHERE orbit_enrollment_active IS DISTINCT FROM false),
    (SELECT COUNT(*)::int
       FROM public.sentence_progress sp, bounds b
       WHERE sp.status = 'pass'
         AND sp.passed_at >= b.day_start
         AND sp.passed_at <  b.day_end),
    (SELECT COUNT(DISTINCT sal.user_id)::int
       FROM public.sentence_attempt_logs sal, bounds b
       WHERE sal.completed_at >= b.week_start),
    (SELECT AVG(integrated_score)::numeric FROM integrated_scores WHERE integrated_score IS NOT NULL);
$$;

REVOKE EXECUTE ON FUNCTION public.class_kpis_today() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.class_kpis_today() FROM anon;
GRANT EXECUTE ON FUNCTION public.class_kpis_today() TO authenticated;
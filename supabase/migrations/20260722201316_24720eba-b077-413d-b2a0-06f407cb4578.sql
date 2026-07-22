-- 서비스 롤에서만 호출 가능한 시크릿 동기화 함수
CREATE OR REPLACE FUNCTION public.upsert_cron_secret(p_secret text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM vault.secrets WHERE name = 'sync_orbit_english_cron_secret';
  IF v_id IS NULL THEN
    PERFORM vault.create_secret(p_secret, 'sync_orbit_english_cron_secret', 'pg_cron 이 sync-orbit-english 를 호출할 때 사용하는 공유 시크릿');
  ELSE
    PERFORM vault.update_secret(v_id, p_secret);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_cron_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_cron_secret(text) TO service_role;

-- 기존 잡 제거 후 재등록 (vault 의 시크릿을 X-Cron-Secret 로 전달)
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT jobid FROM cron.job WHERE jobname = 'sync-orbit-english-daily' LOOP
    PERFORM cron.unschedule(r.jobid);
  END LOOP;
END $$;

SELECT cron.schedule(
  'sync-orbit-english-daily',
  '0 19 * * *',  -- UTC 19:00 = KST 새벽 4:00
  $cron$
  SELECT net.http_post(
    url := 'https://vyiwfkctilezvpafqjek.supabase.co/functions/v1/sync-orbit-english',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ5aXdma2N0aWxlenZwYWZxamVrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2OTQ3ODQsImV4cCI6MjA5MjI3MDc4NH0.v9F2SBTDuBvKhgPnrx80QGrXLoNKa6UMWnK6Pqnob18',
      'X-Cron-Secret', COALESCE((SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'sync_orbit_english_cron_secret' LIMIT 1), '')
    ),
    body := '{}'::jsonb
  );
  $cron$
);
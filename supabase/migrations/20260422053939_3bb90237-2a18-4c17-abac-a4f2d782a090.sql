-- Drop legacy unique constraints/indexes on (user_id, test_date) if present
DO $$
DECLARE
  r RECORD;
BEGIN
  -- Drop unique constraints on handout_results that span exactly (user_id, test_date)
  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class cls ON cls.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = cls.relnamespace
    WHERE ns.nspname = 'public'
      AND cls.relname = 'handout_results'
      AND con.contype IN ('u','p')
      AND (
        SELECT array_agg(att.attname ORDER BY att.attname)
        FROM unnest(con.conkey) AS k(attnum)
        JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = k.attnum
      ) = ARRAY['test_date','user_id']::name[]
  LOOP
    EXECUTE format('ALTER TABLE public.handout_results DROP CONSTRAINT %I', r.conname);
  END LOOP;

  -- Drop unique indexes on handout_results that span exactly (user_id, test_date) and aren't backing a constraint
  FOR r IN
    SELECT i.indexname
    FROM pg_indexes i
    JOIN pg_class c ON c.relname = i.indexname
    JOIN pg_index idx ON idx.indexrelid = c.oid
    WHERE i.schemaname = 'public'
      AND i.tablename = 'handout_results'
      AND idx.indisunique
      AND NOT EXISTS (
        SELECT 1 FROM pg_constraint con WHERE con.conindid = c.oid
      )
      AND (
        SELECT array_agg(att.attname ORDER BY att.attname)
        FROM unnest(idx.indkey) WITH ORDINALITY AS k(attnum, ord)
        JOIN pg_attribute att ON att.attrelid = idx.indrelid AND att.attnum = k.attnum
      ) = ARRAY['test_date','user_id']::name[]
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS public.%I', r.indexname);
  END LOOP;
END $$;

-- Ensure a unique index on (user_id, test_date, COALESCE(sentence_id,'')) exists
CREATE UNIQUE INDEX IF NOT EXISTS handout_results_user_date_sentence_uniq
  ON public.handout_results (user_id, test_date, COALESCE(sentence_id, ''));

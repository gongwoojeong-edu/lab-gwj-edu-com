ALTER TABLE public.student_profiles
  DROP CONSTRAINT IF EXISTS student_profiles_campus_check;

ALTER TABLE public.student_profiles
  ADD COLUMN IF NOT EXISTS orbit_class_id uuid,
  ADD COLUMN IF NOT EXISTS orbit_class_name text;

COMMENT ON COLUMN public.student_profiles.orbit_class_id IS 'Orbit orbit.classes.id (영어 반)';
COMMENT ON COLUMN public.student_profiles.orbit_class_name IS 'Orbit 영어 반 표시명';

CREATE TABLE IF NOT EXISTS public.orbit_staff_cache (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  rank integer NOT NULL DEFAULT 1,
  campus_id uuid,
  campus_name text,
  employee_no text,
  subjects text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  platform_auth_user_id uuid,
  auth_user_id uuid,
  synced_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.orbit_staff_cache TO authenticated;
GRANT ALL ON public.orbit_staff_cache TO service_role;

ALTER TABLE public.orbit_staff_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orbit_staff_cache_select_staff" ON public.orbit_staff_cache;
CREATE POLICY "orbit_staff_cache_select_staff"
  ON public.orbit_staff_cache
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'teacher'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS "orbit_staff_cache_service_all" ON public.orbit_staff_cache;
CREATE POLICY "orbit_staff_cache_service_all"
  ON public.orbit_staff_cache
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE TABLE IF NOT EXISTS public.orbit_campus_cache (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.orbit_campus_cache TO authenticated;
GRANT ALL ON public.orbit_campus_cache TO service_role;

ALTER TABLE public.orbit_campus_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orbit_campus_cache_select_staff" ON public.orbit_campus_cache;
CREATE POLICY "orbit_campus_cache_select_staff"
  ON public.orbit_campus_cache
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'teacher'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS "orbit_campus_cache_service_all" ON public.orbit_campus_cache;
CREATE POLICY "orbit_campus_cache_service_all"
  ON public.orbit_campus_cache
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
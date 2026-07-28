REVOKE EXECUTE ON FUNCTION public.class_kpis_today() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.class_kpis_today() FROM anon;
GRANT EXECUTE ON FUNCTION public.class_kpis_today() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_save_annotation(text, uuid, text, jsonb, numeric) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_delete_annotation(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_restore_annotation(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_student_skip_sentence(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_student_skip_sentence(text, text) TO authenticated;
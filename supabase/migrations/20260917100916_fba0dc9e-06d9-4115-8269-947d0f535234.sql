CREATE OR REPLACE FUNCTION public.fn_student_skip_sentence(p_sentence_id text, p_pin text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다';
  END IF;

  IF p_pin IS NULL OR btrim(p_pin) = '' THEN
    RAISE EXCEPTION 'PIN이 필요합니다';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.student_profiles sp
    WHERE sp.teacher_pin IS NOT NULL
      AND btrim(sp.teacher_pin) = btrim(p_pin)
  ) THEN
    RAISE EXCEPTION 'PIN이 일치하지 않습니다';
  END IF;

  INSERT INTO public.student_passage_overrides (user_id, sentence_id, skip_sentence, created_by)
  VALUES (v_uid, p_sentence_id, true, v_uid)
  ON CONFLICT (user_id, sentence_id)
  DO UPDATE SET skip_sentence = true, updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_student_skip_sentence(text, text) TO authenticated;
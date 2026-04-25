-- 1) 비어있는 학생에게 기본 패스키 일괄 부여
UPDATE public.student_profiles
SET teacher_pin = '0999', updated_at = now()
WHERE teacher_pin IS NULL OR teacher_pin = '';

-- 2) 신규 가입 트리거 함수 갱신: 기본 PIN '0999' 부여
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_student_no text;
BEGIN
  v_student_no := COALESCE(NEW.raw_user_meta_data->>'student_no', split_part(NEW.email, '@', 1));

  INSERT INTO public.student_profiles (user_id, student_no, display_name, teacher_pin)
  VALUES (
    NEW.id,
    v_student_no,
    COALESCE(NEW.raw_user_meta_data->>'display_name', v_student_no),
    '0999'
  )
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'student')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$function$;
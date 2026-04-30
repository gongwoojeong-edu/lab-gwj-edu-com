-- 1) handle_new_user 트리거 수정: 선생님 계정(t로 시작하는 student_no)은 student_profiles/student role 생성하지 않음
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_student_no text;
  v_is_teacher boolean;
BEGIN
  v_student_no := COALESCE(NEW.raw_user_meta_data->>'student_no', split_part(NEW.email, '@', 1));
  -- 'gwjt001' 같은 선생님 계정 식별
  v_is_teacher := v_student_no ~ '^(gwj)?t[0-9]+$';

  IF NOT v_is_teacher THEN
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
  END IF;

  RETURN NEW;
END;
$function$;

-- 2) 기존에 선생님 계정인데 student_profile/student role 이 있는 잘못된 데이터 정리
-- (teacher 역할을 가진 사용자 중 student_no가 t로 시작하는 경우)
DELETE FROM public.student_profiles
WHERE user_id IN (
  SELECT sp.user_id
  FROM public.student_profiles sp
  JOIN public.user_roles ur ON ur.user_id = sp.user_id AND ur.role = 'teacher'
  WHERE sp.student_no ~ '^(gwj)?t[0-9]+$'
);

DELETE FROM public.user_roles
WHERE role = 'student'
  AND user_id IN (
    SELECT ur.user_id FROM public.user_roles ur
    WHERE ur.role = 'teacher'
      AND EXISTS (
        SELECT 1 FROM auth.users u
        WHERE u.id = ur.user_id
          AND COALESCE(u.raw_user_meta_data->>'student_no', split_part(u.email, '@', 1)) ~ '^(gwj)?t[0-9]+$'
      )
  );

-- 3) 학생들의 current_level이 start_level과 어긋난 경우 start_level로 정렬
-- (선생님이 지정한 레벨이 항상 진실. 학습 진도는 current_no로만 관리)
UPDATE public.student_profiles
SET current_level = start_level,
    current_no = CASE WHEN current_level <> start_level THEN 1 ELSE current_no END
WHERE current_level <> start_level;
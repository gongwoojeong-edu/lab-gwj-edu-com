
-- 1) student_profile 생성 (교사 auth id로) — 팬텀에서 개인정보 복사
INSERT INTO public.student_profiles (user_id, student_no, display_name, teacher_pin, orbit_enrollment_active)
SELECT '65a4e730-75be-48d8-9087-d487215274f4', 'gwjt512', '정혜진', '0999', false
WHERE NOT EXISTS (SELECT 1 FROM public.student_profiles WHERE user_id='65a4e730-75be-48d8-9087-d487215274f4');

INSERT INTO public.student_profiles (user_id, student_no, display_name, teacher_pin, orbit_enrollment_active)
SELECT '64e87e20-d7f0-4179-84a9-66937fb64077', 'gwjt509', '안은정', '0999', false
WHERE NOT EXISTS (SELECT 1 FROM public.student_profiles WHERE user_id='64e87e20-d7f0-4179-84a9-66937fb64077');

-- 2) student 역할 부여 (교사 auth id에)
INSERT INTO public.user_roles (user_id, role)
VALUES
  ('65a4e730-75be-48d8-9087-d487215274f4', 'student'),
  ('64e87e20-d7f0-4179-84a9-66937fb64077', 'student')
ON CONFLICT (user_id, role) DO NOTHING;

-- 3) 과제를 교사 auth id로 이관
UPDATE public.assignments SET student_id='65a4e730-75be-48d8-9087-d487215274f4'
WHERE student_id='40dd53ee-c9d1-4c50-ba44-b34d05d2e82d';

UPDATE public.assignments SET student_id='64e87e20-d7f0-4179-84a9-66937fb64077'
WHERE student_id='d787b76d-435c-4b73-bd03-cef5d3db0577';

-- 4) 팬텀 학생 프로필 제거 (드롭다운 중복 방지)
DELETE FROM public.student_profiles
WHERE user_id IN ('40dd53ee-c9d1-4c50-ba44-b34d05d2e82d','d787b76d-435c-4b73-bd03-cef5d3db0577');

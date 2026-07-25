-- 반 이름 글자 파싱으로 잘못 들어간 등원요일 초기화
-- (예: 「일반」→ 일=SUN, 「월화수목」오인 등). 이후 sync가 올바른 값만 다시 채움.
UPDATE public.student_profiles
SET orbit_class_days = NULL
WHERE orbit_class_days IS NOT NULL;

-- Orbit 동기화 재원 상태 (퇴원·휴원 시 lab 학생목록에서 제외)
ALTER TABLE public.student_profiles
  ADD COLUMN IF NOT EXISTS orbit_enrollment_active boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.student_profiles.orbit_enrollment_active IS
  'Orbit 영어과 재원 여부. false=퇴원·휴원·동기화 제외';

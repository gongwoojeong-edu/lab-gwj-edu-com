ALTER TABLE public.student_profiles ADD COLUMN IF NOT EXISTS campus TEXT 
  CHECK (campus IS NULL OR campus IN ('인의', '문성'));
ALTER TABLE public.student_profiles ADD COLUMN IF NOT EXISTS school_name TEXT;
ALTER TABLE public.student_profiles ADD COLUMN IF NOT EXISTS textbook_publisher TEXT 
  CHECK (textbook_publisher IS NULL OR textbook_publisher IN 
    ('동아', '천재', '비상', 'YBM', '지학사', '능률', 'EBS', '기타'));
ALTER TABLE public.student_profiles ADD COLUMN IF NOT EXISTS homeroom_teacher_id UUID;
ALTER TABLE public.student_profiles ADD COLUMN IF NOT EXISTS enrolled_since DATE;
ALTER TABLE public.student_profiles ADD COLUMN IF NOT EXISTS grade_unlock TEXT[] DEFAULT '{}';
ALTER TABLE public.student_profiles ADD COLUMN IF NOT EXISTS access_level TEXT DEFAULT 'standard'
  CHECK (access_level IN ('standard', 'advanced', 'review', 'beta'));
ALTER TABLE public.student_profiles ADD COLUMN IF NOT EXISTS notes TEXT;
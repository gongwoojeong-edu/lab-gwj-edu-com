
-- 1. app_role enum + user_roles
CREATE TYPE public.app_role AS ENUM ('student', 'teacher', 'admin');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "user_roles_select_own_or_admin" ON public.user_roles
  FOR SELECT USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "user_roles_admin_all" ON public.user_roles
  FOR ALL USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2. student_profiles
CREATE TABLE public.student_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  student_no text NOT NULL UNIQUE,
  display_name text,
  start_level text NOT NULL DEFAULT 'L01',
  current_level text NOT NULL DEFAULT 'L01',
  current_no integer NOT NULL DEFAULT 1,
  teacher_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.student_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sp_select_self_or_staff" ON public.student_profiles
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'teacher')
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "sp_update_self_progress" ON public.student_profiles
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "sp_staff_all" ON public.student_profiles
  FOR ALL USING (
    public.has_role(auth.uid(), 'teacher') OR public.has_role(auth.uid(), 'admin')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'teacher') OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "sp_insert_self" ON public.student_profiles
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE TRIGGER sp_set_updated_at
  BEFORE UPDATE ON public.student_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. handle_new_user trigger: 회원가입 시 student_profiles + student role 자동 생성
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_no text;
BEGIN
  v_student_no := COALESCE(NEW.raw_user_meta_data->>'student_no', split_part(NEW.email, '@', 1));

  INSERT INTO public.student_profiles (user_id, student_no, display_name)
  VALUES (NEW.id, v_student_no, COALESCE(NEW.raw_user_meta_data->>'display_name', v_student_no))
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'student')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. word_pre_results
CREATE TABLE public.word_pre_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  sentence_id text NOT NULL,
  known_words text[] NOT NULL DEFAULT '{}',
  unknown_words text[] NOT NULL DEFAULT '{}',
  completed boolean NOT NULL DEFAULT true,
  taken_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.word_pre_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wpr_select_self_or_staff" ON public.word_pre_results
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'teacher')
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "wpr_insert_self" ON public.word_pre_results
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "wpr_update_self" ON public.word_pre_results
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "wpr_delete_self" ON public.word_pre_results
  FOR DELETE USING (user_id = auth.uid());

CREATE INDEX idx_wpr_user_sentence ON public.word_pre_results (user_id, sentence_id, taken_at DESC);

-- 5. sentence_progress.pre_done 컬럼
ALTER TABLE public.sentence_progress
  ADD COLUMN IF NOT EXISTS pre_done boolean NOT NULL DEFAULT false;

-- 6. 기존 테이블 RLS 강화: 익명 정책 제거 + 인증 사용자/스태프만
-- sentence_progress
DROP POLICY IF EXISTS "sentence_progress_select" ON public.sentence_progress;
DROP POLICY IF EXISTS "sentence_progress_insert" ON public.sentence_progress;
DROP POLICY IF EXISTS "sentence_progress_update" ON public.sentence_progress;
DROP POLICY IF EXISTS "sentence_progress_delete" ON public.sentence_progress;

CREATE POLICY "sp2_select" ON public.sentence_progress FOR SELECT
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'teacher') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "sp2_insert" ON public.sentence_progress FOR INSERT
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "sp2_update" ON public.sentence_progress FOR UPDATE
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "sp2_delete" ON public.sentence_progress FOR DELETE
  USING (user_id = auth.uid());

-- sentence_translations
DROP POLICY IF EXISTS "sentence_translations_select" ON public.sentence_translations;
DROP POLICY IF EXISTS "sentence_translations_insert" ON public.sentence_translations;
DROP POLICY IF EXISTS "sentence_translations_update" ON public.sentence_translations;
DROP POLICY IF EXISTS "sentence_translations_delete" ON public.sentence_translations;

CREATE POLICY "st2_select" ON public.sentence_translations FOR SELECT
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'teacher') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "st2_insert" ON public.sentence_translations FOR INSERT
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "st2_update" ON public.sentence_translations FOR UPDATE
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "st2_delete" ON public.sentence_translations FOR DELETE
  USING (user_id = auth.uid());

-- word_test_results
DROP POLICY IF EXISTS "word_test_results_select" ON public.word_test_results;
DROP POLICY IF EXISTS "word_test_results_insert" ON public.word_test_results;
DROP POLICY IF EXISTS "word_test_results_update" ON public.word_test_results;
DROP POLICY IF EXISTS "word_test_results_delete" ON public.word_test_results;

CREATE POLICY "wtr2_select" ON public.word_test_results FOR SELECT
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'teacher') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "wtr2_insert" ON public.word_test_results FOR INSERT
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "wtr2_update" ON public.word_test_results FOR UPDATE
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "wtr2_delete" ON public.word_test_results FOR DELETE
  USING (user_id = auth.uid());

-- owner_progress
DROP POLICY IF EXISTS "owner_progress_select" ON public.owner_progress;
DROP POLICY IF EXISTS "owner_progress_insert" ON public.owner_progress;
DROP POLICY IF EXISTS "owner_progress_update" ON public.owner_progress;
DROP POLICY IF EXISTS "owner_progress_delete" ON public.owner_progress;

CREATE POLICY "op2_select" ON public.owner_progress FOR SELECT
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'teacher') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "op2_insert" ON public.owner_progress FOR INSERT
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "op2_update" ON public.owner_progress FOR UPDATE
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "op2_delete" ON public.owner_progress FOR DELETE
  USING (user_id = auth.uid());

-- badge_offsets
DROP POLICY IF EXISTS "badge_offsets_select" ON public.badge_offsets;
DROP POLICY IF EXISTS "badge_offsets_insert" ON public.badge_offsets;
DROP POLICY IF EXISTS "badge_offsets_update" ON public.badge_offsets;
DROP POLICY IF EXISTS "badge_offsets_delete" ON public.badge_offsets;

CREATE POLICY "bo2_select" ON public.badge_offsets FOR SELECT
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'teacher') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "bo2_insert" ON public.badge_offsets FOR INSERT
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "bo2_update" ON public.badge_offsets FOR UPDATE
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "bo2_delete" ON public.badge_offsets FOR DELETE
  USING (user_id = auth.uid());

-- modifier_relations
DROP POLICY IF EXISTS "modifier_relations_select" ON public.modifier_relations;
DROP POLICY IF EXISTS "modifier_relations_insert" ON public.modifier_relations;
DROP POLICY IF EXISTS "modifier_relations_update" ON public.modifier_relations;
DROP POLICY IF EXISTS "modifier_relations_delete" ON public.modifier_relations;

CREATE POLICY "mr2_select" ON public.modifier_relations FOR SELECT
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'teacher') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "mr2_insert" ON public.modifier_relations FOR INSERT
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "mr2_update" ON public.modifier_relations FOR UPDATE
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "mr2_delete" ON public.modifier_relations FOR DELETE
  USING (user_id = auth.uid());

-- referent_relations
DROP POLICY IF EXISTS "referent_relations_select" ON public.referent_relations;
DROP POLICY IF EXISTS "referent_relations_insert" ON public.referent_relations;
DROP POLICY IF EXISTS "referent_relations_update" ON public.referent_relations;
DROP POLICY IF EXISTS "referent_relations_delete" ON public.referent_relations;

CREATE POLICY "rr2_select" ON public.referent_relations FOR SELECT
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'teacher') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "rr2_insert" ON public.referent_relations FOR INSERT
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "rr2_update" ON public.referent_relations FOR UPDATE
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "rr2_delete" ON public.referent_relations FOR DELETE
  USING (user_id = auth.uid());

-- idioms
DROP POLICY IF EXISTS "idioms_select" ON public.idioms;
DROP POLICY IF EXISTS "idioms_insert" ON public.idioms;
DROP POLICY IF EXISTS "idioms_update" ON public.idioms;
DROP POLICY IF EXISTS "idioms_delete" ON public.idioms;

CREATE POLICY "id2_select" ON public.idioms FOR SELECT
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'teacher') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "id2_insert" ON public.idioms FOR INSERT
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "id2_update" ON public.idioms FOR UPDATE
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "id2_delete" ON public.idioms FOR DELETE
  USING (user_id = auth.uid());

-- user_sentences
DROP POLICY IF EXISTS "user_sentences_select" ON public.user_sentences;
DROP POLICY IF EXISTS "user_sentences_insert" ON public.user_sentences;
DROP POLICY IF EXISTS "user_sentences_update" ON public.user_sentences;
DROP POLICY IF EXISTS "user_sentences_delete" ON public.user_sentences;

CREATE POLICY "us2_select" ON public.user_sentences FOR SELECT
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'teacher') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "us2_insert" ON public.user_sentences FOR INSERT
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "us2_update" ON public.user_sentences FOR UPDATE
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "us2_delete" ON public.user_sentences FOR DELETE
  USING (user_id = auth.uid());

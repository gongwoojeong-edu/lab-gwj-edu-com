-- ============================================================
-- 1. 새 테이블: textbook_series (시리즈)
-- ============================================================
CREATE TABLE public.textbook_series (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  level TEXT NOT NULL,
  series_no INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (level, series_no)
);

ALTER TABLE public.textbook_series ENABLE ROW LEVEL SECURITY;

CREATE POLICY "textbook_series_select_authenticated"
  ON public.textbook_series FOR SELECT TO authenticated USING (true);

CREATE POLICY "textbook_series_insert_staff"
  ON public.textbook_series FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'teacher'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "textbook_series_update_staff"
  ON public.textbook_series FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'teacher'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'teacher'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "textbook_series_delete_staff"
  ON public.textbook_series FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER tr_textbook_series_updated_at
  BEFORE UPDATE ON public.textbook_series
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 2. textbooks 테이블에 series_id 추가 (지금은 nullable, 데이터 이주 후 NOT NULL)
-- ============================================================
ALTER TABLE public.textbooks ADD COLUMN series_id UUID REFERENCES public.textbook_series(id) ON DELETE CASCADE;
ALTER TABLE public.textbooks ADD COLUMN volume_no INTEGER;

-- ============================================================
-- 3. 새 테이블: textbook_units (유닛 — 기존 textbook 의미)
-- ============================================================
CREATE TABLE public.textbook_units (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  textbook_id UUID NOT NULL REFERENCES public.textbooks(id) ON DELETE CASCADE,
  unit_no INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (textbook_id, unit_no)
);

ALTER TABLE public.textbook_units ENABLE ROW LEVEL SECURITY;

CREATE POLICY "textbook_units_select_authenticated"
  ON public.textbook_units FOR SELECT TO authenticated USING (true);

CREATE POLICY "textbook_units_insert_staff"
  ON public.textbook_units FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'teacher'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "textbook_units_update_staff"
  ON public.textbook_units FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'teacher'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'teacher'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "textbook_units_delete_staff"
  ON public.textbook_units FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER tr_textbook_units_updated_at
  BEFORE UPDATE ON public.textbook_units
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 4. textbook_passages 에 unit_id 추가 (지금은 nullable, 데이터 이주 후 NOT NULL)
-- ============================================================
ALTER TABLE public.textbook_passages ADD COLUMN unit_id UUID REFERENCES public.textbook_units(id) ON DELETE CASCADE;

-- ============================================================
-- 5. 기존 데이터 마이그레이션
-- ============================================================
-- 5a. 각 레벨마다 "기본" 시리즈 생성
INSERT INTO public.textbook_series (level, series_no, title, description)
SELECT DISTINCT t.level, 1, '기본', '마이그레이션 시 자동 생성된 기본 시리즈'
FROM public.textbooks t
ON CONFLICT (level, series_no) DO NOTHING;

-- 5b. 각 레벨마다 "기본" 권(textbook) 생성 (기존 textbooks와는 별개의 새 권)
-- 기존 모든 textbooks를 unit으로 변환할 것이므로, 각 레벨마다 새 "기본 권"을 만듦
WITH default_series AS (
  SELECT id, level FROM public.textbook_series WHERE series_no = 1 AND title = '기본'
)
INSERT INTO public.textbooks (level, unit_no, title, description, series_id, volume_no, created_by)
SELECT ds.level, 9999, '기본 교재', '마이그레이션 시 자동 생성된 기본 교재', ds.id, 1, NULL
FROM default_series ds
WHERE NOT EXISTS (
  SELECT 1 FROM public.textbooks t2
  WHERE t2.series_id = ds.id AND t2.volume_no = 1
);

-- 5c. 기존 textbooks(now treated as units)을 textbook_units로 복사
-- 단, 방금 생성한 "기본 교재" 자체는 제외 (volume_no IS NOT NULL인 것)
WITH default_books AS (
  SELECT t.id AS book_id, t.level
  FROM public.textbooks t
  WHERE t.volume_no = 1 AND t.title = '기본 교재'
)
INSERT INTO public.textbook_units (id, textbook_id, unit_no, title, description, created_by, created_at, updated_at)
SELECT 
  t.id,  -- 기존 textbook id를 그대로 unit id로 사용 (passage 매핑 단순화)
  db.book_id,
  t.unit_no,
  t.title,
  t.description,
  t.created_by,
  t.created_at,
  t.updated_at
FROM public.textbooks t
JOIN default_books db ON db.level = t.level
WHERE t.volume_no IS NULL;  -- 새로 만든 "기본 교재"가 아닌 기존 textbooks만

-- 5d. textbook_passages.unit_id 채우기 (기존 textbook_id == unit_id)
UPDATE public.textbook_passages p
SET unit_id = p.textbook_id
WHERE unit_id IS NULL
  AND EXISTS (SELECT 1 FROM public.textbook_units u WHERE u.id = p.textbook_id);

-- 5e. 기존 textbooks 중 unit으로 변환된 것들을 삭제 (volume_no IS NULL인 것)
-- 하지만 textbook_passages.textbook_id가 여전히 참조하고 있으므로, 먼저 passage의 textbook_id를 "기본 교재"로 변경
WITH default_books AS (
  SELECT t.id AS book_id, t.level
  FROM public.textbooks t
  WHERE t.volume_no = 1 AND t.title = '기본 교재'
),
unit_to_book AS (
  SELECT u.id AS unit_id, db.book_id
  FROM public.textbook_units u
  JOIN public.textbooks t_old ON t_old.id = u.id
  JOIN default_books db ON db.level = t_old.level
)
UPDATE public.textbook_passages p
SET textbook_id = utb.book_id
FROM unit_to_book utb
WHERE p.textbook_id = utb.unit_id;

-- 5f. 이제 변환된 기존 textbooks 행을 삭제 (volume_no IS NULL이고 더 이상 passage가 참조하지 않음)
DELETE FROM public.textbooks WHERE volume_no IS NULL;

-- ============================================================
-- 6. NOT NULL 제약 추가 (데이터 이주 완료 후)
-- ============================================================
ALTER TABLE public.textbooks ALTER COLUMN series_id SET NOT NULL;
ALTER TABLE public.textbooks ALTER COLUMN volume_no SET NOT NULL;
ALTER TABLE public.textbook_passages ALTER COLUMN unit_id SET NOT NULL;

-- volume_no는 시리즈 내에서 unique
ALTER TABLE public.textbooks ADD CONSTRAINT textbooks_series_volume_unique UNIQUE (series_id, volume_no);

-- ============================================================
-- 7. 인덱스
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_textbook_series_level ON public.textbook_series(level);
CREATE INDEX IF NOT EXISTS idx_textbooks_series_id ON public.textbooks(series_id);
CREATE INDEX IF NOT EXISTS idx_textbook_units_textbook_id ON public.textbook_units(textbook_id);
CREATE INDEX IF NOT EXISTS idx_textbook_passages_unit_id ON public.textbook_passages(unit_id);

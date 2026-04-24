-- L01에 잘못 들어간 "2026년 고1 모의고사" 시리즈 정리
-- 단계적으로 지문 → 단원 → 권 → 시리즈 순으로 삭제 (FK CASCADE 유무와 무관하게 안전)

DO $$
DECLARE
  v_series_id uuid;
BEGIN
  SELECT id INTO v_series_id
  FROM public.textbook_series
  WHERE level = 'L01' AND title = '2026년 고1 모의고사'
  LIMIT 1;

  IF v_series_id IS NOT NULL THEN
    -- passages
    DELETE FROM public.textbook_passages
    WHERE textbook_id IN (
      SELECT id FROM public.textbooks WHERE series_id = v_series_id
    );

    -- units
    DELETE FROM public.textbook_units
    WHERE textbook_id IN (
      SELECT id FROM public.textbooks WHERE series_id = v_series_id
    );

    -- textbooks (volumes)
    DELETE FROM public.textbooks WHERE series_id = v_series_id;

    -- series
    DELETE FROM public.textbook_series WHERE id = v_series_id;
  END IF;
END $$;
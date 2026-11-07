CREATE OR REPLACE FUNCTION public.merge_passages_with_translations(p_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_unit uuid;
  v_keep uuid;
  v_code text;
  v_codes text[];
  v_rest text[];
  v_english text;
  v_korean text;
  v_words jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION '문장 합치기는 관리자만 실행할 수 있습니다.' USING ERRCODE = '42501';
  END IF;
  IF cardinality(p_ids) < 2 OR cardinality(p_ids) <> (SELECT count(DISTINCT x) FROM unnest(p_ids) x) THEN
    RAISE EXCEPTION '서로 다른 문장을 두 개 이상 선택해 주세요.';
  END IF;
  SELECT unit_id INTO v_unit FROM public.textbook_passages WHERE id = p_ids[1];
  IF v_unit IS NULL THEN RAISE EXCEPTION '선택한 문장을 찾을 수 없습니다. 다시 불러와 주세요.'; END IF;
  PERFORM 1 FROM public.textbook_units WHERE id = v_unit FOR UPDATE;
  PERFORM 1 FROM public.textbook_passages WHERE id = ANY(p_ids) ORDER BY passage_no, id FOR UPDATE;
  IF (SELECT count(*) FROM public.textbook_passages WHERE id = ANY(p_ids) AND unit_id = v_unit) <> cardinality(p_ids) THEN
    RAISE EXCEPTION '같은 유닛의 문장만 합칠 수 있습니다. 목록을 다시 불러와 주세요.';
  END IF;
  SELECT id, code INTO v_keep, v_code FROM public.textbook_passages WHERE id = ANY(p_ids) ORDER BY passage_no, id LIMIT 1;
  SELECT array_agg(code ORDER BY passage_no, id),
    string_agg(nullif(btrim(english), ''), ' ' ORDER BY passage_no, id),
    string_agg(nullif(btrim(korean), ''), ' ' ORDER BY passage_no, id)
  INTO v_codes, v_english, v_korean FROM public.textbook_passages WHERE id = ANY(p_ids);
  v_rest := v_codes[2:cardinality(v_codes)];
  PERFORM 1 FROM public.sentence_translations WHERE sentence_id = ANY(v_codes) FOR UPDATE;
  INSERT INTO public.sentence_translations(user_id, sentence_id, text, submitted_at)
    SELECT user_id, v_code,
      string_agg(btrim(text), ' ' ORDER BY array_position(v_codes, sentence_id)), max(submitted_at)
    FROM public.sentence_translations
    WHERE sentence_id = ANY(v_codes) AND user_id IS NOT NULL AND nullif(btrim(text), '') IS NOT NULL
    GROUP BY user_id
    ON CONFLICT(user_id, sentence_id) DO UPDATE SET text = excluded.text, submitted_at = excluded.submitted_at;
  -- Source translations and immutable attempt logs remain available as historical records.
  SELECT coalesce(jsonb_agg(word ORDER BY passage_order, word_order), '[]'::jsonb) INTO v_words
  FROM (
    SELECT DISTINCT ON (lower(btrim(word->>'word'))) word, array_position(v_codes, e.sentence_id) AS passage_order, word_order
    FROM public.sentence_word_extractions e
    CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(e.words) = 'array' THEN e.words ELSE '[]'::jsonb END) WITH ORDINALITY AS w(word, word_order)
    WHERE e.sentence_id = ANY(v_codes) AND nullif(btrim(word->>'word'), '') IS NOT NULL
    ORDER BY lower(btrim(word->>'word')), array_position(v_codes, e.sentence_id), word_order
  ) deduped;
  UPDATE public.textbook_passages SET english = v_english, korean = v_korean, tokens = NULL WHERE id = v_keep;
  IF jsonb_array_length(v_words) > 0 THEN
    INSERT INTO public.sentence_word_extractions(sentence_id, english, words, model)
    VALUES(v_code, v_english, v_words, 'merged')
    ON CONFLICT(sentence_id) DO UPDATE SET english = excluded.english, words = excluded.words, model = excluded.model, reviewed_at = NULL, reviewed_by = NULL;
  ELSE
    DELETE FROM public.sentence_word_extractions WHERE sentence_id = v_code;
  END IF;
  DELETE FROM public.sentence_word_extractions WHERE sentence_id = ANY(v_rest);
  DELETE FROM public.textbook_passages WHERE id = ANY(p_ids) AND id <> v_keep;
  WITH ordered AS (
    SELECT id, row_number() OVER (ORDER BY passage_no, id)::integer AS n FROM public.textbook_passages WHERE unit_id = v_unit
  ) UPDATE public.textbook_passages p SET passage_no = ordered.n FROM ordered WHERE p.id = ordered.id;
END;
$$;
REVOKE ALL ON FUNCTION public.merge_passages_with_translations(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_passages_with_translations(uuid[]) TO authenticated, service_role;
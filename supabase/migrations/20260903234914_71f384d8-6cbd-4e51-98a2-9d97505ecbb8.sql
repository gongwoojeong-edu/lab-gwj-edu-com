-- ============================================================
-- 판서 레이어 (Annotation Canvas) — 구문랩 적용 / additive only
-- ============================================================
CREATE TABLE IF NOT EXISTS public.sentence_annotations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sentence_id text NOT NULL,
  user_id     uuid NULL,
  author_id   uuid NOT NULL,
  scope       text NOT NULL DEFAULT 'teacher',
  strokes     jsonb NOT NULL DEFAULT '[]'::jsonb,
  aspect      numeric(6,4) NOT NULL DEFAULT 1.0000,
  rev         integer NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz NULL,
  CONSTRAINT sentence_annotations_scope_chk CHECK (scope IN ('teacher','student'))
);

GRANT SELECT, INSERT, UPDATE ON public.sentence_annotations TO authenticated;
GRANT ALL ON public.sentence_annotations TO service_role;

ALTER TABLE public.sentence_annotations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read own or staff" ON public.sentence_annotations
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR auth.uid() = author_id
    OR public.has_role(auth.uid(), 'teacher')
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "staff insert" ON public.sentence_annotations
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = author_id
    AND (public.has_role(auth.uid(), 'teacher') OR public.has_role(auth.uid(), 'admin'))
  );

CREATE POLICY "staff update own" ON public.sentence_annotations
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = author_id
    AND (public.has_role(auth.uid(), 'teacher') OR public.has_role(auth.uid(), 'admin'))
  )
  WITH CHECK (auth.uid() = author_id);

CREATE UNIQUE INDEX IF NOT EXISTS sentence_annotations_live_uk
  ON public.sentence_annotations (sentence_id, user_id, author_id, scope)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS sentence_annotations_lookup_idx
  ON public.sentence_annotations (sentence_id, user_id)
  WHERE deleted_at IS NULL;

CREATE TRIGGER trg_sentence_annotations_updated_at
  BEFORE UPDATE ON public.sentence_annotations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------- 이력 ----------------
CREATE TABLE IF NOT EXISTS public.sentence_annotation_history (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  annotation_id uuid NOT NULL REFERENCES public.sentence_annotations(id),
  rev           integer NOT NULL,
  strokes       jsonb NOT NULL,
  action        text NOT NULL,
  actor_id      uuid NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.sentence_annotation_history TO authenticated;
GRANT ALL ON public.sentence_annotation_history TO service_role;

ALTER TABLE public.sentence_annotation_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read history" ON public.sentence_annotation_history
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'teacher') OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS sentence_annotation_history_idx
  ON public.sentence_annotation_history (annotation_id, rev DESC);

-- ---------------- RPC ----------------
CREATE OR REPLACE FUNCTION public.fn_save_annotation(
  p_sentence_id text,
  p_user_id     uuid,
  p_scope       text,
  p_strokes     jsonb,
  p_aspect      numeric
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid; v_rev integer; v_old jsonb;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'teacher') OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  SELECT id, rev, strokes INTO v_id, v_rev, v_old
    FROM public.sentence_annotations
   WHERE sentence_id = p_sentence_id
     AND user_id IS NOT DISTINCT FROM p_user_id
     AND author_id = auth.uid()
     AND scope = p_scope
     AND deleted_at IS NULL;

  IF v_id IS NULL THEN
    INSERT INTO public.sentence_annotations
      (sentence_id, user_id, author_id, scope, strokes, aspect)
    VALUES (p_sentence_id, p_user_id, auth.uid(), p_scope, p_strokes, p_aspect)
    RETURNING id INTO v_id;
  ELSE
    INSERT INTO public.sentence_annotation_history
      (annotation_id, rev, strokes, action, actor_id)
    VALUES (v_id, v_rev, v_old, 'save', auth.uid());

    UPDATE public.sentence_annotations
       SET strokes = p_strokes, aspect = p_aspect, rev = rev + 1
     WHERE id = v_id;
  END IF;

  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.fn_delete_annotation(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rev integer; v_old jsonb;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'teacher') OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  SELECT rev, strokes INTO v_rev, v_old FROM public.sentence_annotations WHERE id = p_id;
  IF v_rev IS NULL THEN RETURN; END IF;
  INSERT INTO public.sentence_annotation_history (annotation_id, rev, strokes, action, actor_id)
  VALUES (p_id, v_rev, v_old, 'delete', auth.uid());
  UPDATE public.sentence_annotations SET deleted_at = now() WHERE id = p_id;
END $$;

CREATE OR REPLACE FUNCTION public.fn_restore_annotation(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rev integer; v_old jsonb;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'teacher') OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  SELECT rev, strokes INTO v_rev, v_old FROM public.sentence_annotations WHERE id = p_id;
  IF v_rev IS NULL THEN RETURN; END IF;
  INSERT INTO public.sentence_annotation_history (annotation_id, rev, strokes, action, actor_id)
  VALUES (p_id, v_rev, v_old, 'restore', auth.uid());
  UPDATE public.sentence_annotations SET deleted_at = NULL WHERE id = p_id;
END $$;

GRANT EXECUTE ON FUNCTION public.fn_save_annotation(text, uuid, text, jsonb, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_delete_annotation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_restore_annotation(uuid) TO authenticated;
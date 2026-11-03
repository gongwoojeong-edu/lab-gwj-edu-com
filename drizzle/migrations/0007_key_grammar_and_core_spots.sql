ALTER TABLE public.textbooks ADD COLUMN IF NOT EXISTS key_grammar text[] NOT NULL DEFAULT '{}';

DROP FUNCTION IF EXISTS public.master_analysis_spots(text);
CREATE FUNCTION public.master_analysis_spots(p_sentence_id text)
RETURNS TABLE(owner_id text, required boolean, core boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT op.owner_id,
         bool_or(COALESCE((op.progress->>'required')::boolean, false)) AS required,
         bool_or(
           COALESCE(op.progress->>'pos','') = '동사'
           OR COALESCE(op.progress->>'form','') IN ('to V','V-ing','V-ing/PP','V-ed','PP','접SV')
           OR (COALESCE(op.progress->>'pos','') = '기타' AND COALESCE(op.progress->>'kind','') <> '')
         ) AS core
  FROM public.owner_progress op
  WHERE op.sentence_id = p_sentence_id
    AND op.user_id IN (SELECT ur.user_id FROM public.user_roles ur WHERE ur.role = 'admin')
  GROUP BY op.owner_id
$$;

GRANT EXECUTE ON FUNCTION public.master_analysis_spots(text) TO authenticated;
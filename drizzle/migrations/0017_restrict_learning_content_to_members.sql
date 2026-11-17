DROP POLICY IF EXISTS passage_audio_select_authenticated ON public.passage_audio;
CREATE POLICY passage_audio_select_members ON public.passage_audio
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'student') OR public.has_role(auth.uid(), 'teacher') OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS swe_select_authenticated ON public.sentence_word_extractions;
CREATE POLICY swe_select_members ON public.sentence_word_extractions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'student') OR public.has_role(auth.uid(), 'teacher') OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS textbook_passages_select_authenticated ON public.textbook_passages;
CREATE POLICY textbook_passages_select_members ON public.textbook_passages
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'student') OR public.has_role(auth.uid(), 'teacher') OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS analysis_materials_select_authenticated ON storage.objects;
CREATE POLICY analysis_materials_select_members ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'analysis-materials' AND (public.has_role(auth.uid(), 'student') OR public.has_role(auth.uid(), 'teacher') OR public.has_role(auth.uid(), 'admin')));

DROP POLICY IF EXISTS passage_audio_storage_select ON storage.objects;
CREATE POLICY passage_audio_storage_select_members ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'passage-audio' AND (public.has_role(auth.uid(), 'student') OR public.has_role(auth.uid(), 'teacher') OR public.has_role(auth.uid(), 'admin')));
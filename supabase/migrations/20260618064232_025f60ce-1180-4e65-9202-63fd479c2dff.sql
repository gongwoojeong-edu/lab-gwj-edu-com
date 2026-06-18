
CREATE POLICY "teachers update any progress"
ON public.sentence_progress
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'teacher'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'teacher'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "teachers insert any progress"
ON public.sentence_progress
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'teacher'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role));

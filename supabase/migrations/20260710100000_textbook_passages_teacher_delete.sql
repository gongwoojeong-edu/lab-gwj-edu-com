-- Allow teachers to delete textbook_passages (matches BookshelfUnit bulk delete UI)
DROP POLICY IF EXISTS "textbook_passages_delete_staff" ON public.textbook_passages;

CREATE POLICY "textbook_passages_delete_staff"
ON public.textbook_passages FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'teacher') OR public.has_role(auth.uid(), 'admin'));

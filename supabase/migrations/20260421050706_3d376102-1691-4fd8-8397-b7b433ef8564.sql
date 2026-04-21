CREATE TABLE public.assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  teacher_id UUID NOT NULL,
  student_id UUID,
  title TEXT NOT NULL,
  description TEXT,
  sentence_id TEXT,
  due_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "assignments_staff_all"
ON public.assignments
FOR ALL
USING (has_role(auth.uid(), 'teacher'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'teacher'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "assignments_student_select"
ON public.assignments
FOR SELECT
USING (student_id = auth.uid() OR student_id IS NULL);

CREATE TRIGGER set_assignments_updated_at
BEFORE UPDATE ON public.assignments
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_assignments_student_due ON public.assignments(student_id, due_at);
CREATE INDEX idx_assignments_teacher ON public.assignments(teacher_id);
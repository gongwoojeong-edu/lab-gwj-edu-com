CREATE TABLE public.workbook_print_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  unit_ids uuid[] NOT NULL,
  mode text NOT NULL,
  answer_key boolean NOT NULL DEFAULT false,
  hide_translation boolean NOT NULL DEFAULT false,
  passage_count integer NOT NULL DEFAULT 0,
  printed_by uuid NOT NULL,
  printed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.workbook_print_logs TO authenticated;
GRANT ALL ON public.workbook_print_logs TO service_role;
ALTER TABLE public.workbook_print_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read workbook prints" ON public.workbook_print_logs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'teacher') OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "staff record workbook prints" ON public.workbook_print_logs
  FOR INSERT TO authenticated
  WITH CHECK ((public.has_role(auth.uid(), 'teacher') OR public.has_role(auth.uid(), 'admin')) AND printed_by = auth.uid());
CREATE INDEX workbook_print_logs_student_idx ON public.workbook_print_logs (student_id, printed_at DESC);
CREATE INDEX workbook_print_logs_units_idx ON public.workbook_print_logs USING gin (unit_ids);
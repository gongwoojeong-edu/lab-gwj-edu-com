-- 유닛 단위 인쇄·워크북·학습완료 + 자료열람 승인 정책

CREATE TYPE public.unit_workflow_status AS ENUM (
  'learning',
  'print_pending',
  'printed',
  'workbook_submitted',
  'completed'
);

CREATE TABLE public.unit_workflows (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.textbook_units(id) ON DELETE CASCADE,
  status public.unit_workflow_status NOT NULL DEFAULT 'learning',
  print_requested_at timestamptz,
  printed_at timestamptz,
  printed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  workbook_submitted_at timestamptz,
  teacher_grade text CHECK (teacher_grade IS NULL OR teacher_grade IN ('A', 'B', 'C', 'D', 'E')),
  teacher_memo text,
  completed_at timestamptz,
  completed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, unit_id)
);

CREATE INDEX idx_unit_workflows_status ON public.unit_workflows (status, print_requested_at DESC);
CREATE INDEX idx_unit_workflows_user ON public.unit_workflows (user_id);

ALTER TABLE public.unit_workflows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "uw_select_self_or_staff"
  ON public.unit_workflows FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'teacher'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE POLICY "uw_insert_self"
  ON public.unit_workflows FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "uw_update_self_or_staff"
  ON public.unit_workflows FOR UPDATE
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'teacher'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
  WITH CHECK (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'teacher'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE POLICY "uw_staff_all"
  ON public.unit_workflows FOR ALL
  USING (
    public.has_role(auth.uid(), 'teacher'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'teacher'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE TRIGGER unit_workflows_set_updated_at
  BEFORE UPDATE ON public.unit_workflows
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.material_view_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.textbook_units(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  responded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX material_view_requests_pending_unique
  ON public.material_view_requests (user_id, unit_id)
  WHERE status = 'pending';

CREATE INDEX idx_material_view_requests_status ON public.material_view_requests (status, requested_at DESC);

ALTER TABLE public.material_view_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mvr_select_self_or_staff"
  ON public.material_view_requests FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'teacher'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE POLICY "mvr_insert_self"
  ON public.material_view_requests FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "mvr_update_staff"
  ON public.material_view_requests FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'teacher'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE POLICY "mvr_delete_self_pending"
  ON public.material_view_requests FOR DELETE
  USING (user_id = auth.uid() AND status = 'pending');

ALTER PUBLICATION supabase_realtime ADD TABLE public.unit_workflows;
ALTER PUBLICATION supabase_realtime ADD TABLE public.material_view_requests;
ALTER TABLE public.unit_workflows REPLICA IDENTITY FULL;
ALTER TABLE public.material_view_requests REPLICA IDENTITY FULL;

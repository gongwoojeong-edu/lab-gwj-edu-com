import { supabase } from "@/integrations/supabase/client";
import { getCurrentUserId } from "@/lib/authState";
import { fetchUnitWorkflow } from "@/lib/unitWorkflow";

const materialViewRequests = () =>
  (supabase as unknown as { from: (table: "material_view_requests") => any }).from("material_view_requests");

export type MaterialViewStatus = "pending" | "approved" | "rejected";

export interface MaterialViewRequest {
  id: string;
  user_id: string;
  unit_id: string;
  status: MaterialViewStatus;
  requested_at: string;
  responded_at: string | null;
  responded_by: string | null;
}

export async function fetchMyMaterialViewRequests(
  userId: string,
): Promise<Record<string, MaterialViewRequest>> {
  const { data } = await materialViewRequests()
    .select("*")
    .eq("user_id", userId)
    .order("requested_at", { ascending: false });
  const map: Record<string, MaterialViewRequest> = {};
  ((data ?? []) as MaterialViewRequest[]).forEach((r) => {
    if (!map[r.unit_id] || r.requested_at > map[r.unit_id].requested_at) {
      map[r.unit_id] = r;
    }
  });
  return map;
}

export async function fetchPendingMaterialViewRequests(): Promise<MaterialViewRequest[]> {
  const { data, error } = await materialViewRequests()
    .select("*")
    .eq("status", "pending")
    .order("requested_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as MaterialViewRequest[];
}

/** 인쇄 완료 후 자료열람 요청 */
export async function requestMaterialView(userId: string, unitId: string): Promise<MaterialViewRequest> {
  const wf = await fetchUnitWorkflow(userId, unitId);
  if (!wf || !["printed", "workbook_submitted", "completed"].includes(wf.status)) {
    throw new Error("선생님 인쇄 후 자료열람을 요청할 수 있습니다.");
  }

  const { data: existing } = await supabase
    .from("material_view_requests")
    .select("*")
    .eq("user_id", userId)
    .eq("unit_id", unitId)
    .eq("status", "pending")
    .maybeSingle();
  if (existing) return existing as MaterialViewRequest;

  const { data: approved } = await supabase
    .from("material_view_requests")
    .select("*")
    .eq("user_id", userId)
    .eq("unit_id", unitId)
    .eq("status", "approved")
    .maybeSingle();
  if (approved) return approved as MaterialViewRequest;

  const { data, error } = await supabase
    .from("material_view_requests")
    .insert({ user_id: userId, unit_id: unitId })
    .select("*")
    .single();
  if (error) throw error;
  return data as MaterialViewRequest;
}

export async function cancelMaterialViewRequest(id: string): Promise<void> {
  const { error } = await supabase
    .from("material_view_requests")
    .delete()
    .eq("id", id)
    .eq("status", "pending");
  if (error) throw error;
}

export async function approveMaterialViewRequest(id: string): Promise<void> {
  const teacherId = await getCurrentUserId();
  const { error } = await supabase
    .from("material_view_requests")
    .update({
      status: "approved",
      responded_at: new Date().toISOString(),
      responded_by: teacherId,
    })
    .eq("id", id)
    .eq("status", "pending");
  if (error) throw error;
}

export async function rejectMaterialViewRequest(id: string): Promise<void> {
  const teacherId = await getCurrentUserId();
  const { error } = await supabase
    .from("material_view_requests")
    .update({
      status: "rejected",
      responded_at: new Date().toISOString(),
      responded_by: teacherId,
    })
    .eq("id", id)
    .eq("status", "pending");
  if (error) throw error;
}

export async function fetchApprovedMaterialUnits(userId: string): Promise<string[]> {
  const { data } = await supabase
    .from("material_view_requests")
    .select("unit_id")
    .eq("user_id", userId)
    .eq("status", "approved");
  return ((data ?? []) as { unit_id: string }[]).map((r) => r.unit_id);
}

export function subscribeToMaterialViewRequests(onChange: () => void) {
  const ch = supabase
    .channel(`material_view_requests_${Math.random().toString(36).slice(2)}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "material_view_requests" },
      () => onChange(),
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(ch);
  };
}

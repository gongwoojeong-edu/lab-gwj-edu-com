import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { rankLabel } from "@/lib/ranks";

const db = supabase as unknown as {
  from: (table: string) => any;
  schema: (schema: string) => { from: (table: string) => any };
};

const STORAGE_KEY = "eng.viewAsStaffId";

export interface OrbitStaffRow {
  id: string;
  name: string;
  rank: number;
  campus_id: string | null;
  auth_user_id: string | null;
  active: boolean;
}

export interface OrbitCampusRow {
  id: string;
  name: string;
}

interface StaffContextValue {
  loading: boolean;
  error: string | null;
  staffList: OrbitStaffRow[];
  campuses: OrbitCampusRow[];
  me: OrbitStaffRow | null;
  /** 현재 화면 시점 (view-as 포함) */
  staff: OrbitStaffRow | null;
  unlinked: boolean;
  setStaffId: (id: string | null) => void;
  reload: () => void;
  rank: number;
  isDirector: boolean;
  canViewAsStaff: boolean;
  isViewingAsOther: boolean;
  campusName: string | null;
  /** 선생님화면 미리보기 시 담당 학생 필터용 auth.users id */
  effectiveTeacherAuthUserId: string | null;
  /** orbit 스키마 직접 vs 동기화 캐시 */
  staffSource: "orbit" | "cache" | null;
}

const StaffContext = createContext<StaffContextValue | null>(null);

async function fetchStaffFromOrbit(): Promise<OrbitStaffRow[]> {
  const { data, error } = await db
    .schema("orbit")
    .from("staff")
    .select("id, name, rank, campus_id, auth_user_id, active")
    .eq("active", true)
    .order("rank", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as OrbitStaffRow[];
}

async function fetchStaffFromCache(): Promise<OrbitStaffRow[]> {
  const { data, error } = await db
    .from("orbit_staff_cache")
    .select("id, name, rank, campus_id, auth_user_id, active")
    .eq("active", true)
    .order("rank", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as OrbitStaffRow[];
}

async function fetchStaff(): Promise<{ rows: OrbitStaffRow[]; source: "orbit" | "cache" }> {
  // orbit 스키마는 PostgREST에 노출되지 않아 항상 406 → 캐시 테이블로 직행.
  const rows = await fetchStaffFromCache();
  return { rows, source: "cache" };
}

async function fetchCampuses(): Promise<OrbitCampusRow[]> {
  // 위와 동일 — 캐시 테이블로 직행.
  return fetchCampusesFromCache();
}


export function staffOptionLabel(
  s: Pick<OrbitStaffRow, "name" | "rank" | "campus_id">,
  campusName: (id: string | null) => string,
) {
  const campus = s.campus_id ? ` · ${campusName(s.campus_id)}` : "";
  return `${s.name} (${rankLabel(s.rank)}${campus})`;
}

export function StaffProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const staffQuery = useQuery({
    queryKey: ["orbit-staff"],
    queryFn: fetchStaff,
    enabled: !!userId,
  });
  const campusQuery = useQuery({
    queryKey: ["orbit-campuses"],
    queryFn: fetchCampuses,
    enabled: !!userId,
  });

  const [overrideId, setOverrideId] = useState<string | null>(() =>
    typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null,
  );

  const reload = useCallback(() => {
    void staffQuery.refetch();
    void campusQuery.refetch();
  }, [staffQuery, campusQuery]);

  const staffList = useMemo(() => staffQuery.data?.rows ?? [], [staffQuery.data?.rows]);
  const staffSource = staffQuery.data?.source ?? null;
  const campuses = useMemo(() => campusQuery.data ?? [], [campusQuery.data]);

  const me = useMemo(
    () =>
      userId
        ? (staffList.find((s) => s.auth_user_id === userId) ?? null)
        : null,
    [staffList, userId],
  );

  const setStaffId = useCallback(
    (id: string | null) => {
      const resolved = id && me && id === me.id ? null : id;
      setOverrideId(resolved);
      if (resolved) localStorage.setItem(STORAGE_KEY, resolved);
      else localStorage.removeItem(STORAGE_KEY);
    },
    [me],
  );

  const meRank = me?.rank ?? 0;

  const staff = useMemo(() => {
    if (me && meRank >= 5 && overrideId && overrideId !== me.id) {
      return staffList.find((s) => s.id === overrideId) ?? me;
    }
    return me;
  }, [me, meRank, overrideId, staffList]);

  const rank = staff?.rank ?? 0;
  const canViewAsStaff = meRank >= 5;
  const isViewingAsOther = !!(
    canViewAsStaff &&
    me &&
    staff &&
    staff.id !== me.id
  );

  const campusName = useMemo(() => {
    if (!staff?.campus_id) return null;
    return campuses.find((c) => c.id === staff.campus_id)?.name ?? null;
  }, [staff, campuses]);

  const effectiveTeacherAuthUserId = useMemo(() => {
    if (isViewingAsOther) return staff?.auth_user_id ?? null;
    return userId;
  }, [isViewingAsOther, staff?.auth_user_id, userId]);

  const queryError = staffQuery.error ?? campusQuery.error;

  const value: StaffContextValue = {
    loading: staffQuery.isLoading || campusQuery.isLoading,
    error: queryError instanceof Error ? queryError.message : null,
    staffList,
    campuses,
    me,
    staff,
    unlinked: !!userId && !staffQuery.isLoading && me === null,
    setStaffId,
    reload,
    rank,
    isDirector: meRank >= 5,
    canViewAsStaff,
    isViewingAsOther,
    campusName,
    effectiveTeacherAuthUserId,
    staffSource,
  };

  return <StaffContext.Provider value={value}>{children}</StaffContext.Provider>;
}

export function useStaff(): StaffContextValue {
  const ctx = useContext(StaffContext);
  if (!ctx) throw new Error("useStaff must be used within StaffProvider");
  return ctx;
}

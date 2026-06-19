import { useMemo } from "react";
import {
  staffOptionLabel,
  useStaff,
  type OrbitStaffRow,
} from "@/lib/staff-context";

export function TeacherViewSwitcher() {
  const { me, staffList, setStaffId, canViewAsStaff, isViewingAsOther, staff, campuses } =
    useStaff();

  const campusName = (id: string | null) =>
    id ? (campuses.find((c) => c.id === id)?.name ?? "") : "본부";

  const teacherOptions = useMemo(() => {
    if (!me) return staffList;
    return staffList
      .filter((s: OrbitStaffRow) => s.id !== me.id)
      .sort((a, b) => a.name.localeCompare(b.name, "ko"));
  }, [me, staffList]);

  if (!canViewAsStaff) return null;

  return (
    <div className="flex items-center gap-1.5">
      <label
        htmlFor="eng-view-as-staff"
        className="whitespace-nowrap text-[11px] text-muted-foreground"
      >
        선생님화면 보기
      </label>
      <select
        id="eng-view-as-staff"
        className="max-w-[14rem] rounded-md border border-border bg-background px-2 py-1 text-xs shadow-sm focus:border-primary focus:outline-none"
        value={isViewingAsOther ? (staff?.id ?? "") : ""}
        onChange={(e) => setStaffId(e.target.value || null)}
        title="다른 선생님 시점으로 학생 목록 미리보기 (분원장+)"
      >
        <option value="">본인{me ? ` · ${me.name}` : ""}</option>
        {teacherOptions.map((s) => (
          <option key={s.id} value={s.id}>
            {staffOptionLabel(s, campusName)}
          </option>
        ))}
      </select>
      {isViewingAsOther && (
        <button
          type="button"
          className="whitespace-nowrap rounded-md border border-primary/30 bg-primary/5 px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary/10"
          onClick={() => setStaffId(null)}
        >
          본인으로
        </button>
      )}
    </div>
  );
}

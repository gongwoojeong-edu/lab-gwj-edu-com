// ============================================================
// UnitSkipBulkDialog
// 유닛(다중) × 학생(다중) 유닛 전체 건너뛰기 일괄 지정 / 해제
// student_unit_overrides.skip_unit 사용
// ============================================================
import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2, SkipForward } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  bulkSetSkipUnit,
  fetchSkipUnitMapForStudents,
} from "@/lib/studentUnitOverrides";

export interface SkipUnitOption {
  id: string;
  label: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  units: SkipUnitOption[];
  /** 처음 열 때 체크되어 있을 유닛 id */
  defaultSelectedIds?: string[];
}

type StudentRow = { id: string; name: string; no: string; klass: string | null };

export const UnitSkipBulkDialog = ({
  open,
  onOpenChange,
  units,
  defaultSelectedIds,
}: Props) => {
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<"skip" | "unskip" | null>(null);
  const [query, setQuery] = useState("");
  const [selectedUnits, setSelectedUnits] = useState<Set<string>>(new Set());
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [skipMap, setSkipMap] = useState<Record<string, Set<string>>>({});

  useEffect(() => {
    if (!open) return;
    setSelectedUnits(
      new Set(
        defaultSelectedIds && defaultSelectedIds.length > 0
          ? defaultSelectedIds
          : units.map((u) => u.id),
      ),
    );
    setSelectedStudents(new Set());
    setQuery("");
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const { data, error } = await supabase
          .from("student_profiles")
          .select("user_id, student_no, display_name, orbit_class_name")
          .eq("orbit_enrollment_active", true)
          .order("student_no");
        if (error) throw error;
        const rows: StudentRow[] = ((data ?? []) as Record<string, unknown>[])
          .filter((r) => !/^(gwj)?t\d+$/i.test(String(r.student_no ?? "").trim()))
          .map((r) => ({
            id: r.user_id as string,
            name: String(r.display_name ?? r.student_no ?? "").trim(),
            no: String(r.student_no ?? "").trim(),
            klass: (r.orbit_class_name as string) ?? null,
          }));
        if (cancelled) return;
        setStudents(rows);
        const map = await fetchSkipUnitMapForStudents(
          rows.map((r) => r.id),
          units.map((u) => u.id),
        );
        if (!cancelled) setSkipMap(map);
      } catch (e) {
        toast({
          title: "학생 명단을 불러오지 못했습니다",
          description: String(e),
          variant: "destructive",
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const filteredStudents = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return students;
    return students.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.no.toLowerCase().includes(q) ||
        (s.klass ?? "").toLowerCase().includes(q),
    );
  }, [students, query]);

  const toggleUnit = (id: string) =>
    setSelectedUnits((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const toggleStudent = (id: string) =>
    setSelectedStudents((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const apply = async (skip: boolean) => {
    const userIds = Array.from(selectedStudents);
    const unitIds = Array.from(selectedUnits);
    if (userIds.length === 0 || unitIds.length === 0) {
      toast({ title: "학생과 유닛을 선택하세요", variant: "destructive" });
      return;
    }
    setSaving(skip ? "skip" : "unskip");
    try {
      await bulkSetSkipUnit(userIds, unitIds, skip);
      setSkipMap((prev) => {
        const next: Record<string, Set<string>> = { ...prev };
        userIds.forEach((uid) => {
          const set = new Set(next[uid] ?? []);
          unitIds.forEach((u) => (skip ? set.add(u) : set.delete(u)));
          next[uid] = set;
        });
        return next;
      });
      toast({
        title: skip ? "유닛을 건너뛰기로 지정했습니다" : "유닛 건너뛰기를 해제했습니다",
        description: `학생 ${userIds.length}명 × 유닛 ${unitIds.length}개`,
      });
    } catch (e) {
      toast({ title: "저장 실패", description: String(e), variant: "destructive" });
    } finally {
      setSaving(null);
    }
  };

  const skipCountFor = (id: string) => {
    const set = skipMap[id];
    if (!set) return 0;
    return units.filter((u) => set.has(u.id)).length;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="font-kr max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SkipForward className="size-4" />
            유닛 건너뛰기 일괄 지정
          </DialogTitle>
          <DialogDescription>
            선택한 학생들에게 선택한 유닛 전체를 건너뛰도록 지정합니다. 유닛 단위로
            저장되므로 나중에 지문이 추가돼도 계속 건너뜁니다. 해제하면 즉시 다시 진도에
            나타납니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold">유닛 선택 ({selectedUnits.size})</span>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelectedUnits(new Set(units.map((u) => u.id)))}
                >
                  전체
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelectedUnits(new Set())}>
                  해제
                </Button>
              </div>
            </div>
            <div className="max-h-40 overflow-y-auto rounded-md border divide-y">
              {units.length === 0 ? (
                <div className="p-3 text-xs text-muted-foreground">유닛이 없습니다.</div>
              ) : (
                units.map((u) => (
                  <label
                    key={u.id}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedUnits.has(u.id)}
                      onCheckedChange={() => toggleUnit(u.id)}
                    />
                    <span className="truncate">{u.label}</span>
                  </label>
                ))
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1 gap-2">
              <span className="text-xs font-bold">학생 선택 ({selectedStudents.size})</span>
              <Input
                placeholder="이름 / 번호 / 반 검색"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-8 max-w-[220px]"
              />
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelectedStudents(new Set(filteredStudents.map((s) => s.id)))}
                >
                  전체
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelectedStudents(new Set())}>
                  해제
                </Button>
              </div>
            </div>
            <div className="max-h-64 overflow-y-auto rounded-md border divide-y">
              {loading ? (
                <div className="py-8 text-center text-muted-foreground text-sm">
                  <Loader2 className="size-4 animate-spin inline mr-2" />
                  불러오는 중…
                </div>
              ) : filteredStudents.length === 0 ? (
                <div className="p-3 text-xs text-muted-foreground">학생이 없습니다.</div>
              ) : (
                filteredStudents.map((s) => {
                  const cnt = skipCountFor(s.id);
                  return (
                    <label
                      key={s.id}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedStudents.has(s.id)}
                        onCheckedChange={() => toggleStudent(s.id)}
                      />
                      <span className="font-medium">{s.name}</span>
                      <span className="text-xs text-muted-foreground">{s.no}</span>
                      {s.klass && (
                        <span className="text-xs text-muted-foreground">· {s.klass}</span>
                      )}
                      {cnt > 0 && (
                        <Badge variant="secondary" className="ml-auto text-[10px]">
                          스킵 {cnt}
                        </Badge>
                      )}
                    </label>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            닫기
          </Button>
          <Button variant="outline" onClick={() => apply(false)} disabled={saving !== null}>
            {saving === "unskip" && <Loader2 className="size-4 animate-spin mr-1" />}
            스킵 해제
          </Button>
          <Button onClick={() => apply(true)} disabled={saving !== null}>
            {saving === "skip" && <Loader2 className="size-4 animate-spin mr-1" />}
            스킵 지정
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default UnitSkipBulkDialog;

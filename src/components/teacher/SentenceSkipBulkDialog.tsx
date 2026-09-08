// ============================================================
// SentenceSkipBulkDialog
// 지문(다중) × 학생(다중) 문장 건너뛰기 일괄 지정 / 해제
// student_passage_overrides.skip_sentence 사용
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
  bulkSetSkipSentence,
  fetchSkipMapForStudents,
} from "@/lib/studentPassageOverrides";

export interface SkipPassageOption {
  code: string;
  label: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  passages: SkipPassageOption[];
  /** 처음 열 때 체크되어 있을 지문 코드 */
  defaultSelectedCodes?: string[];
}

type StudentRow = { id: string; name: string; no: string; klass: string | null };

export const SentenceSkipBulkDialog = ({
  open,
  onOpenChange,
  passages,
  defaultSelectedCodes,
}: Props) => {
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<"skip" | "unskip" | null>(null);
  const [query, setQuery] = useState("");
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [skipMap, setSkipMap] = useState<Record<string, Set<string>>>({});

  useEffect(() => {
    if (!open) return;
    setSelectedCodes(
      new Set(
        defaultSelectedCodes && defaultSelectedCodes.length > 0
          ? defaultSelectedCodes
          : passages.map((p) => p.code),
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
        const rows: StudentRow[] = ((data ?? []) as any[])
          .filter((r) => !/^(gwj)?t\d+$/i.test((r.student_no ?? "").trim()))
          .map((r) => ({
            id: r.user_id as string,
            name: (r.display_name ?? r.student_no ?? "").trim(),
            no: (r.student_no ?? "").trim(),
            klass: r.orbit_class_name ?? null,
          }));
        if (cancelled) return;
        setStudents(rows);
        const map = await fetchSkipMapForStudents(
          rows.map((r) => r.id),
          passages.map((p) => p.code),
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

  const toggleCode = (code: string) =>
    setSelectedCodes((prev) => {
      const n = new Set(prev);
      n.has(code) ? n.delete(code) : n.add(code);
      return n;
    });

  const toggleStudent = (id: string) =>
    setSelectedStudents((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const apply = async (skip: boolean) => {
    const userIds = Array.from(selectedStudents);
    const codes = Array.from(selectedCodes);
    if (userIds.length === 0 || codes.length === 0) {
      toast({ title: "학생과 지문을 선택하세요", variant: "destructive" });
      return;
    }
    setSaving(skip ? "skip" : "unskip");
    try {
      await bulkSetSkipSentence(userIds, codes, skip);
      setSkipMap((prev) => {
        const next: Record<string, Set<string>> = { ...prev };
        userIds.forEach((uid) => {
          const set = new Set(next[uid] ?? []);
          codes.forEach((c) => (skip ? set.add(c) : set.delete(c)));
          next[uid] = set;
        });
        return next;
      });
      toast({
        title: skip ? "건너뛰기로 지정했습니다" : "건너뛰기를 해제했습니다",
        description: `학생 ${userIds.length}명 × 지문 ${codes.length}개`,
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
    return passages.filter((p) => set.has(p.code)).length;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="font-kr max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SkipForward className="size-4" />
            문장 건너뛰기 일괄 지정
          </DialogTitle>
          <DialogDescription>
            선택한 학생들에게 선택한 지문을 건너뛰도록 지정합니다. 언제든 해제할 수 있고,
            해제하면 그 문장이 다시 진도에 나타납니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold">지문 선택 ({selectedCodes.size})</span>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelectedCodes(new Set(passages.map((p) => p.code)))}
                >
                  전체
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelectedCodes(new Set())}>
                  해제
                </Button>
              </div>
            </div>
            <div className="max-h-40 overflow-y-auto rounded-md border divide-y">
              {passages.length === 0 ? (
                <div className="p-3 text-xs text-muted-foreground">지문이 없습니다.</div>
              ) : (
                passages.map((p) => (
                  <label
                    key={p.code}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedCodes.has(p.code)}
                      onCheckedChange={() => toggleCode(p.code)}
                    />
                    <span className="truncate">{p.label}</span>
                    <span className="ml-auto text-[10px] text-muted-foreground">{p.code}</span>
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
          <Button
            variant="outline"
            onClick={() => apply(false)}
            disabled={saving !== null}
          >
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

export default SentenceSkipBulkDialog;

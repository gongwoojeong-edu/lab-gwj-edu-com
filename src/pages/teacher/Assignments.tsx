import { TeacherLayout } from "@/components/teacher/TeacherLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CalendarIcon,
  ClipboardList,
  Trash2,
  BookOpen,
  Pencil,
  Plus,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { fetchAllStudents, type StudentProfile } from "@/lib/studentProfile";
import {
  fetchAllTextbooks,
  fetchSeriesByLevel,
  fetchTextbooksBySeries,
  fetchUnitsByTextbook,
  fetchPassagesByUnit,
  type Textbook,
  type Series,
  type Unit,
  type Passage,
} from "@/lib/textbooks";
import { LEVELS, type LevelCode } from "@/lib/levels";
import AssignmentStepBadges from "@/components/teacher/AssignmentStepBadges";
import { WorkbookModeToggle } from "@/components/teacher/WorkbookModeToggle";
import {
  fetchAssignmentProgress,
  type AssignmentProgressMap,
} from "@/lib/assignmentProgress";
import { isAssignmentDone } from "@/lib/assignmentCompletion";

interface AssignmentRow {
  id: string;
  teacher_id: string;
  student_id: string | null;
  title: string;
  description: string | null;
  sentence_id: string | null;
  due_at: string;
  created_at: string;
  include_pre: boolean;
  include_analysis: boolean;
  include_translation: boolean;
  include_wordtest: boolean;
}

type StepKey = "pre" | "analysis" | "translation" | "wordtest";

interface FormState {
  title: string;
  /** 빈 배열 = 전체 학생, 1개 이상 = 선택된 학생들 (각각 별도 과제 행 생성) */
  studentIds: string[];
  // 위계 선택 상태 (UI 용)
  selectedLevel: LevelCode | "";
  selectedSeriesId: string;
  selectedTbId: string;
  selectedUnitId: string;
  selectedPassageCode: string;
  description: string;
  dueDate: Date | undefined;
  includePre: boolean;
  includeAnalysis: boolean;
  includeTranslation: boolean;
  includeWordtest: boolean;
}

const emptyForm = (): FormState => ({
  title: "",
  studentIds: [],
  selectedLevel: "",
  selectedSeriesId: "",
  selectedTbId: "",
  selectedUnitId: "",
  selectedPassageCode: "",
  description: "",
  dueDate: undefined,
  includePre: true,
  includeAnalysis: true,
  includeTranslation: true,
  includeWordtest: true,
});

const Assignments = () => {
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [rows, setRows] = useState<AssignmentRow[]>([]);
  const [textbooks, setTextbooks] = useState<Textbook[]>([]);
  // 캐스케이딩 캐시
  const [seriesByLevel, setSeriesByLevel] = useState<Record<string, Series[]>>({});
  const [tbsBySeries, setTbsBySeries] = useState<Record<string, Textbook[]>>({});
  const [unitsByTb, setUnitsByTb] = useState<Record<string, Unit[]>>({});
  const [passagesByUnit, setPassagesByUnit] = useState<Record<string, Passage[]>>({});
  const [progressByAsg, setProgressByAsg] = useState<Record<string, AssignmentProgressMap>>({});

  const studentNameMap = useMemo(() => {
    const m = new Map<string, string>();
    students.forEach((s) =>
      m.set(s.user_id, s.display_name ?? s.student_no ?? s.user_id.slice(0, 6)),
    );
    return m;
  }, [students]);

  // Create form
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);

  // Edit dialog
  const [editingRow, setEditingRow] = useState<AssignmentRow | null>(null);
  const [editForm, setEditForm] = useState<FormState>(emptyForm());
  const [updating, setUpdating] = useState(false);

  const load = async () => {
    const [studs, { data }, tbs] = await Promise.all([
      fetchAllStudents(),
      supabase.from("assignments").select("*").order("due_at", { ascending: true }),
      fetchAllTextbooks(),
    ]);
    setStudents(studs);
    setRows((data ?? []) as AssignmentRow[]);
    setTextbooks(tbs);
  };

  useEffect(() => {
    void load();
  }, []);

  // ───── 캐스케이딩 로더들 ─────
  const ensureSeries = async (level: LevelCode | "") => {
    if (!level || seriesByLevel[level]) return;
    try {
      const list = await fetchSeriesByLevel(level);
      setSeriesByLevel((m) => ({ ...m, [level]: list }));
    } catch (e) { console.error(e); }
  };
  const ensureTextbooks = async (seriesId: string) => {
    if (!seriesId || tbsBySeries[seriesId]) return;
    try {
      const list = await fetchTextbooksBySeries(seriesId);
      setTbsBySeries((m) => ({ ...m, [seriesId]: list }));
    } catch (e) { console.error(e); }
  };
  const ensureUnits = async (tbId: string) => {
    if (!tbId || unitsByTb[tbId]) return;
    try {
      const list = await fetchUnitsByTextbook(tbId);
      setUnitsByTb((m) => ({ ...m, [tbId]: list }));
    } catch (e) { console.error(e); }
  };
  const ensurePassages = async (unitId: string) => {
    if (!unitId || passagesByUnit[unitId]) return;
    try {
      const list = await fetchPassagesByUnit(unitId);
      setPassagesByUnit((m) => ({ ...m, [unitId]: list }));
    } catch (e) { console.error(e); }
  };

  useEffect(() => { void ensureSeries(form.selectedLevel); }, [form.selectedLevel]); // eslint-disable-line
  useEffect(() => { void ensureTextbooks(form.selectedSeriesId); }, [form.selectedSeriesId]); // eslint-disable-line
  useEffect(() => { void ensureUnits(form.selectedTbId); }, [form.selectedTbId]); // eslint-disable-line
  useEffect(() => { void ensurePassages(form.selectedUnitId); }, [form.selectedUnitId]); // eslint-disable-line

  useEffect(() => { void ensureSeries(editForm.selectedLevel); }, [editForm.selectedLevel]); // eslint-disable-line
  useEffect(() => { void ensureTextbooks(editForm.selectedSeriesId); }, [editForm.selectedSeriesId]); // eslint-disable-line
  useEffect(() => { void ensureUnits(editForm.selectedTbId); }, [editForm.selectedTbId]); // eslint-disable-line
  useEffect(() => { void ensurePassages(editForm.selectedUnitId); }, [editForm.selectedUnitId]); // eslint-disable-line

  // 유닛 선택 시 첫 지문 자동 연결 (사용자가 명시적으로 변경하지 않았다면)
  useEffect(() => {
    if (!form.selectedUnitId) return;
    const ps = passagesByUnit[form.selectedUnitId];
    if (!ps || ps.length === 0) return;
    if (form.selectedPassageCode) return; // 이미 선택됨
    setForm((p) => ({ ...p, selectedPassageCode: ps[0].code }));
  }, [form.selectedUnitId, passagesByUnit]); // eslint-disable-line
  useEffect(() => {
    if (!editForm.selectedUnitId) return;
    const ps = passagesByUnit[editForm.selectedUnitId];
    if (!ps || ps.length === 0) return;
    if (editForm.selectedPassageCode) return;
    setEditForm((p) => ({ ...p, selectedPassageCode: ps[0].code }));
  }, [editForm.selectedUnitId, passagesByUnit]); // eslint-disable-line

  // sentence_id(=passage code) → 사람이 읽는 라벨 매핑 (목록 표시용)
  const codeLabelMap = useMemo(() => {
    const m = new Map<string, string>();
    Object.entries(passagesByUnit).forEach(([unitId, ps]) => {
      // unit → tb 역참조
      let tb: Textbook | undefined;
      let unit: Unit | undefined;
      Object.entries(unitsByTb).forEach(([tbId, units]) => {
        const found = units.find((u) => u.id === unitId);
        if (found) {
          unit = found;
          tb = textbooks.find((t) => t.id === tbId);
        }
      });
      ps.forEach((p) => {
        const prefix = tb ? `[${tb.level}] ${tb.title}` : "";
        const unitLabel = unit ? ` · U${unit.unit_no} ${unit.title}` : "";
        m.set(p.code, `${prefix}${unitLabel} · #${String(p.passage_no).padStart(3, "0")}`);
      });
    });
    return m;
  }, [passagesByUnit, unitsByTb, textbooks]);

  // 목록에 보이는 sentence_id의 unit·passage 자동 로드 (라벨용)
  useEffect(() => {
    const codes = Array.from(new Set(rows.map((r) => r.sentence_id).filter(Boolean) as string[]));
    const missing = codes.filter((c) => !codeLabelMap.has(c));
    if (missing.length === 0) return;
    void (async () => {
      const { data } = await supabase
        .from("textbook_passages")
        .select("unit_id, textbook_id")
        .in("code", missing);
      const unitIds = Array.from(new Set((data ?? []).map((d: any) => d.unit_id as string)));
      const tbIds = Array.from(new Set((data ?? []).map((d: any) => d.textbook_id as string)));
      for (const tbId of tbIds) {
        if (!unitsByTb[tbId]) {
          try {
            const us = await fetchUnitsByTextbook(tbId);
            setUnitsByTb((m) => ({ ...m, [tbId]: us }));
          } catch (e) { console.error(e); }
        }
      }
      for (const unitId of unitIds) {
        if (passagesByUnit[unitId]) continue;
        try {
          const ps = await fetchPassagesByUnit(unitId);
          setPassagesByUnit((m) => ({ ...m, [unitId]: ps }));
        } catch (e) { console.error(e); }
      }
    })();
  }, [rows, codeLabelMap, unitsByTb, passagesByUnit]);


  // 과제별 진척 데이터 로드 (hover용)
  useEffect(() => {
    if (rows.length === 0 || students.length === 0) return;
    const allIds = students.map((s) => s.user_id);
    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        rows
          .filter((r) => r.sentence_id)
          .map(async (r) => {
            const targets = r.student_id ? [r.student_id] : allIds;
            const m = await fetchAssignmentProgress(r.sentence_id!, targets);
            return [r.id, m] as const;
          }),
      );
      if (cancelled) return;
      const next: Record<string, AssignmentProgressMap> = {};
      entries.forEach(([id, m]) => {
        next[id] = m;
      });
      setProgressByAsg(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [rows, students]);

  // 활성 = 미완료 항목만. 마감되었어도 미완료면 활성에 잔존.
  // (완료된 항목은 [과거 과제함] 으로 이동)
  const activeRows = useMemo(() => {
    if (rows.length === 0) return rows;
    const allIds = students.map((s) => s.user_id);
    return rows.filter((r) => !isAssignmentDone(r, progressByAsg[r.id], allIds));
  }, [rows, students, progressByAsg]);

  const validateForm = (f: FormState): string | null => {
    if (!f.title.trim()) return "제목은 필수입니다";
    if (!f.dueDate) return "마감일은 필수입니다";
    if (!f.selectedPassageCode) return "지문을 반드시 연결해야 과제를 생성할 수 있습니다";
    if (!f.includePre && !f.includeAnalysis && !f.includeTranslation && !f.includeWordtest)
      return "학습 단계는 최소 1개 이상 체크하세요";
    return null;
  };

  const handleCreate = async () => {
    const err = validateForm(form);
    if (err) {
      toast({ title: err, variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("로그인이 필요합니다");
      const endOfDay = new Date(form.dueDate!);
      endOfDay.setHours(23, 59, 59, 999);
      // studentIds 가 비어있으면 [null] (전체학생 1건), 아니면 각 학생별 1건씩
      const targets: (string | null)[] =
        form.studentIds.length === 0 ? [null] : form.studentIds;
      const rowsToInsert = targets.map((sid) => ({
        teacher_id: u.user!.id,
        student_id: sid,
        title: form.title.trim(),
        description: form.description.trim() || null,
        sentence_id: form.selectedPassageCode || null,
        due_at: endOfDay.toISOString(),
        include_pre: form.includePre,
        include_analysis: form.includeAnalysis,
        include_translation: form.includeTranslation,
        include_wordtest: form.includeWordtest,
      }));
      const { error } = await supabase.from("assignments").insert(rowsToInsert);
      if (error) throw error;
      toast({
        title: "✅ 과제가 생성되었습니다",
        description:
          form.studentIds.length === 0
            ? "전체 학생 대상"
            : `${form.studentIds.length}명에게 부여됨`,
      });
      setForm(emptyForm());
      void load();
    } catch (e) {
      toast({ title: "저장 실패", description: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("assignments").delete().eq("id", id);
    if (error) {
      toast({ title: "삭제 실패", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "🗑️ 과제 삭제됨" });
    void load();
  };

  // +1주 마감일 빠른 연장
  const handleExtendWeek = async (row: AssignmentRow) => {
    const cur = new Date(row.due_at);
    const next = new Date(cur.getTime() + 7 * 86400000);
    const { error } = await supabase
      .from("assignments")
      .update({ due_at: next.toISOString() })
      .eq("id", row.id);
    if (error) {
      toast({ title: "연장 실패", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "마감일 +1주 연장됨", description: format(next, "yyyy-MM-dd HH:mm") });
    void load();
  };

  const openEdit = async (row: AssignmentRow) => {
    setEditingRow(row);
    // sentence_id로부터 level/series/textbook/unit 역추적
    let level: LevelCode | "" = "";
    let seriesId = "";
    let tbId = "";
    let unitId = "";
    if (row.sentence_id) {
      const { data } = await supabase
        .from("textbook_passages")
        .select("textbook_id, unit_id")
        .eq("code", row.sentence_id)
        .maybeSingle();
      if (data) {
        tbId = (data as any).textbook_id as string;
        unitId = (data as any).unit_id as string;
        const tb = textbooks.find((t) => t.id === tbId);
        if (tb) {
          level = tb.level;
          seriesId = tb.series_id;
        } else {
          // textbooks 목록에 아직 없는 경우 직접 조회
          const { data: tbRow } = await supabase
            .from("textbooks")
            .select("series_id, level")
            .eq("id", tbId)
            .maybeSingle();
          if (tbRow) {
            seriesId = (tbRow as any).series_id as string;
            const { data: srRow } = await supabase
              .from("textbook_series")
              .select("level")
              .eq("id", seriesId)
              .maybeSingle();
            if (srRow) level = (srRow as any).level as LevelCode;
          }
        }
      }
    }
    setEditForm({
      title: row.title,
      studentIds: row.student_id ? [row.student_id] : [],
      selectedLevel: level,
      selectedSeriesId: seriesId,
      selectedTbId: tbId,
      selectedUnitId: unitId,
      selectedPassageCode: row.sentence_id ?? "",
      description: row.description ?? "",
      dueDate: new Date(row.due_at),
      includePre: row.include_pre,
      includeAnalysis: row.include_analysis,
      includeTranslation: row.include_translation,
      includeWordtest: row.include_wordtest,
    });
  };

  const handleUpdate = async () => {
    if (!editingRow) return;
    const err = validateForm(editForm);
    if (err) {
      toast({ title: err, variant: "destructive" });
      return;
    }
    setUpdating(true);
    try {
      const endOfDay = new Date(editForm.dueDate!);
      // 시간이 자정인 경우만 23:59로 보정 (사용자가 직접 시간 지정한 게 아닐 가능성 ↑)
      if (
        endOfDay.getHours() === 0 &&
        endOfDay.getMinutes() === 0 &&
        endOfDay.getSeconds() === 0
      ) {
        endOfDay.setHours(23, 59, 59, 999);
      }
      const { error } = await supabase
        .from("assignments")
        .update({
          title: editForm.title.trim(),
          student_id: editForm.studentIds.length === 0 ? null : editForm.studentIds[0],
          description: editForm.description.trim() || null,
          sentence_id: editForm.selectedPassageCode || null,
          due_at: endOfDay.toISOString(),
          include_pre: editForm.includePre,
          include_analysis: editForm.includeAnalysis,
          include_translation: editForm.includeTranslation,
          include_wordtest: editForm.includeWordtest,
        })
        .eq("id", editingRow.id);
      if (error) throw error;
      toast({ title: "✅ 수정 완료" });
      setEditingRow(null);
      void load();
    } catch (e) {
      toast({ title: "수정 실패", description: String(e), variant: "destructive" });
    } finally {
      setUpdating(false);
    }
  };

  const studentName = (id: string | null) => {
    if (!id) return "전체 학생";
    return students.find((s) => s.user_id === id)?.display_name ?? id.slice(0, 6);
  };

  const remaining = (iso: string) => {
    const ms = new Date(iso).getTime() - Date.now();
    if (ms < 0) return { text: "마감", urgent: true };
    const days = Math.floor(ms / 86400000);
    const hours = Math.floor((ms % 86400000) / 3600000);
    return {
      text: days > 0 ? `${days}일 ${hours}시간 남음` : `${hours}시간 남음`,
      urgent: days < 1,
    };
  };

  const applyPreset = (
    setter: typeof setForm,
    preset: "all" | "analysis" | "wordtest",
  ) => {
    setter((prev) => ({
      ...prev,
      // [전체] 모두 on / [분석만] 단어학습+구문분석 / [단어만] 단어학습+단어시험
      includePre: true,
      includeAnalysis: preset === "all" || preset === "analysis",
      includeTranslation: preset === "all",
      includeWordtest: preset === "all" || preset === "wordtest",
    }));
  };

  // ───── 폼 UI 헬퍼 (create/edit 공유) ─────
  const renderStepCheckboxes = (f: FormState, setter: typeof setForm) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Label>학습 단계 *</Label>
        <div className="flex gap-1">
          <Button type="button" size="sm" variant="ghost" className="h-6 text-[11px] px-2" onClick={() => applyPreset(setter, "all")}>
            전체
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-6 text-[11px] px-2" onClick={() => applyPreset(setter, "analysis")}>
            분석만
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-6 text-[11px] px-2" onClick={() => applyPreset(setter, "wordtest")}>
            단어만
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4 px-3 py-2 rounded-md border border-border bg-muted/30">
        {(
          [
            ["includePre", "단어학습"],
            ["includeAnalysis", "구문분석"],
            ["includeTranslation", "한글해석"],
            ["includeWordtest", "단어시험"],
          ] as Array<[keyof FormState, string]>
        ).map(([k, label]) => (
          <label key={k} className="inline-flex items-center gap-2 cursor-pointer">
            <Checkbox
              checked={f[k] as boolean}
              onCheckedChange={(v) => setter((prev) => ({ ...prev, [k]: !!v }))}
            />
            <span className="text-sm font-medium">{label}</span>
          </label>
        ))}
      </div>
    </div>
  );

  // 레벨 → 시리즈 → 권 → 유닛 → 지문 캐스케이딩 선택기 (create/edit 공유)
  const renderTextbookPickers = (
    f: FormState,
    setter: typeof setForm,
  ) => {
    const seriesList = f.selectedLevel ? seriesByLevel[f.selectedLevel] ?? [] : [];
    const tbList = f.selectedSeriesId ? tbsBySeries[f.selectedSeriesId] ?? [] : [];
    const unitList = f.selectedTbId ? unitsByTb[f.selectedTbId] ?? [] : [];
    const passageList = f.selectedUnitId ? passagesByUnit[f.selectedUnitId] ?? [] : [];

    return (
      <>
        <div className="space-y-1.5">
          <Label>레벨 <span className="text-destructive">*</span></Label>
          <Select
            value={f.selectedLevel || undefined}
            onValueChange={(v) =>
              setter((prev) => ({
                ...prev,
                selectedLevel: v as LevelCode,
                selectedSeriesId: "",
                selectedTbId: "",
                selectedUnitId: "",
                selectedPassageCode: "",
              }))
            }
          >
            <SelectTrigger><SelectValue placeholder="레벨 선택" /></SelectTrigger>
            <SelectContent>
              {LEVELS.map((l) => (
                <SelectItem key={l.code} value={l.code}>
                  [{l.code}] {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>시리즈 <span className="text-destructive">*</span></Label>
          <Select
            value={f.selectedSeriesId || undefined}
            onValueChange={(v) =>
              setter((prev) => ({
                ...prev,
                selectedSeriesId: v,
                selectedTbId: "",
                selectedUnitId: "",
                selectedPassageCode: "",
              }))
            }
            disabled={!f.selectedLevel}
          >
            <SelectTrigger>
              <SelectValue placeholder={f.selectedLevel ? "시리즈 선택" : "레벨을 먼저 선택"} />
            </SelectTrigger>
            <SelectContent>
              {seriesList.length === 0 ? (
                <div className="px-2 py-3 text-xs text-muted-foreground">시리즈가 없습니다</div>
              ) : (
                seriesList.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    #{s.series_no} {s.title}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>권 / 교재 <span className="text-destructive">*</span></Label>
          <Select
            value={f.selectedTbId || undefined}
            onValueChange={(v) =>
              setter((prev) => ({
                ...prev,
                selectedTbId: v,
                selectedUnitId: "",
                selectedPassageCode: "",
              }))
            }
            disabled={!f.selectedSeriesId}
          >
            <SelectTrigger>
              <SelectValue placeholder={f.selectedSeriesId ? "권/교재 선택" : "시리즈를 먼저 선택"} />
            </SelectTrigger>
            <SelectContent>
              {tbList.length === 0 ? (
                <div className="px-2 py-3 text-xs text-muted-foreground">권이 없습니다</div>
              ) : (
                tbList.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    Vol.{t.volume_no} · {t.title}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>유닛 <span className="text-destructive">*</span></Label>
          <Select
            value={f.selectedUnitId || undefined}
            onValueChange={(v) =>
              setter((prev) => ({
                ...prev,
                selectedUnitId: v,
                selectedPassageCode: "",
              }))
            }
            disabled={!f.selectedTbId}
          >
            <SelectTrigger>
              <SelectValue placeholder={f.selectedTbId ? "유닛 선택" : "권을 먼저 선택"} />
            </SelectTrigger>
            <SelectContent>
              {unitList.length === 0 ? (
                <div className="px-2 py-3 text-xs text-muted-foreground">유닛이 없습니다</div>
              ) : (
                unitList.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    U{u.unit_no} · {u.title}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>

        <div className="sm:col-span-2 space-y-1.5">
          <Label className="flex items-center gap-2">
            연결 지문
            <span className="text-[10px] font-normal text-muted-foreground">
              (유닛 선택 시 첫 지문이 자동 선택돼요. 다른 지문으로 바꿀 수 있어요)
            </span>
          </Label>
          <Select
            value={f.selectedPassageCode || undefined}
            onValueChange={(v) =>
              setter((prev) => ({ ...prev, selectedPassageCode: v }))
            }
            disabled={!f.selectedUnitId}
          >
            <SelectTrigger>
              <SelectValue placeholder={f.selectedUnitId ? "지문 선택" : "유닛을 먼저 선택"} />
            </SelectTrigger>
            <SelectContent>
              {passageList.length === 0 ? (
                <div className="px-2 py-3 text-xs text-muted-foreground">지문이 없습니다</div>
              ) : (
                passageList.map((p) => (
                  <SelectItem key={p.id} value={p.code}>
                    <span className="flex items-center gap-2">
                      <BookOpen className="size-3.5 text-muted-foreground" />
                      <span className="font-mono text-xs text-muted-foreground">
                        #{String(p.passage_no).padStart(3, "0")}
                      </span>
                      <span className="truncate max-w-[28rem]">
                        {p.english.slice(0, 60)}
                        {p.english.length > 60 ? "…" : ""}
                      </span>
                    </span>
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
      </>
    );
  };

  return (
    <TeacherLayout>
      <div className="p-6 max-w-4xl mx-auto space-y-6 font-kr">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardList className="size-6 text-primary" /> 특별과제
          </h1>
          <a
            href="/teacher/assignments/past"
            className="text-xs font-bold text-muted-foreground hover:text-primary transition-colors"
          >
            과거 과제함 보기 →
          </a>
        </div>

        <Card className="p-5 space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-primary">새 과제 생성</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>제목 *</Label>
              <Input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} placeholder="예: L05 Unit 3 마감 과제" />
            </div>
            <div className="space-y-1.5">
              <Label>대상 학생 (복수 선택 가능)</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-between text-left font-normal"
                  >
                    <span className="truncate">
                      {form.studentIds.length === 0
                        ? "전체 학생"
                        : `${form.studentIds.length}명 선택됨`}
                    </span>
                    <CalendarIcon className="ml-2 size-4 opacity-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-2 max-h-72 overflow-y-auto bg-popover" align="start">
                  <div className="flex items-center justify-between pb-2 mb-2 border-b">
                    <button
                      type="button"
                      className="text-xs font-bold text-primary hover:underline"
                      onClick={() => setForm((p) => ({ ...p, studentIds: [] }))}
                    >
                      전체 학생 (모두 해제)
                    </button>
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:underline"
                      onClick={() => setForm((p) => ({ ...p, studentIds: students.map((s) => s.user_id) }))}
                    >
                      모두 선택
                    </button>
                  </div>
                  <div className="space-y-1">
                    {students.map((s) => {
                      const checked = form.studentIds.includes(s.user_id);
                      return (
                        <label
                          key={s.user_id}
                          className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted cursor-pointer text-sm"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(v) =>
                              setForm((p) => ({
                                ...p,
                                studentIds: v
                                  ? [...p.studentIds, s.user_id]
                                  : p.studentIds.filter((id) => id !== s.user_id),
                              }))
                            }
                          />
                          <span className="truncate">
                            {s.display_name ?? s.student_no}{" "}
                            <span className="text-xs text-muted-foreground">({s.student_no})</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1.5">
              <Label>마감일 *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("justify-start text-left font-normal", !form.dueDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 size-4" />
                    {form.dueDate ? format(form.dueDate, "yyyy-MM-dd") : "마감일 선택"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={form.dueDate} onSelect={(d) => setForm((p) => ({ ...p, dueDate: d }))} initialFocus className={cn("p-3 pointer-events-auto")} />
                </PopoverContent>
              </Popover>
            </div>
            <div className="sm:col-span-1">
              {renderStepCheckboxes(form, setForm)}
            </div>
            {renderTextbookPickers(form, setForm)}
            <div className="sm:col-span-2 space-y-1.5">
              <Label>설명 (선택)</Label>
              <Textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} rows={3} />
            </div>
          </div>
          <Button onClick={handleCreate} disabled={saving}>{saving ? "저장 중…" : "과제 생성"}</Button>
        </Card>

        <Card className="p-5 space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-primary">진행중 과제 ({activeRows.length})</h2>
          {activeRows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">진행중인 과제가 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {activeRows.map((r) => {
                const rem = remaining(r.due_at);
                const passageLabel = r.sentence_id ? codeLabelMap.get(r.sentence_id) ?? r.sentence_id : null;
                const missingSentence = !r.sentence_id;
                return (
                  <div key={r.id} className={cn("p-3 rounded-lg border-2 flex items-start justify-between gap-3", missingSentence ? "border-amber-500/50 bg-amber-50/30 dark:bg-amber-500/5" : rem.urgent ? "border-destructive/40 bg-destructive/5" : "border-border")}>
                    <div className="space-y-1.5 min-w-0 flex-1">
                      <div className="font-bold text-foreground flex items-center gap-2 flex-wrap">
                        {r.title}
                        {missingSentence && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-500 text-white text-[10px] font-extrabold">
                            ⚠ 지문 미연결 — 편집해서 연결하세요
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground flex flex-wrap gap-2">
                        <span>대상: {studentName(r.student_id)}</span>
                        <span>· 마감: {format(new Date(r.due_at), "yyyy-MM-dd HH:mm")}</span>
                        <span className={cn("font-bold", rem.urgent ? "text-destructive" : "text-primary")}>· {rem.text}</span>
                        {passageLabel && <span>· {passageLabel}</span>}
                      </div>
                      <AssignmentStepBadges
                        includePre={r.include_pre}
                        includeAnalysis={r.include_analysis}
                        includeTranslation={r.include_translation}
                        includeWordtest={r.include_wordtest}
                        progress={progressByAsg[r.id]}
                        studentNameMap={studentNameMap}
                        targetUserIds={
                          r.student_id
                            ? [r.student_id]
                            : students.map((s) => s.user_id)
                        }
                      />
                      {r.description && <p className="text-xs text-foreground/80 mt-1">{r.description}</p>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-[11px] px-2 text-primary"
                        onClick={() => handleExtendWeek(r)}
                        title="마감일 +1주"
                      >
                        <Plus className="size-3" />
                        1주
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => openEdit(r)} title="수정">
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive" onClick={() => handleDelete(r.id)} title="삭제">
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* 수정 다이얼로그 */}
        <Dialog open={!!editingRow} onOpenChange={(o) => !o && setEditingRow(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>과제 수정</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>제목 *</Label>
                <Input value={editForm.title} onChange={(e) => setEditForm((p) => ({ ...p, title: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>대상 학생</Label>
                <Select
                  value={editForm.studentIds[0] ?? "__all__"}
                  onValueChange={(v) =>
                    setEditForm((p) => ({ ...p, studentIds: v === "__all__" ? [] : [v] }))
                  }
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">전체 학생</SelectItem>
                    {students.map((s) => (
                      <SelectItem key={s.user_id} value={s.user_id}>
                        {s.display_name ?? s.student_no} ({s.student_no})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>마감일 *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("justify-start text-left font-normal", !editForm.dueDate && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 size-4" />
                      {editForm.dueDate ? format(editForm.dueDate, "yyyy-MM-dd") : "마감일 선택"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={editForm.dueDate} onSelect={(d) => setEditForm((p) => ({ ...p, dueDate: d }))} initialFocus className={cn("p-3 pointer-events-auto")} />
                  </PopoverContent>
                </Popover>
              </div>
              <div>{renderStepCheckboxes(editForm, setEditForm)}</div>
              {renderTextbookPickers(editForm, setEditForm)}
              <div className="sm:col-span-2 space-y-1.5">
                <Label>설명 (선택)</Label>
                <Textarea value={editForm.description} onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))} rows={3} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setEditingRow(null)} disabled={updating}>취소</Button>
              <Button onClick={handleUpdate} disabled={updating}>{updating ? "저장 중…" : "저장"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TeacherLayout>
  );
};

export default Assignments;

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
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
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
  Check,
  ChevronsUpDown,
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
  studentId: string; // "__all__" or user_id
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
  studentId: "__all__",
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
  const [passagesByTb, setPassagesByTb] = useState<Record<string, Passage[]>>({});
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
  const [tbOpen, setTbOpen] = useState(false);
  const [pgOpen, setPgOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Edit dialog
  const [editingRow, setEditingRow] = useState<AssignmentRow | null>(null);
  const [editForm, setEditForm] = useState<FormState>(emptyForm());
  const [editTbOpen, setEditTbOpen] = useState(false);
  const [editPgOpen, setEditPgOpen] = useState(false);
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

  const ensurePassagesLoaded = async (tbId: string) => {
    if (!tbId || passagesByTb[tbId]) return;
    try {
      const ps = await fetchPassagesByTextbook(tbId);
      setPassagesByTb((m) => ({ ...m, [tbId]: ps }));
    } catch (e) {
      console.error(e);
    }
  };

  // 교재 선택 시 지문 로드 (create form)
  useEffect(() => {
    void ensurePassagesLoaded(form.selectedTbId);
  }, [form.selectedTbId]); // eslint-disable-line react-hooks/exhaustive-deps

  // 교재 선택 시 지문 로드 (edit form)
  useEffect(() => {
    void ensurePassagesLoaded(editForm.selectedTbId);
  }, [editForm.selectedTbId]); // eslint-disable-line react-hooks/exhaustive-deps

  const tbLabel = (t: Textbook) => `[${t.level}] ${t.title} · Unit ${t.unit_no}`;

  // sentence_id(=passage code) → 사람이 읽는 라벨 매핑
  const codeLabelMap = useMemo(() => {
    const m = new Map<string, string>();
    Object.entries(passagesByTb).forEach(([tbId, ps]) => {
      const tb = textbooks.find((t) => t.id === tbId);
      if (!tb) return;
      ps.forEach((p) => {
        m.set(p.code, `[${tb.level}] ${tb.title} · #${String(p.passage_no).padStart(3, "0")}`);
      });
    });
    return m;
  }, [passagesByTb, textbooks]);

  // 목록에 보이는 sentence_id의 교재 자동 로드 (라벨용)
  useEffect(() => {
    const codes = Array.from(new Set(rows.map((r) => r.sentence_id).filter(Boolean) as string[]));
    const missing = codes.filter((c) => !codeLabelMap.has(c));
    if (missing.length === 0 || textbooks.length === 0) return;
    void (async () => {
      const { data } = await supabase
        .from("textbook_passages")
        .select("textbook_id")
        .in("code", missing);
      const tbIds = Array.from(new Set((data ?? []).map((d: any) => d.textbook_id as string)));
      for (const id of tbIds) {
        if (passagesByTb[id]) continue;
        try {
          const ps = await fetchPassagesByTextbook(id);
          setPassagesByTb((m) => ({ ...m, [id]: ps }));
        } catch (e) {
          console.error(e);
        }
      }
    })();
  }, [rows, codeLabelMap, textbooks, passagesByTb]);

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
      const { error } = await supabase.from("assignments").insert({
        teacher_id: u.user.id,
        student_id: form.studentId === "__all__" ? null : form.studentId,
        title: form.title.trim(),
        description: form.description.trim() || null,
        sentence_id: form.selectedPassageCode || null,
        due_at: endOfDay.toISOString(),
        include_pre: form.includePre,
        include_analysis: form.includeAnalysis,
        include_translation: form.includeTranslation,
        include_wordtest: form.includeWordtest,
      });
      if (error) throw error;
      toast({ title: "✅ 과제가 생성되었습니다" });
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
    // 해당 sentence_id의 교재를 찾아 미리 셀렉트
    let tbId = "";
    if (row.sentence_id) {
      // 모든 로드된 passages에서 찾기
      for (const [id, ps] of Object.entries(passagesByTb)) {
        if (ps.some((p) => p.code === row.sentence_id)) {
          tbId = id;
          break;
        }
      }
      if (!tbId) {
        // DB 조회
        const { data } = await supabase
          .from("textbook_passages")
          .select("textbook_id")
          .eq("code", row.sentence_id)
          .maybeSingle();
        if (data) tbId = (data as any).textbook_id as string;
      }
    }
    setEditForm({
      title: row.title,
      studentId: row.student_id ?? "__all__",
      selectedTbId: tbId,
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
          student_id: editForm.studentId === "__all__" ? null : editForm.studentId,
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

  // 교재/지문 선택기 (create/edit 공유)
  const renderTextbookPickers = (
    f: FormState,
    setter: typeof setForm,
    openTb: boolean,
    setOpenTb: (b: boolean) => void,
    openPg: boolean,
    setOpenPg: (b: boolean) => void,
    keyPrefix: string,
  ) => {
    const selectedTb = textbooks.find((t) => t.id === f.selectedTbId) ?? null;
    const currentPassages = f.selectedTbId ? passagesByTb[f.selectedTbId] ?? [] : [];
    const selectedPassage = currentPassages.find((p) => p.code === f.selectedPassageCode);

    return (
      <>
        <div className="space-y-1.5">
          <Label>연결 교재 <span className="text-destructive">*</span></Label>
          <Popover open={openTb} onOpenChange={setOpenTb}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                className={cn("w-full justify-between text-left font-normal", !selectedTb && "text-muted-foreground")}
              >
                <span className="flex items-center gap-2 min-w-0 truncate">
                  <BookOpen className="size-4 shrink-0" />
                  <span className="truncate">{selectedTb ? tbLabel(selectedTb) : "교재 검색·선택"}</span>
                </span>
                <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0 bg-popover" align="start">
              <Command>
                <CommandInput placeholder="레벨/제목/Unit 검색…" />
                <CommandList>
                  <CommandEmpty>일치하는 교재가 없습니다.</CommandEmpty>
                  <CommandGroup>
                    <CommandItem
                      value={`${keyPrefix}-none 미지정`}
                      onSelect={() => {
                        setter((prev) => ({ ...prev, selectedTbId: "", selectedPassageCode: "" }));
                        setOpenTb(false);
                      }}
                    >
                      <Check className={cn("mr-2 size-4", !f.selectedTbId ? "opacity-100" : "opacity-0")} />
                      교재 미지정
                    </CommandItem>
                    {textbooks.map((t) => (
                      <CommandItem
                        key={t.id}
                        value={`${t.level} ${t.title} unit ${t.unit_no} u${t.unit_no}`}
                        onSelect={() => {
                          setter((prev) => ({ ...prev, selectedTbId: t.id, selectedPassageCode: "" }));
                          setOpenTb(false);
                        }}
                      >
                        <Check className={cn("mr-2 size-4", f.selectedTbId === t.id ? "opacity-100" : "opacity-0")} />
                        {tbLabel(t)}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
        <div className="space-y-1.5">
          <Label>연결 지문 <span className="text-destructive">*</span></Label>
          <Popover open={openPg} onOpenChange={(o) => f.selectedTbId && setOpenPg(o)}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                disabled={!f.selectedTbId}
                className={cn("w-full justify-between text-left font-normal", !selectedPassage && "text-muted-foreground")}
              >
                <span className="truncate min-w-0">
                  {selectedPassage
                    ? `#${String(selectedPassage.passage_no).padStart(3, "0")} ${selectedPassage.english.slice(0, 40)}…`
                    : f.selectedTbId
                      ? "지문 검색·선택"
                      : "교재를 먼저 선택하세요"}
                </span>
                <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0 bg-popover" align="start">
              <Command>
                <CommandInput placeholder="번호/본문 검색…" />
                <CommandList>
                  <CommandEmpty>지문이 없습니다.</CommandEmpty>
                  <CommandGroup>
                    <CommandItem
                      value={`${keyPrefix}-no-passage 미지정`}
                      onSelect={() => {
                        setter((prev) => ({ ...prev, selectedPassageCode: "" }));
                        setOpenPg(false);
                      }}
                    >
                      <Check className={cn("mr-2 size-4", !f.selectedPassageCode ? "opacity-100" : "opacity-0")} />
                      지문 미지정 (교재 전체 안내용)
                    </CommandItem>
                    {currentPassages.map((p) => (
                      <CommandItem
                        key={p.id}
                        value={`#${p.passage_no} ${p.english}`}
                        onSelect={() => {
                          setter((prev) => ({ ...prev, selectedPassageCode: p.code }));
                          setOpenPg(false);
                        }}
                      >
                        <Check className={cn("mr-2 size-4", f.selectedPassageCode === p.code ? "opacity-100" : "opacity-0")} />
                        <span className="truncate">
                          <span className="font-mono text-xs text-muted-foreground mr-2">
                            #{String(p.passage_no).padStart(3, "0")}
                          </span>
                          {p.english.slice(0, 60)}
                          {p.english.length > 60 ? "…" : ""}
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
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
              <Label>대상 학생</Label>
              <Select value={form.studentId} onValueChange={(v) => setForm((p) => ({ ...p, studentId: v }))}>
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
            {renderTextbookPickers(form, setForm, tbOpen, setTbOpen, pgOpen, setPgOpen, "create")}
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
                <Select value={editForm.studentId} onValueChange={(v) => setEditForm((p) => ({ ...p, studentId: v }))}>
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
              {renderTextbookPickers(editForm, setEditForm, editTbOpen, setEditTbOpen, editPgOpen, setEditPgOpen, "edit")}
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

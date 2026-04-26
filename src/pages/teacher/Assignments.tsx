import { TeacherLayout } from "@/components/teacher/TeacherLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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

import {
  fetchAssignmentProgress,
  type AssignmentProgressMap,
} from "@/lib/assignmentProgress";
import { isAssignmentDone } from "@/lib/assignmentCompletion";
import { fetchMasterAvailability } from "@/lib/masterAvailability";

interface AssignmentGroup {
  key: string;
  title: string;
  description: string | null;
  student_id: string | null;
  unit_id: string | null;
  unit_label: string | null;
  due_at: string;
  include_pre: boolean;
  include_analysis: boolean;
  include_translation: boolean;
  include_wordtest: boolean;
  rows: AssignmentRow[];
  totalCount: number;
  doneCount: number;
}

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

type AssignMode = "unit" | "sentence";

interface FormState {
  title: string;
  /** 출제 모드: unit = 유닛 전체 지문, sentence = 단일 문장만 */
  mode: AssignMode;
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
  mode: "unit",
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
  /** sentence_id → 마스터키(원장 owner_progress) 존재 여부 (sentence 모드 뱃지/안내용) */
  const [masterAvail, setMasterAvail] = useState<Record<string, boolean>>({});
  const [progressByAsg, setProgressByAsg] = useState<Record<string, AssignmentProgressMap>>({});
  /** sentence_id(=passage code) → unit_id 매핑 (그룹핑·라벨용) */
  const [codeToUnit, setCodeToUnit] = useState<Record<string, string>>({});

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

  // 유닛 선택 시 첫 지문 자동 연결 (unit 모드에서만; sentence 모드는 사용자 명시 선택 필수)
  useEffect(() => {
    if (form.mode !== "unit") return;
    if (!form.selectedUnitId) return;
    const ps = passagesByUnit[form.selectedUnitId];
    if (!ps || ps.length === 0) return;
    if (form.selectedPassageCode) return; // 이미 선택됨
    setForm((p) => ({ ...p, selectedPassageCode: ps[0].code }));
  }, [form.selectedUnitId, form.mode, passagesByUnit]); // eslint-disable-line
  useEffect(() => {
    // 편집 다이얼로그는 항상 unit 동작과 동일 (모드 잠금)
    if (!editForm.selectedUnitId) return;
    const ps = passagesByUnit[editForm.selectedUnitId];
    if (!ps || ps.length === 0) return;
    if (editForm.selectedPassageCode) return;
    setEditForm((p) => ({ ...p, selectedPassageCode: ps[0].code }));
  }, [editForm.selectedUnitId, passagesByUnit]); // eslint-disable-line

  // sentence 모드: 선택 유닛의 지문에 대해 마스터키 가용성 일괄 조회 (뱃지/안내용)
  useEffect(() => {
    if (form.mode !== "sentence") return;
    if (!form.selectedUnitId) return;
    const ps = passagesByUnit[form.selectedUnitId];
    if (!ps || ps.length === 0) return;
    const codes = ps.map((p) => p.code).filter((c) => !(c in masterAvail));
    if (codes.length === 0) return;
    let cancelled = false;
    void (async () => {
      try {
        const map = await fetchMasterAvailability(codes);
        if (cancelled) return;
        setMasterAvail((prev) => ({ ...prev, ...map }));
      } catch (e) {
        console.error(e);
      }
    })();
    return () => { cancelled = true; };
  }, [form.mode, form.selectedUnitId, passagesByUnit]); // eslint-disable-line

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

  // 목록에 보이는 sentence_id의 unit·passage 자동 로드 (라벨용 + 그룹핑용)
  useEffect(() => {
    const codes = Array.from(new Set(rows.map((r) => r.sentence_id).filter(Boolean) as string[]));
    const missing = codes.filter((c) => !codeLabelMap.has(c) || !codeToUnit[c]);
    if (missing.length === 0) return;
    void (async () => {
      const { data } = await supabase
        .from("textbook_passages")
        .select("code, unit_id, textbook_id")
        .in("code", missing);
      const rows2 = (data ?? []) as { code: string; unit_id: string; textbook_id: string }[];
      // codeToUnit 매핑 적재
      setCodeToUnit((prev) => {
        const next = { ...prev };
        rows2.forEach((r) => { if (r.unit_id) next[r.code] = r.unit_id; });
        return next;
      });
      const unitIds = Array.from(new Set(rows2.map((d) => d.unit_id)));
      const tbIds = Array.from(new Set(rows2.map((d) => d.textbook_id)));
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
  }, [rows, codeLabelMap, unitsByTb, passagesByUnit, codeToUnit]);


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

  // unit_id → 라벨 ([Lxx] 교재명 · Uxxx 유닛명)
  const unitLabelMap = useMemo(() => {
    const m = new Map<string, string>();
    Object.entries(unitsByTb).forEach(([tbId, units]) => {
      const tb = textbooks.find((t) => t.id === tbId);
      const tbPrefix = tb ? `[${tb.level}] ${tb.title}` : "";
      units.forEach((u) => {
        m.set(u.id, `${tbPrefix} · U${u.unit_no} ${u.title}`);
      });
    });
    return m;
  }, [unitsByTb, textbooks]);

  // 그룹핑: (title|due_at|student_id|unit_id) — 같은 유닛에 동시에 부여된 지문들을 1장으로 묶음
  const activeGroups = useMemo<AssignmentGroup[]>(() => {
    if (activeRows.length === 0) return [];
    const allIds = students.map((s) => s.user_id);
    const groupMap = new Map<string, AssignmentRow[]>();
    activeRows.forEach((r) => {
      const unitId = r.sentence_id ? codeToUnit[r.sentence_id] ?? null : null;
      // unit_id를 모르면 sentence_id 단위로 분리(폴백). 알면 유닛으로 묶음.
      const groupKey = `${r.title}|${r.due_at}|${r.student_id ?? "__all__"}|${unitId ?? `noUnit:${r.sentence_id ?? r.id}`}`;
      if (!groupMap.has(groupKey)) groupMap.set(groupKey, []);
      groupMap.get(groupKey)!.push(r);
    });
    const out: AssignmentGroup[] = [];
    groupMap.forEach((grpRows, key) => {
      const sorted = grpRows
        .slice()
        .sort((a, b) => (a.sentence_id ?? "").localeCompare(b.sentence_id ?? ""));
      const head = sorted[0];
      const unitId = head.sentence_id ? codeToUnit[head.sentence_id] ?? null : null;
      const doneCount = sorted.filter((r) => {
        const targets = r.student_id ? [r.student_id] : allIds;
        return isAssignmentDone(r, progressByAsg[r.id], targets);
      }).length;
      out.push({
        key,
        title: head.title,
        description: head.description,
        student_id: head.student_id,
        unit_id: unitId,
        unit_label: unitId ? unitLabelMap.get(unitId) ?? null : null,
        due_at: head.due_at,
        include_pre: head.include_pre,
        include_analysis: head.include_analysis,
        include_translation: head.include_translation,
        include_wordtest: head.include_wordtest,
        rows: sorted,
        totalCount: sorted.length,
        doneCount,
      });
    });
    return out.sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime());
  }, [activeRows, students, codeToUnit, unitLabelMap, progressByAsg]);

  const validateForm = (f: FormState): string | null => {
    if (!f.title.trim()) return "제목은 필수입니다";
    if (!f.dueDate) return "마감일은 필수입니다";
    if (f.mode === "sentence") {
      if (!f.selectedUnitId) return "유닛을 먼저 선택해주세요";
      if (!f.selectedPassageCode) return "출제할 문장을 선택해주세요";
    } else {
      if (!f.selectedPassageCode) return "지문을 반드시 연결해야 과제를 생성할 수 있습니다";
    }
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

      // 출제 모드별 지문 코드 결정:
      // - unit  : 선택된 유닛의 모든 지문 자동 부여 (기존 동작 유지)
      // - sentence: 사용자가 명시 선택한 단일 문장만 부여
      let passageCodes: string[];
      if (form.mode === "sentence") {
        passageCodes = form.selectedPassageCode ? [form.selectedPassageCode] : [];
      } else {
        const unitPassages = form.selectedUnitId
          ? passagesByUnit[form.selectedUnitId] ?? []
          : [];
        passageCodes =
          unitPassages.length > 0
            ? unitPassages
                .slice()
                .sort((a, b) => a.passage_no - b.passage_no)
                .map((p) => p.code)
            : form.selectedPassageCode
            ? [form.selectedPassageCode]
            : [];
      }

      if (passageCodes.length === 0) {
        throw new Error("부여할 지문을 찾을 수 없습니다");
      }

      const rowsToInsert = targets.flatMap((sid) =>
        passageCodes.map((code) => ({
          teacher_id: u.user!.id,
          student_id: sid,
          title: form.title.trim(),
          description: form.description.trim() || null,
          sentence_id: code,
          due_at: endOfDay.toISOString(),
          include_pre: form.includePre,
          include_analysis: form.includeAnalysis,
          include_translation: form.includeTranslation,
          include_wordtest: form.includeWordtest,
        })),
      );
      const { error } = await supabase.from("assignments").insert(rowsToInsert);
      if (error) throw error;
      const studentMsg =
        form.studentIds.length === 0
          ? "전체 학생"
          : `${form.studentIds.length}명`;
      const unitLabel =
        form.mode === "sentence"
          ? `문장 1개`
          : `유닛 지문 ${passageCodes.length}개`;
      toast({
        title: "✅ 과제가 생성되었습니다",
        description: `${studentMsg} × ${unitLabel} = ${rowsToInsert.length}건 부여됨`,
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

  /** 그룹 전체(같은 유닛의 모든 지문 행)를 일괄 삭제 */
  const handleDeleteGroup = async (group: AssignmentGroup) => {
    const ids = group.rows.map((r) => r.id);
    if (ids.length === 0) return;
    const ok = window.confirm(
      `이 유닛 과제(${group.totalCount}개 지문)를 모두 삭제할까요?`,
    );
    if (!ok) return;
    const { error } = await supabase.from("assignments").delete().in("id", ids);
    if (error) {
      toast({ title: "삭제 실패", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: `🗑️ ${ids.length}개 과제 삭제됨` });
    void load();
  };

  /** 그룹 전체 마감일 +1주 일괄 연장 */
  const handleExtendGroupWeek = async (group: AssignmentGroup) => {
    const cur = new Date(group.due_at);
    const next = new Date(cur.getTime() + 7 * 86400000);
    const ids = group.rows.map((r) => r.id);
    const { error } = await supabase
      .from("assignments")
      .update({ due_at: next.toISOString() })
      .in("id", ids);
    if (error) {
      toast({ title: "연장 실패", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "마감일 +1주 연장됨", description: format(next, "yyyy-MM-dd HH:mm") });
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
      mode: "unit", // 편집은 모드 잠금 (생성 시 결정된 형태 유지)
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

      // 🆕 같은 유닛 그룹의 모든 행을 찾아 메타(제목/설명/마감/대상/단계)를 일괄 적용.
      // (sentence_id가 같은 그룹에 속한 형제 행들이라면 동일 유닛 = 같은 unit_id)
      const editingUnitId = editingRow.sentence_id
        ? codeToUnit[editingRow.sentence_id] ?? null
        : null;
      const groupRowIds = rows
        .filter(
          (r) =>
            r.title === editingRow.title &&
            r.due_at === editingRow.due_at &&
            (r.student_id ?? null) === (editingRow.student_id ?? null) &&
            (editingUnitId
              ? r.sentence_id && codeToUnit[r.sentence_id] === editingUnitId
              : r.id === editingRow.id),
        )
        .map((r) => r.id);
      const targetIds = groupRowIds.length > 0 ? groupRowIds : [editingRow.id];

      // 1) 그룹 전체에 메타 적용 (sentence_id는 건드리지 않음 — 각 행 보존)
      const { error: metaErr } = await supabase
        .from("assignments")
        .update({
          title: editForm.title.trim(),
          student_id: editForm.studentIds.length === 0 ? null : editForm.studentIds[0],
          description: editForm.description.trim() || null,
          due_at: endOfDay.toISOString(),
          include_pre: editForm.includePre,
          include_analysis: editForm.includeAnalysis,
          include_translation: editForm.includeTranslation,
          include_wordtest: editForm.includeWordtest,
        })
        .in("id", targetIds);
      if (metaErr) throw metaErr;

      // 2) 대표 행에 한해 sentence_id 변경분 반영 (필요 시)
      if (
        editForm.selectedPassageCode &&
        editForm.selectedPassageCode !== editingRow.sentence_id
      ) {
        await supabase
          .from("assignments")
          .update({ sentence_id: editForm.selectedPassageCode })
          .eq("id", editingRow.id);
      }

      toast({
        title: "✅ 수정 완료",
        description:
          targetIds.length > 1
            ? `유닛 전체 ${targetIds.length}개 지문에 일괄 적용됨`
            : undefined,
      });
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
          <Label className="flex items-center gap-2 flex-wrap">
            {f.mode === "sentence" ? (
              <>
                출제할 문장 <span className="text-destructive">*</span>
                <span className="text-[10px] font-normal text-primary">
                  (이 문장 1개만 부여됩니다)
                </span>
              </>
            ) : (
              <>
                연결 지문
                <span className="text-[10px] font-normal text-primary">
                  (✨ 신규 과제는 선택한 <b>유닛 전체 지문</b>이 자동 부여됩니다. 아래 선택은 확인용)
                </span>
              </>
            )}
          </Label>
          <Select
            value={f.selectedPassageCode || undefined}
            onValueChange={(v) =>
              setter((prev) => ({ ...prev, selectedPassageCode: v }))
            }
            disabled={!f.selectedUnitId}
          >
            <SelectTrigger>
              <SelectValue
                placeholder={
                  !f.selectedUnitId
                    ? "유닛을 먼저 선택"
                    : f.mode === "sentence"
                    ? "문장을 선택해주세요"
                    : "지문 선택"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {passageList.length === 0 ? (
                <div className="px-2 py-3 text-xs text-muted-foreground">지문이 없습니다</div>
              ) : (
                passageList.map((p) => {
                  const hasMaster = masterAvail[p.code];
                  const showBadge = f.mode === "sentence";
                  return (
                    <SelectItem key={p.id} value={p.code}>
                      <span className="flex items-center gap-2">
                        {showBadge ? (
                          <span
                            className="text-sm shrink-0"
                            title={hasMaster ? "마스터키 등록됨" : "마스터키 미등록"}
                          >
                            {hasMaster ? "🔑" : "⏳"}
                          </span>
                        ) : (
                          <BookOpen className="size-3.5 text-muted-foreground" />
                        )}
                        <span className="font-mono text-xs text-muted-foreground">
                          {showBadge
                            ? p.code
                            : `#${String(p.passage_no).padStart(3, "0")}`}
                        </span>
                        <span className="truncate max-w-[24rem]">
                          {p.english.slice(0, 50)}
                          {p.english.length > 50 ? "…" : ""}
                        </span>
                      </span>
                    </SelectItem>
                  );
                })
              )}
            </SelectContent>
          </Select>
          {f.mode === "sentence" &&
            f.selectedPassageCode &&
            masterAvail[f.selectedPassageCode] === false && (
              <p className="text-[11px] leading-relaxed text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded px-2 py-1.5">
                ⏳ 이 문장은 마스터키가 등록되어 있지 않아, 학생 학습 결과가
                <b> 보류(hold)</b> 상태로 저장됩니다. 추후 마스터키 등록 시 채점됩니다.
              </p>
            )}
        </div>
      </>
    );
  };

  return (
    <TeacherLayout>
      <div className="p-6 max-w-4xl mx-auto space-y-6 font-kr">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardList className="size-6 text-primary" /> 특별과제
          </h1>
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
                          className="flex items-stretch rounded hover:bg-muted cursor-pointer text-sm overflow-x-auto"
                        >
                          {/* 좌측 고정: 체크박스 + 이름 + 학번 */}
                          <div className="sticky left-0 z-10 bg-popover flex items-center gap-2 px-2 py-1 min-w-[12rem] pr-3 border-r border-border/40">
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
                          </div>
                          {/* 학생별 워크북 모드 토글 제거됨 — 인쇄 시 모달에서 직접 선택 */}
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
            <div className="sm:col-span-2 space-y-2">
              <Label>출제 모드 *</Label>
              <RadioGroup
                value={form.mode}
                onValueChange={(v) =>
                  setForm((p) => ({
                    ...p,
                    mode: v as AssignMode,
                    // 모드 전환 시 지문 선택 리셋 (sentence: 사용자 명시 선택 강제)
                    selectedPassageCode: "",
                  }))
                }
                className="flex flex-wrap gap-4 px-3 py-2 rounded-md border border-border bg-muted/30"
              >
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <RadioGroupItem value="unit" id="mode-unit" />
                  <span className="text-sm font-medium">유닛 전체</span>
                  <span className="text-[10px] text-muted-foreground">(기본 · 모든 지문)</span>
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <RadioGroupItem value="sentence" id="mode-sentence" />
                  <span className="text-sm font-medium">특정 문장만</span>
                  <span className="text-[10px] text-muted-foreground">(테스트·보충용)</span>
                </label>
              </RadioGroup>
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
          <h2 className="text-sm font-bold uppercase tracking-wider text-primary">진행중 과제 ({activeGroups.length})</h2>
          {activeGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">진행중인 과제가 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {activeGroups.map((g) => {
                const rem = remaining(g.due_at);
                const head = g.rows[0];
                const missingSentence = !head.sentence_id;
                // 라벨: 유닛이 식별되면 유닛 라벨 + 지문 수, 아니면 단일 passage 라벨로 폴백
                const label = g.unit_label
                  ? `${g.unit_label} · 지문 ${g.totalCount}개`
                  : head.sentence_id
                  ? codeLabelMap.get(head.sentence_id) ?? head.sentence_id
                  : null;
                // 그룹 진척: 모든 row의 모든 대상 학생 progress 합산
                const allTargetIds = head.student_id
                  ? [head.student_id]
                  : students.map((s) => s.user_id);
                const mergedProgress: AssignmentProgressMap = new Map();
                allTargetIds.forEach((uid) => {
                  // 유닛 안의 모든 sentence가 해당 step을 완료해야 그 학생이 그 step done
                  const isStepDone = (s: { status: string }) =>
                    s.status === "pass" || s.status === "done";
                  let allPre = true, allWt = true, allAn = true, allTr = true;
                  let anyData = false;
                  let preScoreSum = 0, preCnt = 0;
                  let anScoreSum = 0, anCnt = 0;
                  let wtScoreSum = 0, wtCnt = 0;
                  g.rows.forEach((r) => {
                    const p = progressByAsg[r.id]?.get(uid);
                    if (!p) { allPre = allWt = allAn = allTr = false; return; }
                    anyData = true;
                    if (!isStepDone(p.pre)) allPre = false;
                    else if (p.pre.score != null) { preScoreSum += p.pre.score; preCnt++; }
                    if (!isStepDone(p.wordtest)) allWt = false;
                    else if (p.wordtest.score != null) { wtScoreSum += p.wordtest.score; wtCnt++; }
                    if (!isStepDone(p.analysis)) allAn = false;
                    else if (p.analysis.score != null) { anScoreSum += p.analysis.score; anCnt++; }
                    if (!isStepDone(p.translation)) allTr = false;
                  });
                  mergedProgress.set(uid, {
                    pre: { status: anyData && allPre ? "done" : "missing", score: preCnt > 0 ? Math.round(preScoreSum / preCnt) : null },
                    analysis: { status: anyData && allAn ? "pass" : "missing", score: anCnt > 0 ? Math.round(anScoreSum / anCnt) : null },
                    translation: { status: anyData && allTr ? "done" : "missing", score: null },
                    wordtest: { status: anyData && allWt ? "pass" : "missing", score: wtCnt > 0 ? Math.round(wtScoreSum / wtCnt) : null },
                  });
                });
                return (
                  <div key={g.key} className={cn("p-3 rounded-lg border-2 flex items-start justify-between gap-3", missingSentence ? "border-amber-500/50 bg-amber-50/30 dark:bg-amber-500/5" : rem.urgent ? "border-destructive/40 bg-destructive/5" : "border-border")}>
                    <div className="space-y-1.5 min-w-0 flex-1">
                      <div className="font-bold text-foreground flex items-center gap-2 flex-wrap">
                        {g.title}
                        <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-extrabold">
                          유닛 · 지문 {g.totalCount}개
                        </span>
                        {missingSentence && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-500 text-white text-[10px] font-extrabold">
                            ⚠ 지문 미연결 — 편집해서 연결하세요
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground flex flex-wrap gap-2">
                        <span>대상: {studentName(g.student_id)}</span>
                        <span>· 마감: {format(new Date(g.due_at), "yyyy-MM-dd HH:mm")}</span>
                        <span className={cn("font-bold", rem.urgent ? "text-destructive" : "text-primary")}>· {rem.text}</span>
                        {label && <span>· {label}</span>}
                      </div>
                      <AssignmentStepBadges
                        includePre={g.include_pre}
                        includeAnalysis={g.include_analysis}
                        includeTranslation={g.include_translation}
                        includeWordtest={g.include_wordtest}
                        progress={mergedProgress}
                        studentNameMap={studentNameMap}
                        targetUserIds={allTargetIds}
                      />
                      {g.description && <p className="text-xs text-foreground/80 mt-1">{g.description}</p>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-[11px] px-2 text-primary"
                        onClick={() => handleExtendGroupWeek(g)}
                        title="유닛 전체 마감일 +1주"
                      >
                        <Plus className="size-3" />
                        1주
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => openEdit(head)} title="수정 (대표 지문)">
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive" onClick={() => handleDeleteGroup(g)} title="유닛 전체 삭제">
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
              <div className="sm:col-span-2 space-y-2 opacity-70">
                <Label>출제 모드</Label>
                <RadioGroup value={editForm.mode} disabled className="flex flex-wrap gap-4 px-3 py-2 rounded-md border border-border bg-muted/30">
                  <label className="inline-flex items-center gap-2">
                    <RadioGroupItem value="unit" disabled />
                    <span className="text-sm font-medium">유닛 전체</span>
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <RadioGroupItem value="sentence" disabled />
                    <span className="text-sm font-medium">특정 문장만</span>
                  </label>
                </RadioGroup>
                <p className="text-[11px] text-muted-foreground">
                  출제 모드는 변경할 수 없습니다. 다른 모드로 출제하려면 새 과제를 생성해주세요.
                </p>
              </div>
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

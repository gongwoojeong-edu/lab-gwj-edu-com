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
  Search,
  Users,
  LayoutList,
  Rows3,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentUserId } from "@/lib/authState";
import { toast } from "@/hooks/use-toast";
import { fetchAllStudents, type StudentProfile } from "@/lib/studentProfile";
import { sortStudents } from "@/lib/studentSort";
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
import { useLevelLabels } from "@/hooks/useLevelLabels";
import AssignmentStepBadges from "@/components/teacher/AssignmentStepBadges";
import AssignmentProgressSummary from "@/components/teacher/AssignmentProgressSummary";

import {
  fetchAssignmentProgress,
  type AssignmentProgressMap,
} from "@/lib/assignmentProgress";
import { isAssignmentDone } from "@/lib/assignmentCompletion";
import {
  ASSIGNMENT_TRACK_LABEL,
  classifyAssignmentTrack,
} from "@/lib/assignmentTrack";
import { fetchMasterAvailability } from "@/lib/masterAvailability";
import {
  deriveTaskModeFromSteps,
  taskModeIncludesMemorize,
  type TaskMode,
} from "@/lib/taskMode";
import { notifyStudentsForNewAssignment } from "@/lib/assignmentNotifications";
import {
  formatAssignmentDueLabel,
  formatAssignmentRemaining,
  resolveDueAtEndOfDay,
} from "@/lib/assignmentDue";
import {
  MEM_DIRECTION_SETTING_LABEL,
  type MemDirectionSetting,
} from "@/lib/fetchMemSettings";
import { toIsoDate } from "@/lib/handoutResults";

interface AssignmentGroup {
  key: string;
  title: string;
  description: string | null;
  student_id: string | null;
  unit_id: string | null;
  unit_label: string | null;
  due_at: string | null;
  include_pre: boolean;
  include_analysis: boolean;
  include_translation: boolean;
  include_wordtest: boolean;
  task_mode: TaskMode | null;
  rows: AssignmentRow[];
  totalCount: number;
  doneCount: number;
  round_no: number | null;
}

type ListViewMode = "compact" | "cards" | "byStudent";
type ProgressFilter = "all" | "not_started" | "in_progress" | "almost_done";

const isStepDoneStatus = (status: string | undefined) =>
  status === "pass" || status === "done";

function mergeGroupProgress(
  g: AssignmentGroup,
  progressByAsg: Record<string, AssignmentProgressMap>,
  targetUserIds: string[],
): AssignmentProgressMap {
  const merged: AssignmentProgressMap = new Map();
  targetUserIds.forEach((uid) => {
    let allPre = true,
      allWt = true,
      allAn = true,
      allTr = true;
    let anyData = false;
    let preScoreSum = 0,
      preCnt = 0;
    let anScoreSum = 0,
      anCnt = 0;
    let wtScoreSum = 0,
      wtCnt = 0;
    g.rows.forEach((r) => {
      const p = progressByAsg[r.id]?.get(uid);
      if (!p) {
        allPre = allWt = allAn = allTr = false;
        return;
      }
      anyData = true;
      if (!isStepDoneStatus(p.pre.status)) allPre = false;
      else if (p.pre.score != null) {
        preScoreSum += p.pre.score;
        preCnt++;
      }
      if (!isStepDoneStatus(p.wordtest.status)) allWt = false;
      else if (p.wordtest.score != null) {
        wtScoreSum += p.wordtest.score;
        wtCnt++;
      }
      if (!isStepDoneStatus(p.analysis.status)) allAn = false;
      else if (p.analysis.score != null) {
        anScoreSum += p.analysis.score;
        anCnt++;
      }
      if (!isStepDoneStatus(p.translation.status)) allTr = false;
    });
    merged.set(uid, {
      pre: {
        status: anyData && allPre ? "done" : "missing",
        score: preCnt > 0 ? Math.round(preScoreSum / preCnt) : null,
      },
      analysis: {
        status: anyData && allAn ? "pass" : "missing",
        score: anCnt > 0 ? Math.round(anScoreSum / anCnt) : null,
      },
      translation: {
        status: anyData && allTr ? "done" : "missing",
        score: null,
      },
      wordtest: {
        status: anyData && allWt ? "pass" : "missing",
        score: wtCnt > 0 ? Math.round(wtScoreSum / wtCnt) : null,
      },
      mem: { status: "missing", score: null },
    });
  });
  return merged;
}

function groupProgressStats(
  g: AssignmentGroup,
  progress: AssignmentProgressMap,
  targetUserIds: string[],
): { pct: number; fullyDone: number; totalStudents: number; doneCells: number; totalCells: number } {
  const includeMem = taskModeIncludesMemorize(g.task_mode);
  const steps =
    (g.include_pre ? 1 : 0) +
    (g.include_analysis ? 1 : 0) +
    (g.include_translation ? 1 : 0) +
    (g.include_wordtest ? 1 : 0) +
    (includeMem ? 1 : 0);
  const totalStudents = targetUserIds.length;
  const totalCells = totalStudents * steps;
  let doneCells = 0;
  let fullyDone = 0;
  targetUserIds.forEach((uid) => {
    const p = progress.get(uid);
    let studentDone = 0;
    if (g.include_pre && isStepDoneStatus(p?.pre.status)) {
      doneCells++;
      studentDone++;
    }
    if (g.include_analysis && isStepDoneStatus(p?.analysis.status)) {
      doneCells++;
      studentDone++;
    }
    if (g.include_translation && isStepDoneStatus(p?.translation.status)) {
      doneCells++;
      studentDone++;
    }
    if (g.include_wordtest && isStepDoneStatus(p?.wordtest.status)) {
      doneCells++;
      studentDone++;
    }
    if (includeMem && isStepDoneStatus(p?.mem.status)) {
      doneCells++;
      studentDone++;
    }
    if (steps > 0 && studentDone === steps) fullyDone++;
  });
  return {
    pct: totalCells === 0 ? 0 : Math.round((doneCells / totalCells) * 100),
    fullyDone,
    totalStudents,
    doneCells,
    totalCells,
  };
}

interface AssignmentRow {
  id: string;
  teacher_id: string;
  student_id: string | null;
  title: string;
  description: string | null;
  sentence_id: string | null;
  unit_id?: string | null;
  due_at: string | null;
  created_at: string;
  include_pre: boolean;
  include_analysis: boolean;
  include_translation: boolean;
  include_wordtest: boolean;
  task_mode?: TaskMode | null;
  mem_direction?: MemDirectionSetting | null;
  round_no?: number | null;
}

type StepKey = "pre" | "analysis" | "translation" | "wordtest";

type AssignMode = "unit" | "sentence" | "book";

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
  includeMemorize: boolean;
  /** 빈 문자열 = 유닛 기본값 따름 */
  memDirection: MemDirectionSetting | "";
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
  includeMemorize: false,
  memDirection: "",
});

interface AssignmentsProps {
  /** "create" = 과제 출제 화면(기본), "box" = 과제함(목록) */
  viewMode?: "create" | "box";
}
const Assignments = ({ viewMode = "create" }: AssignmentsProps) => {
  const showCreate = viewMode === "create";
  const showBox = viewMode === "box";
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { display: levelDisplay } = useLevelLabels();
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
  /** unit_id → textbook_id (보충 배정 프리필용) */
  const [unitToTb, setUnitToTb] = useState<Record<string, string>>({});
  const [toppingUpKey, setToppingUpKey] = useState<string | null>(null);

  const studentNameMap = useMemo(() => {
    const m = new Map<string, string>();
    students.forEach((s) =>
      m.set(s.user_id, s.display_name ?? s.student_no ?? s.user_id.slice(0, 6)),
    );
    return m;
  }, [students]);

  // Create form
  const [form, setForm] = useState<FormState>(emptyForm());
  const [titleTouched, setTitleTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(showCreate);

  // 자동 제목: 사용자가 직접 입력한 적 없다면 선택 상태로부터 자동 생성
  useEffect(() => {
    if (titleTouched) return;
    const tb = textbooks.find((t) => t.id === form.selectedTbId);
    if (!tb) return;
    const levelLabel = levelDisplay(form.selectedLevel as LevelCode) || form.selectedLevel || tb.level;
    const base = `[${levelLabel}] ${tb.title}`;
    let auto = base;
    if (form.mode === "book") {
      auto = `${base} 전체`;
    } else {
      const unit = (unitsByTb[form.selectedTbId] ?? []).find(
        (u) => u.id === form.selectedUnitId,
      );
      if (unit) {
        const unitLabel = `${unit.unit_no}과${unit.title ? ` ${unit.title}` : ""}`;
        auto =
          form.mode === "sentence" && form.selectedPassageCode
            ? `${base} · ${unitLabel} · ${form.selectedPassageCode}`
            : `${base} · ${unitLabel}`;
      }
    }
    if (auto && auto !== form.title) {
      setForm((p) => ({ ...p, title: auto }));
    }
  }, [
    titleTouched,
    form.mode,
    form.selectedLevel,
    form.selectedTbId,
    form.selectedUnitId,
    form.selectedPassageCode,
    textbooks,
    unitsByTb,
    levelDisplay,
    form.title,
  ]);

  // 진행중 목록: 검색·필터·보기 모드 (과제함 기본 = 학생별 운영 뷰)
  const [listQuery, setListQuery] = useState("");
  const [filterStudentId, setFilterStudentId] = useState<string>("all");
  const [progressFilter, setProgressFilter] = useState<ProgressFilter>("all");
  const [listView, setListView] = useState<ListViewMode>("byStudent");
  const [keepOnlyOpen, setKeepOnlyOpen] = useState(false);
  const [keepStudentIds, setKeepStudentIds] = useState<string[]>([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [prefillApplied, setPrefillApplied] = useState(false);

  // Edit dialog
  const [editingRow, setEditingRow] = useState<AssignmentRow | null>(null);
  const [editForm, setEditForm] = useState<FormState>(emptyForm());
  const [updating, setUpdating] = useState(false);

  const load = async () => {
    // 과제함 모드에서만 assignments 목록을 로드한다.
    // 출제 화면에서는 목록/진도 계산을 완전히 건너뛰어 초기 로딩을 가볍게 유지.
    const studentsPromise = fetchAllStudents();
    const textbooksPromise = fetchAllTextbooks();
    const assignmentsPromise = showBox
      ? supabase.from("assignments").select("*").order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as AssignmentRow[] } as { data: AssignmentRow[] });
    const [studs, { data }, tbs] = await Promise.all([
      studentsPromise,
      assignmentsPromise,
      textbooksPromise,
    ]);
    setStudents(studs);
    setRows((data ?? []) as AssignmentRow[]);
    setTextbooks(tbs);
  };

  useEffect(() => {
    void load();
  }, [showBox]);

  // 과제함 URL: ?student= 로 학생 필터 프리셋
  useEffect(() => {
    if (!showBox) return;
    const sid = searchParams.get("student");
    if (sid) setFilterStudentId(sid);
    const view = searchParams.get("view");
    if (view === "compact" || view === "cards" || view === "byStudent") {
      setListView(view);
    }
  }, [showBox, searchParams]);

  // 출제 URL: 유닛 미배정 보충용 프리필 (?student=&unit=&tb=&level=&mode=unit)
  useEffect(() => {
    if (!showCreate || prefillApplied) return;
    const student = searchParams.get("student");
    const unit = searchParams.get("unit");
    const tb = searchParams.get("tb");
    const level = searchParams.get("level") as LevelCode | null;
    const mode = (searchParams.get("mode") as AssignMode | null) ?? "unit";
    if (!student && !unit && !tb) return;
    setPrefillApplied(true);
    setCreateOpen(true);
    setForm((p) => ({
      ...p,
      mode: mode === "sentence" || mode === "book" || mode === "unit" ? mode : "unit",
      studentIds: student ? [student] : p.studentIds,
      selectedLevel: level && LEVELS.some((l) => l.code === level) ? level : p.selectedLevel,
      selectedTbId: tb ?? p.selectedTbId,
      selectedUnitId: unit ?? p.selectedUnitId,
      selectedPassageCode: "",
    }));
    if (level) void ensureSeries(level);
    if (tb) {
      void ensureUnits(tb);
      const found = textbooks.find((t) => t.id === tb);
      if (found?.series_id) {
        setForm((p) => ({ ...p, selectedSeriesId: found.series_id }));
        void ensureTextbooks(found.series_id);
      }
    }
    if (unit) void ensurePassages(unit);
  }, [showCreate, searchParams, prefillApplied, textbooks]); // eslint-disable-line

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
      setUnitToTb((prev) => {
        const next = { ...prev };
        rows2.forEach((r) => {
          if (r.unit_id && r.textbook_id) next[r.unit_id] = r.textbook_id;
        });
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
            const m = await fetchAssignmentProgress(r.sentence_id!, targets, {
              assignmentId: r.id,
              roundNo: r.round_no ?? null,
            });
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

  // 그룹핑: (title|due_at|student|unit|created_at-분) — 부여할 때마다 별도 카드.
  const activeGroups = useMemo<AssignmentGroup[]>(() => {
    if (activeRows.length === 0) return [];
    const allIds = students.map((s) => s.user_id);
    const groupMap = new Map<string, AssignmentRow[]>();
    activeRows.forEach((r) => {
      const unitId = r.sentence_id ? codeToUnit[r.sentence_id] ?? null : null;
      const batchMinute = r.created_at ? r.created_at.slice(0, 16) : r.id;
      const groupKey = `${r.title}|${r.due_at}|${r.student_id ?? "__all__"}|${unitId ?? `noUnit:${r.sentence_id ?? r.id}`}|${batchMinute}`;
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
        task_mode: head.task_mode ?? null,
        rows: sorted,
        totalCount: sorted.length,
        doneCount,
        round_no: sorted.reduce<number | null>((m, r) => {
          const rn = (r as unknown as { round_no?: number | null }).round_no ?? null;
          if (rn == null) return m;
          return m == null ? rn : Math.max(m, rn);
        }, null),
      });
    });
    return out.sort((a, b) => {
      const am = Math.max(...a.rows.map((r) => new Date(r.created_at).getTime()));
      const bm = Math.max(...b.rows.map((r) => new Date(r.created_at).getTime()));
      return bm - am;
    });
  }, [activeRows, students, codeToUnit, unitLabelMap, progressByAsg]);

  const filteredGroups = useMemo(() => {
    const q = listQuery.trim().toLowerCase();
    const allIds = students.map((s) => s.user_id);
    return activeGroups.filter((g) => {
      if (filterStudentId !== "all") {
        if (g.student_id) {
          if (g.student_id !== filterStudentId) return false;
        } else if (!allIds.includes(filterStudentId)) {
          return false;
        }
      }
      if (q) {
        const name = g.student_id
          ? (studentNameMap.get(g.student_id) ?? "").toLowerCase()
          : "전체 학생";
        const hay = [
          g.title,
          g.description ?? "",
          g.unit_label ?? "",
          name,
          g.rows.map((r) => r.sentence_id ?? "").join(" "),
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (progressFilter !== "all") {
        const targets = g.student_id ? [g.student_id] : allIds;
        const merged = mergeGroupProgress(g, progressByAsg, targets);
        const { pct } = groupProgressStats(g, merged, targets);
        if (progressFilter === "not_started" && pct > 0) return false;
        if (progressFilter === "in_progress" && (pct <= 0 || pct >= 100)) return false;
        if (progressFilter === "almost_done" && pct < 75) return false;
      }
      return true;
    });
  }, [
    activeGroups,
    listQuery,
    filterStudentId,
    progressFilter,
    students,
    studentNameMap,
    progressByAsg,
  ]);

  const groupsByStudent = useMemo(() => {
    const allIds = students.map((s) => s.user_id);
    const summarize = (sid: string, groups: AssignmentGroup[], label: string) => {
      let pctSum = 0;
      groups.forEach((g) => {
        const targets =
          filterStudentId !== "all"
            ? [filterStudentId]
            : g.student_id
              ? [g.student_id]
              : allIds;
        const merged = mergeGroupProgress(g, progressByAsg, targets);
        pctSum += groupProgressStats(g, merged, targets).pct;
      });
      return {
        studentId: sid,
        label,
        groups,
        avgPct: groups.length ? Math.round(pctSum / groups.length) : 0,
      };
    };

    // 학생 1명 필터 시: 개인 과제 + 전체 과제(해당 학생 진도 기준)를 한 묶음으로
    if (filterStudentId !== "all") {
      return [
        summarize(
          filterStudentId,
          filteredGroups,
          studentNameMap.get(filterStudentId) ?? filterStudentId.slice(0, 8),
        ),
      ];
    }

    const map = new Map<string, AssignmentGroup[]>();
    filteredGroups.forEach((g) => {
      const key = g.student_id ?? "__all__";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(g);
    });
    return Array.from(map.entries())
      .map(([sid, groups]) =>
        summarize(
          sid,
          groups,
          sid === "__all__" ? "전체 학생" : studentNameMap.get(sid) ?? sid.slice(0, 8),
        ),
      )
      .sort((a, b) => a.label.localeCompare(b.label, "ko"));
  }, [filteredGroups, students, studentNameMap, progressByAsg, filterStudentId]);

  const validateForm = (f: FormState): string | null => {
    if (!f.title.trim()) return "제목은 필수입니다";
    if (f.mode === "sentence") {
      if (!f.selectedUnitId) return "유닛을 먼저 선택해주세요";
      if (!f.selectedPassageCode) return "출제할 문장을 선택해주세요";
    } else if (f.mode === "book") {
      if (!f.selectedTbId) return "책을 먼저 선택해주세요";
    } else {
      if (!f.selectedPassageCode) return "지문을 반드시 연결해야 과제를 생성할 수 있습니다";
    }
    const hasAnalysis =
      f.includePre || f.includeAnalysis || f.includeTranslation || f.includeWordtest;
    if (!f.includeMemorize && !hasAnalysis)
      return "학습 단계 또는 암기를 하나 이상 선택하세요";
    return null;
  };

  const handleCreate = async () => {
    const err = validateForm(form);
    if (err) {
      toast({ title: err, variant: "destructive" });
      return;
    }
    // 안전장치: 반드시 학생을 1명 이상 지정해야 함 (전체 배부 금지)
    if (form.studentIds.length === 0) {
      toast({
        title: "대상 학생을 1명 이상 선택하세요",
        description: "실수 방지를 위해 전체 배부 기능은 비활성화되어 있습니다.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      const teacherId = await getCurrentUserId();
      if (!teacherId) throw new Error("로그인이 필요합니다");
      const dueAtIso = resolveDueAtEndOfDay(form.dueDate);
      // 각 학생별로 1건씩 개별 과제 생성
      const targets: (string | null)[] = form.studentIds;

      // 출제 모드별 지문 코드 결정:
      // - unit    : 선택된 유닛의 모든 지문 자동 부여
      // - sentence : 사용자가 명시 선택한 단일 문장만 부여
      // - book    : 선택된 책의 모든 유닛의 모든 지문 자동 부여
      let codePairs: Array<{ code: string; unit_id: string | null }> = [];
      let unitCountForNotify = 0;
      if (form.mode === "sentence") {
        if (form.selectedPassageCode) {
          codePairs = [{ code: form.selectedPassageCode, unit_id: null }];
        }
      } else if (form.mode === "book") {
        const units =
          unitsByTb[form.selectedTbId] ??
          (await fetchUnitsByTextbook(form.selectedTbId));
        const perUnit = await Promise.all(
          units.map(async (u) => {
            const cached = passagesByUnit[u.id];
            const list = cached ?? (await fetchPassagesByUnit(u.id));
            return { unit: u, list };
          }),
        );
        for (const { unit, list } of perUnit
          .slice()
          .sort((a, b) => a.unit.unit_no - b.unit.unit_no)) {
          list
            .slice()
            .sort((a, b) => a.passage_no - b.passage_no)
            .forEach((p) => codePairs.push({ code: p.code, unit_id: unit.id }));
        }
        unitCountForNotify = units.length;
      } else {
        // 유닛 모드: 캐시가 비어 있어도 DB에서 지문을 가져와 전체 배정 (레이스로 1문장만 들어가는 사고 방지)
        const uid = form.selectedUnitId || null;
        if (!uid) {
          throw new Error("유닛을 선택해주세요");
        }
        let unitPassages = passagesByUnit[uid] ?? [];
        if (unitPassages.length === 0) {
          unitPassages = await fetchPassagesByUnit(uid);
          setPassagesByUnit((m) => ({ ...m, [uid]: unitPassages }));
        }
        if (unitPassages.length === 0) {
          throw new Error("이 유닛에 배정할 지문이 없습니다");
        }
        codePairs = unitPassages
          .slice()
          .sort((a, b) => a.passage_no - b.passage_no)
          .map((p) => ({ code: p.code, unit_id: uid }));
        unitCountForNotify = 1;
      }

      if (codePairs.length === 0) {
        throw new Error("부여할 지문을 찾을 수 없습니다");
      }
      const passageCodes = codePairs.map((c) => c.code);

      const taskMode = deriveTaskModeFromSteps(form);

      // 회독(Round) 계산: 같은 (학생, 문장)에 기존 과제가 있으면 다음 회독 부여 + 기존 진도 봉인
      const { planRoundsForNewAssignments, sealPreviousRounds } = await import(
        "@/lib/roundArchive"
      );
      const pairs = targets
        .filter((sid): sid is string => !!sid)
        .flatMap((sid) => passageCodes.map((code) => ({ student_id: sid, sentence_id: code })));
      const roundPlan = await planRoundsForNewAssignments(pairs);
      // 이전 회독 진도/승인/로그 봉인 먼저
      await sealPreviousRounds(Array.from(roundPlan.values()));

      const rowsToInsert = targets.flatMap((sid) =>
        codePairs.map(({ code, unit_id }) => {
          const plan = sid ? roundPlan.get(`${sid}::${code}`) : undefined;
          return {
            teacher_id: teacherId,
            student_id: sid,
            title: form.title.trim(),
            description: form.description.trim() || null,
            sentence_id: code,
            unit_id,
            task_mode: taskMode,
            due_at: dueAtIso,
            include_pre: form.includePre,
            include_analysis: form.includeAnalysis,
            include_translation: form.includeTranslation,
            include_wordtest: form.includeWordtest,
            mem_direction: form.includeMemorize && form.memDirection ? form.memDirection : null,
            round_no: plan?.next_round_no ?? 1,
          };
        }),
      );
      const { error } = await supabase.from("assignments").insert(
        rowsToInsert as never,
      );
      if (error) throw error;
      const studentMsg = `${form.studentIds.length}명`;
      const unitLabel =
        form.mode === "sentence"
          ? `문장 1개`
          : form.mode === "book"
          ? `책 전체 (유닛 ${unitCountForNotify}개 · 지문 ${passageCodes.length}개)`
          : `유닛 지문 ${passageCodes.length}개`;
      const notified = await notifyStudentsForNewAssignment({
        title: form.title.trim(),
        description: form.description.trim() || null,
        dueAt: form.dueDate ?? null,
        studentIds: form.studentIds,
        taskMode,
        passageCount: passageCodes.length,
        mode: form.mode,
        unitCount: unitCountForNotify,
      });
      toast({
        title: "✅ 과제가 생성되었습니다",
        description: `${studentMsg} × ${unitLabel} = ${rowsToInsert.length}건 부여됨${notified > 0 ? ` · 알림 ${notified}명` : ""}`,
      });
      const returnStudent = searchParams.get("returnStudent") ?? form.studentIds[0] ?? null;
      setForm(emptyForm());
      setTitleTouched(false);
      setPrefillApplied(false);
      if (showCreate) {
        const q = returnStudent
          ? `?student=${encodeURIComponent(returnStudent)}&view=byStudent`
          : "?view=byStudent";
        navigate(`/teacher/assignments/box${q}`);
      } else {
        void load();
      }
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

  /** 유닛 미배정 지문만 같은 설정으로 보충 배정 */
  const handleTopUpGroup = async (group: AssignmentGroup) => {
    if (!group.unit_id) {
      toast({ title: "유닛 정보가 없어 보충 배정할 수 없습니다", variant: "destructive" });
      return;
    }
    if (!group.student_id) {
      toast({
        title: "대상 학생이 지정된 과제만 보충 배정할 수 있습니다",
        variant: "destructive",
      });
      return;
    }
    setToppingUpKey(group.key);
    try {
      const teacherId = await getCurrentUserId();
      if (!teacherId) throw new Error("로그인이 필요합니다");
      let unitPassages = passagesByUnit[group.unit_id] ?? [];
      if (unitPassages.length === 0) {
        unitPassages = await fetchPassagesByUnit(group.unit_id);
        setPassagesByUnit((m) => ({ ...m, [group.unit_id!]: unitPassages }));
      }
      const assigned = new Set(
        group.rows.map((r) => r.sentence_id).filter((c): c is string => !!c),
      );
      const missing = unitPassages
        .slice()
        .sort((a, b) => a.passage_no - b.passage_no)
        .filter((p) => !assigned.has(p.code));
      if (missing.length === 0) {
        toast({ title: "이미 유닛 전체 지문이 배정되어 있습니다" });
        return;
      }
      const ok = window.confirm(
        `미배정 지문 ${missing.length}개를 같은 설정으로 보충 배정할까요?\n(현재 배정 ${assigned.size} / 유닛 ${unitPassages.length})`,
      );
      if (!ok) return;

      const head = group.rows[0];
      const taskMode =
        group.task_mode ??
        deriveTaskModeFromSteps({
          includePre: group.include_pre,
          includeAnalysis: group.include_analysis,
          includeTranslation: group.include_translation,
          includeWordtest: group.include_wordtest,
          includeMemorize: taskModeIncludesMemorize(group.task_mode),
        });
      const passageCodes = missing.map((p) => p.code);
      const { planRoundsForNewAssignments, sealPreviousRounds } = await import(
        "@/lib/roundArchive"
      );
      const pairs = passageCodes.map((code) => ({
        student_id: group.student_id!,
        sentence_id: code,
      }));
      const roundPlan = await planRoundsForNewAssignments(pairs);
      await sealPreviousRounds(Array.from(roundPlan.values()));

      const rowsToInsert = missing.map((p) => {
        const plan = roundPlan.get(`${group.student_id}::${p.code}`);
        return {
          teacher_id: teacherId,
          student_id: group.student_id,
          title: group.title,
          description: group.description,
          sentence_id: p.code,
          unit_id: group.unit_id,
          task_mode: taskMode,
          due_at: group.due_at,
          include_pre: group.include_pre,
          include_analysis: group.include_analysis,
          include_translation: group.include_translation,
          include_wordtest: group.include_wordtest,
          mem_direction: head.mem_direction ?? null,
          round_no: plan?.next_round_no ?? group.round_no ?? 1,
        };
      });
      const { error } = await supabase.from("assignments").insert(rowsToInsert as never);
      if (error) throw error;
      toast({
        title: "✅ 미배정 지문 보충 완료",
        description: `${missing.length}개 추가 · 배정 ${assigned.size + missing.length}/${unitPassages.length}`,
      });
      void load();
    } catch (e) {
      toast({ title: "보충 배정 실패", description: String(e), variant: "destructive" });
    } finally {
      setToppingUpKey(null);
    }
  };

  const openTopUpPrefill = (group: AssignmentGroup) => {
    if (!group.unit_id || !group.student_id) return;
    const tbId = unitToTb[group.unit_id];
    const tb = tbId ? textbooks.find((t) => t.id === tbId) : undefined;
    const params = new URLSearchParams({
      mode: "unit",
      student: group.student_id,
      unit: group.unit_id,
      returnStudent: group.student_id,
    });
    if (tbId) params.set("tb", tbId);
    if (tb?.level) params.set("level", tb.level);
    navigate(`/teacher/assignments?${params.toString()}`);
  };

  /**
   * 현재 필터/검색 결과에서 선택한 학생만 남기고 나머지 과제 행 삭제.
   * 「전체 학생」행은 삭제 후 남길 학생에게 동일 내용으로 개인 과제 생성.
   */
  const handleKeepOnlyStudents = async () => {
    if (keepStudentIds.length === 0) {
      toast({ title: "남길 학생을 1명 이상 선택하세요", variant: "destructive" });
      return;
    }
    const keepSet = new Set(keepStudentIds);
    const keepNames = keepStudentIds
      .map((id) => studentNameMap.get(id) ?? id.slice(0, 6))
      .join(", ");
    const allRows = filteredGroups.flatMap((g) => g.rows);
    if (allRows.length === 0) {
      toast({ title: "삭제할 검색 결과가 없습니다", variant: "destructive" });
      return;
    }
    const toDelete = allRows.filter(
      (r) => r.student_id != null && !keepSet.has(r.student_id),
    );
    const wholeClass = allRows.filter((r) => r.student_id == null);
    const ok = window.confirm(
      `현재 목록 ${filteredGroups.length}건 중\n` +
        `남길 학생: ${keepNames}\n` +
        `삭제(다른 학생): ${toDelete.length}행\n` +
        `전체학생→개인 전환: ${wholeClass.length}행\n\n` +
        `계속할까요?`,
    );
    if (!ok) return;

    setBulkDeleting(true);
    try {
      // 1) 전체 학생 행 → 남길 학생용으로 복제
      if (wholeClass.length > 0) {
        const inserts = keepStudentIds.flatMap((sid) =>
          wholeClass.map((r) => ({
            teacher_id: r.teacher_id,
            student_id: sid,
            title: r.title,
            description: r.description,
            sentence_id: r.sentence_id,
            unit_id: r.unit_id ?? null,
            task_mode: r.task_mode ?? null,
            due_at: r.due_at,
            include_pre: r.include_pre,
            include_analysis: r.include_analysis,
            include_translation: r.include_translation,
            include_wordtest: r.include_wordtest,
            mem_direction: r.mem_direction ?? null,
          })),
        );
        // 이미 동일 개인 과제가 있으면 스킵하기 위해 기존 keep 행 키 수집
        const existingKeys = new Set(
          allRows
            .filter((r) => r.student_id && keepSet.has(r.student_id))
            .map((r) => `${r.student_id}|${r.title}|${r.sentence_id ?? ""}`),
        );
        const filteredInserts = inserts.filter(
          (row) =>
            !existingKeys.has(
              `${row.student_id}|${row.title}|${row.sentence_id ?? ""}`,
            ),
        );
        if (filteredInserts.length > 0) {
          const { error: insErr } = await supabase
            .from("assignments")
            .insert(filteredInserts as never);
          if (insErr) throw insErr;
        }
        const wholeIds = wholeClass.map((r) => r.id);
        const { error: delWhole } = await supabase
          .from("assignments")
          .delete()
          .in("id", wholeIds);
        if (delWhole) throw delWhole;
      }

      // 2) 남길 학생 외 개인 과제 삭제
      if (toDelete.length > 0) {
        const ids = toDelete.map((r) => r.id);
        // supabase .in() 한도 대비 청크
        for (let i = 0; i < ids.length; i += 200) {
          const chunk = ids.slice(i, i + 200);
          const { error } = await supabase.from("assignments").delete().in("id", chunk);
          if (error) throw error;
        }
      }

      toast({
        title: "✅ 정리 완료",
        description: `${keepNames}만 남기고 나머지 과제를 삭제했습니다.`,
      });
      setKeepOnlyOpen(false);
      setKeepStudentIds([]);
      void load();
    } catch (e) {
      toast({
        title: "일괄 삭제 실패",
        description: String(e),
        variant: "destructive",
      });
    } finally {
      setBulkDeleting(false);
    }
  };

  /** 그룹 전체 마감일 +1주 일괄 연장 */
  const handleExtendGroupWeek = async (group: AssignmentGroup) => {
    const cur = group.due_at ? new Date(group.due_at) : new Date();
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
    const cur = row.due_at ? new Date(row.due_at) : new Date();
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
      dueDate: row.due_at ? new Date(row.due_at) : undefined,
      includePre: row.include_pre,
      includeAnalysis: row.include_analysis,
      includeTranslation: row.include_translation,
      includeWordtest: row.include_wordtest,
      includeMemorize: taskModeIncludesMemorize(row.task_mode),
      memDirection: row.mem_direction ?? "",
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
      const dueAtIso = resolveDueAtEndOfDay(editForm.dueDate);
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

      const taskMode = deriveTaskModeFromSteps(editForm);

      // 1) 그룹 전체에 메타 적용 (sentence_id는 건드리지 않음 — 각 행 보존)
      const { error: metaErr } = await supabase
        .from("assignments")
        .update({
          title: editForm.title.trim(),
          student_id: editForm.studentIds.length === 0 ? null : editForm.studentIds[0],
          description: editForm.description.trim() || null,
          due_at: dueAtIso,
          include_pre: editForm.includePre,
          include_analysis: editForm.includeAnalysis,
          include_translation: editForm.includeTranslation,
          include_wordtest: editForm.includeWordtest,
          task_mode: taskMode,
          mem_direction:
            editForm.includeMemorize && editForm.memDirection
              ? editForm.memDirection
              : null,
        } as never)
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

  const remaining = (iso: string | null) => formatAssignmentRemaining(iso);

  const renderDueDatePicker = (f: FormState, setter: typeof setForm) => (
    <div className="space-y-1.5">
      <Label>안내 마감일 (선택 · 학습 진행에 영향 없음)</Label>
      <div className="flex flex-wrap items-center gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className={cn("justify-start text-left font-normal", !f.dueDate && "text-muted-foreground")}>
              <CalendarIcon className="mr-2 size-4" />
              {f.dueDate ? format(f.dueDate, "yyyy-MM-dd") : "무기한 (선택 안 함)"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={f.dueDate} onSelect={(d) => setter((p) => ({ ...p, dueDate: d }))} initialFocus className={cn("p-3 pointer-events-auto")} />
          </PopoverContent>
        </Popover>
        {f.dueDate && (
          <Button type="button" variant="ghost" size="sm" className="h-9 text-xs" onClick={() => setter((p) => ({ ...p, dueDate: undefined }))}>
            무기한
          </Button>
        )}
      </div>
    </div>
  );

  const applyPreset = (
    setter: typeof setForm,
    preset: "all" | "analysis" | "wordtest" | "memorize",
  ) => {
    if (preset === "memorize") {
      setter((prev) => ({
        ...prev,
        includePre: false,
        includeAnalysis: false,
        includeTranslation: false,
        includeWordtest: false,
        includeMemorize: true,
      }));
      return;
    }
    setter((prev) => ({
      ...prev,
      includePre: true,
      includeAnalysis: preset === "all" || preset === "analysis",
      includeTranslation: preset === "all",
      includeWordtest: preset === "all" || preset === "wordtest",
      includeMemorize: false,
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
          <Button type="button" size="sm" variant="ghost" className="h-6 text-[11px] px-2" onClick={() => applyPreset(setter, "memorize")}>
            암기만
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
            ["includeMemorize", "암기"],
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

  const renderMemDirectionPicker = (f: FormState, setter: typeof setForm) => {
    if (!f.includeMemorize) return null;
    return (
      <div className="space-y-1.5 mt-3">
        <Label>암기 방향 (선택)</Label>
        <Select
          value={f.memDirection || "__inherit__"}
          onValueChange={(v) =>
            setter((prev) => ({
              ...prev,
              memDirection: v === "__inherit__" ? "" : (v as MemDirectionSetting),
            }))
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="유닛 기본값 따름" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__inherit__">유닛 기본값 따름</SelectItem>
            {(Object.keys(MEM_DIRECTION_SETTING_LABEL) as MemDirectionSetting[]).map((d) => (
              <SelectItem key={d} value={d}>
                {MEM_DIRECTION_SETTING_LABEL[d]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[11px] text-muted-foreground">
          과제에 설정한 방향이 있으면 유닛·지문 기본 방향을 덮어씁니다. (마감일과 무관)
        </p>
      </div>
    );
  };

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
                  [{l.code}] {levelDisplay(l.code)}
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
          <Label>유닛 {f.mode !== "book" && <span className="text-destructive">*</span>}{f.mode === "book" && <span className="text-[10px] font-normal text-muted-foreground ml-1">(책 전체 모드에서는 선택 불필요)</span>}</Label>
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

  const renderGroupActions = (g: AssignmentGroup, head: AssignmentRow) => (
    <div className="flex items-center gap-0.5 shrink-0">
      <Button
        size="sm"
        variant="ghost"
        className="h-7 text-[11px] px-2 text-primary"
        onClick={() => handleExtendGroupWeek(g)}
        title="안내 마감일 +1주"
      >
        <Plus className="size-3" />
        1주
      </Button>
      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => openEdit(head)} title="수정">
        <Pencil className="size-3.5" />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 px-2 text-destructive"
        onClick={() => handleDeleteGroup(g)}
        title="삭제"
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );

  const targetIdsForGroup = (g: AssignmentGroup) => {
    if (g.student_id) return [g.student_id];
    if (filterStudentId !== "all") return [filterStudentId];
    return students.map((s) => s.user_id);
  };

  const renderCompactRow = (g: AssignmentGroup) => {
    const head = g.rows[0];
    const rem = remaining(g.due_at);
    const allTargetIds = targetIdsForGroup(g);
    const doneCountForTarget = g.rows.filter((r) =>
      isAssignmentDone(r, progressByAsg[r.id], allTargetIds),
    ).length;
    const unitTotal = g.unit_id ? (passagesByUnit[g.unit_id]?.length ?? 0) : 0;
    const assignedCount = g.totalCount;
    const coverageGap = unitTotal > 0 && assignedCount < unitTotal;
    const track = classifyAssignmentTrack({
      title: g.title,
      groupSize: g.totalCount,
    });
    const nextRow = g.rows.find(
      (r) => !isAssignmentDone(r, progressByAsg[r.id], allTargetIds),
    );
    const nextCode = nextRow?.sentence_id ?? null;
    // 진도율은 단계-셀 기반으로 계산 (부분 진행도 반영)
    const includeMem = taskModeIncludesMemorize(g.task_mode);
    const stepsPer =
      (g.include_pre ? 1 : 0) +
      (g.include_analysis ? 1 : 0) +
      (g.include_translation ? 1 : 0) +
      (g.include_wordtest ? 1 : 0) +
      (includeMem ? 1 : 0);
    const totalCells = g.rows.length * allTargetIds.length * stepsPer;
    let doneCells = 0;
    g.rows.forEach((r) => {
      const pm = progressByAsg[r.id];
      allTargetIds.forEach((uid) => {
        const p = pm?.get(uid);
        if (g.include_pre && isStepDoneStatus(p?.pre.status)) doneCells++;
        if (g.include_analysis && isStepDoneStatus(p?.analysis.status)) doneCells++;
        if (g.include_translation && isStepDoneStatus(p?.translation.status)) doneCells++;
        if (g.include_wordtest && isStepDoneStatus(p?.wordtest.status)) doneCells++;
        if (includeMem && isStepDoneStatus(p?.mem.status)) doneCells++;
      });
    });
    const pct = totalCells > 0 ? Math.round((doneCells / totalCells) * 100) : 0;
    const stats = { pct };
    const roundLabel = g.round_no && g.round_no > 1 ? ` · ${g.round_no}회독` : "";
    const label = g.unit_label
      ? `${g.unit_label}${roundLabel}`
      : head.sentence_id
        ? `${codeLabelMap.get(head.sentence_id) ?? head.sentence_id}${roundLabel}`
        : "—";
    return (
      <tr key={g.key} className="border-b border-border/60 hover:bg-muted/40">
        <td className="py-2 px-2 align-top">
          <div className="font-bold text-sm leading-tight flex items-center gap-1.5 flex-wrap">
            <span
              className={cn(
                "inline-flex items-center text-[10px] font-extrabold px-1.5 py-0.5 rounded",
                track === "naeshin"
                  ? "bg-sky-500/15 text-sky-800 dark:text-sky-300"
                  : "bg-amber-500/15 text-amber-800 dark:text-amber-300",
              )}
            >
              {ASSIGNMENT_TRACK_LABEL[track]}
            </span>
            {g.title}
            {g.round_no && g.round_no > 1 && (
              <span className="px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-700 dark:text-violet-300 text-[10px] font-extrabold align-middle">
                {g.round_no}회독
              </span>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{label}</div>
          {nextCode && (
            <div className="text-[11px] text-muted-foreground mt-0.5">
              다음 문장 <span className="font-mono font-semibold text-foreground/80">{nextCode}</span>
            </div>
          )}
          {coverageGap && (
            <div className="mt-1.5 space-y-1">
              <div className="flex items-start gap-1 text-[11px] text-amber-800 dark:text-amber-300 font-semibold">
                <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
                <span>
                  유닛 미배정 지문 있음 · 배정 {assignedCount} / 유닛 전체 {unitTotal}
                  {assignedCount <= 2 && unitTotal >= 5
                    ? " (예: 나예솔 6과처럼 2지문만 들어간 경우 → 유닛 전체 재배정/보충)"
                    : ""}
                </span>
              </div>
              <div className="flex flex-wrap gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-6 text-[10px] px-2 border-amber-500/40 text-amber-800 dark:text-amber-300"
                  disabled={toppingUpKey === g.key || !g.student_id}
                  onClick={() => void handleTopUpGroup(g)}
                >
                  {toppingUpKey === g.key ? "배정 중…" : `나머지 ${unitTotal - assignedCount}지문 보충`}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 text-[10px] px-2"
                  disabled={!g.student_id || !g.unit_id}
                  onClick={() => openTopUpPrefill(g)}
                >
                  출제 화면에서 유닛 재배정
                </Button>
              </div>
            </div>
          )}
        </td>
        <td className="py-2 px-2 align-top text-sm whitespace-nowrap">
          {studentName(g.student_id)}
        </td>
        <td className="py-2 px-2 align-top min-w-[8rem]">
          <div className="flex items-center gap-2 text-[11px] font-bold flex-wrap">
            <span
              className={cn(
                stats.pct >= 75
                  ? "text-emerald-600"
                  : stats.pct > 0
                    ? "text-primary"
                    : "text-muted-foreground",
              )}
            >
              {stats.pct}%
            </span>
            <span className="text-muted-foreground font-normal">
              배정 {assignedCount}
              {unitTotal > 0 ? ` / 유닛 ${unitTotal}` : ""}
              {" · "}완료 {doneCountForTarget}/{assignedCount}
            </span>
            {stepsPer > 0 && totalCells > 0 && (
              <span className="text-muted-foreground font-normal">
                · 단계 {doneCells}/{totalCells}
              </span>
            )}
          </div>
          <div className="h-1.5 mt-1 w-full max-w-[9rem] rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                "h-full",
                stats.pct >= 75 ? "bg-emerald-500" : stats.pct > 0 ? "bg-primary" : "bg-muted-foreground/30",
              )}
              style={{ width: `${stats.pct}%` }}
            />
          </div>
        </td>
        <td className="py-2 px-2 align-top text-[11px] text-muted-foreground whitespace-nowrap">
          {formatAssignmentDueLabel(g.due_at)}
          <div className={cn("font-medium", rem.urgent ? "text-amber-700" : "")}>{rem.text}</div>
        </td>
        <td className="py-2 px-1 align-top">{renderGroupActions(g, head)}</td>
      </tr>
    );
  };

  const renderCardRow = (g: AssignmentGroup) => {
    const rem = remaining(g.due_at);
    const head = g.rows[0];
    const missingSentence = !head.sentence_id;
    const unitTotal = g.unit_id ? (passagesByUnit[g.unit_id]?.length ?? 0) : 0;
    const coverageGap = unitTotal > 0 && g.totalCount < unitTotal;
    const track = classifyAssignmentTrack({
      title: g.title,
      groupSize: g.totalCount,
    });
    const label = g.unit_label
      ? `${g.unit_label} · 배정 ${g.totalCount}${unitTotal > 0 ? ` / 유닛 ${unitTotal}` : ""}`
      : head.sentence_id
        ? (codeLabelMap.get(head.sentence_id) ?? head.sentence_id)
        : null;
    const allTargetIds = targetIdsForGroup(g);
    const mergedProgress = mergeGroupProgress(g, progressByAsg, allTargetIds);
    return (
      <div
        key={g.key}
        className={cn(
          "p-3 rounded-lg border-2 flex items-start justify-between gap-3",
          missingSentence || coverageGap
            ? "border-amber-500/50 bg-amber-50/30 dark:bg-amber-500/5"
            : rem.urgent
              ? "border-destructive/40 bg-destructive/5"
              : "border-border",
        )}
      >
        <div className="space-y-1.5 min-w-0 flex-1">
          <div className="font-bold text-foreground flex items-center gap-2 flex-wrap">
            <span
              className={cn(
                "inline-flex items-center text-[10px] font-extrabold px-1.5 py-0.5 rounded",
                track === "naeshin"
                  ? "bg-sky-500/15 text-sky-800 dark:text-sky-300"
                  : "bg-amber-500/15 text-amber-800 dark:text-amber-300",
              )}
            >
              {ASSIGNMENT_TRACK_LABEL[track]}
            </span>
            {g.title}
            <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-extrabold">
              배정 {g.totalCount}
              {unitTotal > 0 ? ` / 유닛 ${unitTotal}` : "지문"}
            </span>
            {coverageGap && (
              <span className="px-1.5 py-0.5 rounded bg-amber-500 text-white text-[10px] font-extrabold">
                미배정 {unitTotal - g.totalCount}
              </span>
            )}
            {missingSentence && (
              <span className="px-1.5 py-0.5 rounded bg-amber-500 text-white text-[10px] font-extrabold">
                ⚠ 지문 미연결
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground flex flex-wrap gap-2">
            <span>대상: {studentName(g.student_id)}</span>
            <span>· 안내 마감: {formatAssignmentDueLabel(g.due_at)}</span>
            <span className={cn("font-bold", rem.urgent ? "text-destructive" : "text-primary")}>
              · {rem.text}
            </span>
            {label && <span>· {label}</span>}
          </div>
          {coverageGap && (
            <div className="flex flex-wrap gap-1 pt-0.5">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-[11px] border-amber-500/40"
                disabled={toppingUpKey === g.key || !g.student_id}
                onClick={() => void handleTopUpGroup(g)}
              >
                {toppingUpKey === g.key ? "배정 중…" : `나머지 ${unitTotal - g.totalCount}지문 보충`}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 text-[11px]"
                disabled={!g.student_id || !g.unit_id}
                onClick={() => openTopUpPrefill(g)}
              >
                출제에서 유닛 재배정
              </Button>
            </div>
          )}
          <AssignmentStepBadges
            includePre={g.include_pre}
            includeAnalysis={g.include_analysis}
            includeTranslation={g.include_translation}
            includeWordtest={g.include_wordtest}
            includeMemorize={taskModeIncludesMemorize(g.task_mode)}
            progress={mergedProgress}
            studentNameMap={studentNameMap}
            targetUserIds={allTargetIds}
          />
          <AssignmentProgressSummary
            progress={mergedProgress}
            includePre={g.include_pre}
            includeAnalysis={g.include_analysis}
            includeTranslation={g.include_translation}
            includeWordtest={g.include_wordtest}
            includeMemorize={taskModeIncludesMemorize(g.task_mode)}
            targetUserIds={allTargetIds}
            className="pt-1"
          />
          {g.description && <p className="text-xs text-foreground/80 mt-1">{g.description}</p>}
        </div>
        {renderGroupActions(g, head)}
      </div>
    );
  };

  return (
    <TeacherLayout>
      <div className="p-6 max-w-6xl mx-auto space-y-6 font-kr">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ClipboardList className="size-6 text-primary" />
              {showBox ? "과제함" : "과제출제"}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {showBox
                ? "학생별로 배정·진도·유닛 커버리지를 확인하고, 미배정 지문을 보충합니다."
                : "새 과제를 출제합니다. 유닛 전체 배정이 기본이며, 진행중 과제는 [과제함]에서 확인하세요."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {showCreate ? (
              <Button asChild size="sm" variant="outline" className="h-8 text-xs font-bold gap-1">
                <Link to="/teacher/assignments/box">
                  <ClipboardList className="size-3.5" />
                  과제함
                </Link>
              </Button>
            ) : (
              <Button asChild size="sm" variant="default" className="h-8 text-xs font-bold gap-1">
                <Link to="/teacher/assignments">
                  <Plus className="size-3.5" />
                  새 과제 출제
                </Link>
              </Button>
            )}
            <Button asChild size="sm" variant="outline" className="h-8 text-xs font-bold gap-1">
              <Link to="/teacher/assignments/past">
                <ClipboardList className="size-3.5" />
                완료 과제함
              </Link>
            </Button>
          </div>
        </div>

        {showCreate && (
        <Card className="p-4 space-y-3">
          <button
            type="button"
            className="w-full flex items-center justify-between text-left"
            onClick={() => setCreateOpen((v) => !v)}
          >
            <h2 className="text-sm font-bold uppercase tracking-wider text-primary">
              새 과제 생성
            </h2>
            {createOpen ? (
              <ChevronUp className="size-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="size-4 text-muted-foreground" />
            )}
          </button>
          {createOpen && (
          <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>제목 *</Label>
              <Input value={form.title} onChange={(e) => { setTitleTouched(true); setForm((p) => ({ ...p, title: e.target.value })); }} placeholder="책·유닛 선택 시 자동 생성 (직접 수정 가능)" />
            </div>
            <div className="space-y-1.5">
              <Label>대상 학생 * (반드시 1명 이상 선택)</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-between text-left font-normal"
                  >
                    <span className="truncate">
                      {form.studentIds.length === 0
                        ? "학생을 선택하세요"
                        : `${form.studentIds.length}명 선택됨`}
                    </span>
                    <CalendarIcon className="ml-2 size-4 opacity-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-2 max-h-72 overflow-y-auto bg-popover" align="start">
                  <div className="flex items-center justify-between pb-2 mb-2 border-b">
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:underline"
                      onClick={() => setForm((p) => ({ ...p, studentIds: [] }))}
                    >
                      선택 해제
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
                    {(() => {
                      const sortedStudents = sortStudents(students);
                      let lastClass: string | null | undefined = undefined;
                      return sortedStudents.map((s) => {
                        const checked = form.studentIds.includes(s.user_id);
                        const cls = s.orbit_class_name ?? null;
                        const showHeader = cls !== lastClass;
                        lastClass = cls;
                        return (
                          <div key={s.user_id}>
                            {showHeader && (
                              <div className="px-2 pt-2 pb-1 text-[10px] font-bold text-primary/70 uppercase tracking-wide">
                                {cls ?? "반 미배정"}
                              </div>
                            )}
                            <label className="flex items-stretch rounded hover:bg-muted cursor-pointer text-sm overflow-x-auto">
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
                                  <span className="text-xs text-muted-foreground">
                                    ({s.student_no}
                                    {s.actual_grade ? ` · ${s.actual_grade}` : ""})
                                  </span>
                                </span>
                              </div>
                            </label>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1.5">
              {renderDueDatePicker(form, setForm)}
            </div>
            <div className="sm:col-span-2">
              {renderStepCheckboxes(form, setForm)}
              {renderMemDirectionPicker(form, setForm)}
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
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <RadioGroupItem value="book" id="mode-book" />
                  <span className="text-sm font-medium">책 전체</span>
                  <span className="text-[10px] text-muted-foreground">(모든 유닛·지문 일괄 부여)</span>
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
          </>
          )}
        </Card>
        )}

        {showBox && (<>
        <Card className="p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h2 className="text-sm font-bold uppercase tracking-wider text-primary">
              진행중 과제{" "}
              <span className="text-foreground">
                {filteredGroups.length}
                {filteredGroups.length !== activeGroups.length && (
                  <span className="text-muted-foreground font-normal">
                    {" "}
                    / 전체 {activeGroups.length}
                  </span>
                )}
              </span>
            </h2>
            <div className="flex items-center gap-1 rounded-md border p-0.5">
              {(
                [
                  ["byStudent", Users, "학생별"],
                  ["compact", LayoutList, "목록"],
                  ["cards", Rows3, "카드"],
                ] as const
              ).map(([mode, Icon, label]) => (
                <Button
                  key={mode}
                  type="button"
                  size="sm"
                  variant={listView === mode ? "default" : "ghost"}
                  className="h-7 px-2 text-[11px] gap-1"
                  onClick={() => setListView(mode)}
                >
                  <Icon className="size-3.5" />
                  {label}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="relative sm:col-span-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                value={listQuery}
                onChange={(e) => setListQuery(e.target.value)}
                placeholder="제목·학생·유닛 검색"
                className="pl-8 h-9"
              />
            </div>
            <Select value={filterStudentId} onValueChange={setFilterStudentId}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="학생 선택" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 학생</SelectItem>
                {sortStudents(students).map((s) => (
                  <SelectItem key={s.user_id} value={s.user_id}>
                    {s.orbit_class_name ? `[${s.orbit_class_name}] ` : ""}
                    {s.display_name ?? s.student_no} ({s.student_no})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={progressFilter}
              onValueChange={(v) => setProgressFilter(v as ProgressFilter)}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="진도 필터" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">진도 전체</SelectItem>
                <SelectItem value="not_started">미시작 (0%)</SelectItem>
                <SelectItem value="in_progress">진행중 (1~99%)</SelectItem>
                <SelectItem value="almost_done">거의 완료 (75%+)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {filteredGroups.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="destructive"
                className="h-8 text-xs"
                onClick={() => {
                  setKeepStudentIds([]);
                  setKeepOnlyOpen(true);
                }}
              >
                <Trash2 className="size-3.5 mr-1" />
                특정 학생만 남기고 삭제…
              </Button>
              <span className="text-[11px] text-muted-foreground">
                예: 검색창에 「김성연 1과」 입력 → 김서윤·김나연만 선택 → 나머지 일괄 삭제
              </span>
            </div>
          )}

          {activeGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">진행중인 과제가 없습니다.</p>
          ) : filteredGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              검색·필터 결과가 없습니다. 조건을 바꿔 보세요.
            </p>
          ) : (
            <>
          {filteredGroups.some((g) => {
            const unitTotal = g.unit_id ? (passagesByUnit[g.unit_id]?.length ?? 0) : 0;
            return unitTotal > 0 && g.totalCount < unitTotal;
          }) && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-900 dark:text-amber-200 space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="size-3.5" />
                유닛 미배정 지문이 있는 과제가 있습니다
              </div>
              <p className="leading-relaxed">
                예: 나예솔 6과처럼 배정이 2지문만 보이면 「나머지 지문 보충」으로 유닛 전체를 맞춘 뒤,
                학생 홈 <b>학습 과제</b>에서 이어하기·지문 수가 맞는지 확인하세요.
              </p>
            </div>
          )}
          {listView === "compact" ? (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-left min-w-[40rem]">
                <thead className="bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="py-2 px-2 font-bold">과제 / 출제</th>
                    <th className="py-2 px-2 font-bold">학생</th>
                    <th className="py-2 px-2 font-bold">진도</th>
                    <th className="py-2 px-2 font-bold">안내 마감</th>
                    <th className="py-2 px-2 font-bold w-24">관리</th>
                  </tr>
                </thead>
                <tbody>{filteredGroups.map((g) => renderCompactRow(g))}</tbody>
              </table>
            </div>
          ) : listView === "byStudent" ? (
            <div className="space-y-3">
              {groupsByStudent.map((bucket) => {
                const resultsHref =
                  bucket.studentId !== "__all__"
                    ? `/teacher/results?student=${encodeURIComponent(bucket.studentId)}&date=${toIsoDate(new Date())}`
                    : "/teacher/results";
                const coverageWarnCount = bucket.groups.filter((g) => {
                  const unitTotal = g.unit_id
                    ? (passagesByUnit[g.unit_id]?.length ?? 0)
                    : 0;
                  return unitTotal > 0 && g.totalCount < unitTotal;
                }).length;
                return (
                <div key={bucket.studentId} className="rounded-lg border overflow-hidden">
                  <div className="flex items-center justify-between gap-2 px-3 py-2 bg-muted/40 border-b flex-wrap">
                    <div className="font-bold text-sm flex items-center gap-2 flex-wrap">
                      <Users className="size-3.5 text-primary" />
                      {bucket.label}
                      <span className="text-[11px] font-normal text-muted-foreground">
                        과제 {bucket.groups.length}건
                      </span>
                      {coverageWarnCount > 0 && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-800 dark:text-amber-300">
                          <AlertTriangle className="size-3" />
                          미배정 유닛 {coverageWarnCount}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "text-xs font-extrabold",
                          bucket.avgPct >= 75
                            ? "text-emerald-600"
                            : bucket.avgPct > 0
                              ? "text-primary"
                              : "text-muted-foreground",
                        )}
                      >
                        평균 진도 {bucket.avgPct}%
                      </span>
                      {bucket.studentId !== "__all__" && (
                        <Button asChild size="sm" variant="outline" className="h-7 text-[11px] gap-1">
                          <Link to={resultsHref}>
                            <ExternalLink className="size-3" />
                            학습결과
                          </Link>
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left min-w-[36rem]">
                      <tbody>
                        {bucket.groups.map((g) => renderCompactRow(g))}
                      </tbody>
                    </table>
                  </div>
                </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-2">{filteredGroups.map((g) => renderCardRow(g))}</div>
          )}
            </>
          )}
        </Card>

        {/* 특정 학생만 남기고 삭제 */}
        <Dialog open={keepOnlyOpen} onOpenChange={(o) => !o && setKeepOnlyOpen(false)}>
          <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>특정 학생만 남기고 삭제</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              지금 목록에 보이는 과제({filteredGroups.length}건) 중, 선택한 학생의 과제만 남기고
              나머지는 삭제합니다. 「전체 학생」 과제는 선택한 학생 개인 과제로 바뀝니다.
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => {
                  const prefer = students.filter((s) =>
                    ["김서윤", "김나연"].includes(s.display_name ?? ""),
                  );
                  if (prefer.length > 0) {
                    setKeepStudentIds(prefer.map((s) => s.user_id));
                  }
                }}
              >
                김서윤·김나연 빠른 선택
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => setKeepStudentIds([])}
              >
                선택 해제
              </Button>
            </div>
            <div className="max-h-64 overflow-y-auto space-y-1 border rounded-md p-2">
              {students
                .slice()
                .sort((a, b) =>
                  (a.display_name ?? a.student_no).localeCompare(
                    b.display_name ?? b.student_no,
                    "ko",
                  ),
                )
                .map((s) => {
                  const checked = keepStudentIds.includes(s.user_id);
                  return (
                    <label
                      key={s.user_id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) =>
                          setKeepStudentIds((prev) =>
                            v
                              ? [...prev, s.user_id]
                              : prev.filter((id) => id !== s.user_id),
                          )
                        }
                      />
                      <span>
                        {s.display_name ?? s.student_no}{" "}
                        <span className="text-xs text-muted-foreground">({s.student_no})</span>
                      </span>
                    </label>
                  );
                })}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setKeepOnlyOpen(false)} disabled={bulkDeleting}>
                취소
              </Button>
              <Button
                variant="destructive"
                onClick={() => void handleKeepOnlyStudents()}
                disabled={bulkDeleting || keepStudentIds.length === 0}
              >
                {bulkDeleting ? "처리 중…" : `${keepStudentIds.length}명만 남기고 삭제`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

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
              <div>{renderDueDatePicker(editForm, setEditForm)}</div>
              <div>{renderStepCheckboxes(editForm, setEditForm)}</div>
              <div>{renderMemDirectionPicker(editForm, setEditForm)}</div>
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
        </>)}
      </div>
    </TeacherLayout>
  );
};

export default Assignments;

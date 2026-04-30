import { Link } from "react-router-dom";
import { BarChart3, ChevronDown, ChevronLeft, FastForward, KeyRound, Pencil, Plus, Trash2, AlertTriangle } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TeacherLayout } from "@/components/teacher/TeacherLayout";
import { SaveNumberInput } from "@/components/teacher/SaveNumberInput";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import DailyTestSummary from "@/components/teacher/DailyTestSummary";
import StudentHistorySheet from "@/components/teacher/StudentHistorySheet";
import { LEVELS, LEVEL_LABEL, type LevelCode } from "@/lib/levels";
import { useLevelLabels } from "@/hooks/useLevelLabels";
import { toast } from "@/hooks/use-toast";
import { SkipPreManagerDialog } from "@/components/teacher/SkipPreManagerDialog";
import { updateStudentStartLevel, updateStudentStartScope } from "@/lib/studentProfile";
import {
  fetchAllSeries,
  fetchTextbooksBySeries,
  fetchUnitsByTextbook,
  type Series,
  type Textbook,
  type Unit,
} from "@/lib/textbooks";

interface Student {
  id: string;
  name: string;
  level: LevelCode;
  /** 시작 시리즈(책) id. null이면 레벨 전체 */
  startSeriesId?: string | null;
  /** 시작 권 id. null이면 시리즈 전체 */
  startVolumeId?: string | null;
  /** 시작 유닛 id. null이면 권 전체 */
  startUnitId?: string | null;
  /** 표시용 라벨: "L08 · 고1 / EBS 수능특강 / Vol.1 / Unit 3" */
  scopeLabel?: string;
  createdAt: string;
  /** student_profiles.user_id (DB 계정에 연결된 학생만 채워짐) */
  userId?: string;
}

/** 실제 학년 선택지. "" = 미지정. 학습 레벨(L01~L09)과는 별개. */
const ACTUAL_GRADE_OPTIONS = [
  "초3", "초4", "초5", "초6",
  "중1", "중2", "중3",
  "고1", "고2", "고3",
] as const;
type ActualGrade = typeof ACTUAL_GRADE_OPTIONS[number];

const STUDENTS_KEY = "gwj.students.v1";

const seedStudents = (): Student[] => [
  { id: "demo-1", name: "김민준", level: "L05", createdAt: new Date(Date.now() - 86400000 * 30).toISOString() },
  { id: "demo-2", name: "이서연", level: "L08", createdAt: new Date(Date.now() - 86400000 * 21).toISOString() },
  { id: "demo-3", name: "박지호", level: "L03", createdAt: new Date(Date.now() - 86400000 * 14).toISOString() },
  { id: "demo-4", name: "최예린", level: "L10", createdAt: new Date(Date.now() - 86400000 * 7).toISOString() },
  { id: "demo-5", name: "정우진", level: "L07", createdAt: new Date(Date.now() - 86400000 * 2).toISOString() },
];

const loadStudents = (): Student[] => {
  try {
    const raw = window.localStorage.getItem(STUDENTS_KEY);
    if (raw) return JSON.parse(raw) as Student[];
  } catch {
    /* ignore */
  }
  const seeded = seedStudents();
  try {
    window.localStorage.setItem(STUDENTS_KEY, JSON.stringify(seeded));
  } catch {
    /* ignore */
  }
  return seeded;
};

const persist = (list: Student[]) => {
  try {
    window.localStorage.setItem(STUDENTS_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
};

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
};

const TeacherStudents = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [name, setName] = useState("");
  const [level, setLevel] = useState<LevelCode>("L05");
  // 시작 범위 캐스케이딩 선택 상태 (다이얼로그 내부)
  const [seriesId, setSeriesId] = useState<string | null>(null);
  const [volumeId, setVolumeId] = useState<string | null>(null);
  const [unitId, setUnitId] = useState<string | null>(null);
  const [seriesList, setSeriesList] = useState<Series[]>([]);
  const [volumeList, setVolumeList] = useState<Textbook[]>([]);
  const [unitList, setUnitList] = useState<Unit[]>([]);
  const [pinOpen, setPinOpen] = useState(false);
  const [pinTarget, setPinTarget] = useState<Student | null>(null);
  const [pinValue, setPinValue] = useState("");
  const [pinSaving, setPinSaving] = useState(false);
  // name → threshold (0..1) loaded from student_profiles
  const [thresholdByName, setThresholdByName] = useState<Record<string, number>>({});
  const [thresholdSaving, setThresholdSaving] = useState<string | null>(null);
  const [analysisByName, setAnalysisByName] = useState<Record<string, number>>({});
  const [analysisSaving, setAnalysisSaving] = useState<string | null>(null);
  const [timeLimitByName, setTimeLimitByName] = useState<Record<string, number>>({});
  const [timeLimitSaving, setTimeLimitSaving] = useState<string | null>(null);
  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null);
  const [profileUserIdByName, setProfileUserIdByName] = useState<Record<string, string>>({});
  const [profileNoByName, setProfileNoByName] = useState<Record<string, string>>({});
  const [historySheet, setHistorySheet] = useState<{ userId: string; name: string; no: string | null } | null>(null);
  const [skipDialog, setSkipDialog] = useState<{ userId: string; name: string } | null>(null);
  // 학생별 실제 학년 (학습 레벨과 분리)
  const [actualGradeByName, setActualGradeByName] = useState<Record<string, string>>({});
  // 레벨별 등록된 지문 수 (지정 레벨에 지문이 없는 학생 경고용)
  const [passageCountByLevel, setPassageCountByLevel] = useState<Record<string, number>>({});
  const [actualGradeSaving, setActualGradeSaving] = useState<string | null>(null);

  const saveActualGrade = async (s: Student, grade: string) => {
    setActualGradeSaving(s.name);
    try {
      const uid = s.userId ?? profileUserIdByName[s.name];
      if (!uid) {
        toast({ title: "계정 매칭 실패", description: `'${s.name}' 학생은 DB 계정이 없습니다.`, variant: "destructive" });
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("student_profiles") as any)
        .update({ actual_grade: grade || null })
        .eq("user_id", uid);
      if (error) throw error;
      setActualGradeByName((p) => ({ ...p, [s.name]: grade }));
      toast({ title: `🎓 ${s.name} 실제 학년 ${grade || "미지정"} 저장` });
    } catch (e) {
      toast({ title: "저장 실패", description: String(e), variant: "destructive" });
    } finally {
      setActualGradeSaving(null);
    }
  };

  const saveTimeLimit = async (s: Student, seconds: number): Promise<boolean> => {
    const clamped = Math.max(0, Math.min(120, Math.round(seconds)));
    setTimeLimitSaving(s.name);
    try {
      const uid = s.userId ?? profileUserIdByName[s.name];
      if (!uid) {
        toast({ title: "계정 매칭 실패", description: `'${s.name}' 학생은 DB 계정이 없습니다.`, variant: "destructive" });
        return false;
      }
      const { data, error } = await supabase
        .from("student_profiles")
        .update({ word_test_time_limit_sec: clamped })
        .eq("user_id", uid)
        .select("user_id");
      if (error) throw error;
      if (!data || data.length === 0) {
        toast({ title: "계정 매칭 실패", description: `'${s.name}' 이름 계정이 없습니다.`, variant: "destructive" });
        return false;
      }
      setTimeLimitByName((p) => ({ ...p, [s.name]: clamped }));
      toast({ title: `⏱ ${s.name} 단어시험 제한 ${clamped === 0 ? "OFF" : `${clamped}초`} 저장` });
      return true;
    } catch (e) {
      toast({ title: "저장 실패", description: String(e), variant: "destructive" });
      return false;
    } finally {
      setTimeLimitSaving(null);
    }
  };

  const openPin = (s: Student) => {
    setPinTarget(s);
    setPinValue("");
    setPinOpen(true);
  };

  const submitPin = async () => {
    if (!pinTarget) return;
    if (pinValue.length < 4) {
      toast({ title: "PIN은 4자리 이상 숫자여야 합니다", variant: "destructive" });
      return;
    }
    setPinSaving(true);
    try {
      const uid = pinTarget.userId ?? profileUserIdByName[pinTarget.name];
      if (!uid) {
        toast({
          title: "일치하는 학생 계정을 찾지 못했어요",
          description: `'${pinTarget.name}' 이름의 학생 계정이 등록되어 있어야 PIN이 적용됩니다.`,
          variant: "destructive",
        });
        return;
      }
      const { data, error } = await supabase
        .from("student_profiles")
        .update({ teacher_pin: pinValue })
        .eq("user_id", uid)
        .select("user_id");
      if (error) throw error;
      if (!data || data.length === 0) {
        toast({
          title: "일치하는 학생 계정을 찾지 못했어요",
          description: `'${pinTarget.name}' 이름의 학생 계정이 등록되어 있어야 PIN이 적용됩니다.`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "🔐 패스키가 설정되었습니다",
          description: `${pinTarget.name} · ${data.length}개 계정`,
        });
        setPinOpen(false);
      }
    } catch (e) {
      toast({ title: "저장 실패", description: String(e), variant: "destructive" });
    } finally {
      setPinSaving(false);
    }
  };

  const saveThreshold = async (s: Student, percent: number): Promise<boolean> => {
    const clamped = Math.max(50, Math.min(100, Math.round(percent)));
    setThresholdSaving(s.name);
    try {
      const uid = s.userId ?? profileUserIdByName[s.name];
      if (!uid) {
        toast({ title: "계정 매칭 실패", description: `'${s.name}' 학생은 DB 계정이 없습니다.`, variant: "destructive" });
        return false;
      }
      const { data, error } = await supabase
        .from("student_profiles")
        .update({ word_test_pass_threshold: clamped / 100 })
        .eq("user_id", uid)
        .select("user_id");
      if (error) throw error;
      if (!data || data.length === 0) {
        toast({
          title: "계정 매칭 실패",
          description: `'${s.name}' 이름 계정이 없습니다.`,
          variant: "destructive",
        });
        return false;
      }
      setThresholdByName((p) => ({ ...p, [s.name]: clamped / 100 }));
      toast({ title: `✅ ${s.name} 단어 통과기준 ${clamped}% 저장` });
      return true;
    } catch (e) {
      toast({ title: "저장 실패", description: String(e), variant: "destructive" });
      return false;
    } finally {
      setThresholdSaving(null);
    }
  };

  const saveAnalysisThreshold = async (s: Student, percent: number): Promise<boolean> => {
    const clamped = Math.max(50, Math.min(100, Math.round(percent)));
    setAnalysisSaving(s.name);
    try {
      const uid = s.userId ?? profileUserIdByName[s.name];
      if (!uid) {
        toast({ title: "계정 매칭 실패", description: `'${s.name}' 학생은 DB 계정이 없습니다.`, variant: "destructive" });
        return false;
      }
      const { data, error } = await supabase
        .from("student_profiles")
        .update({ analysis_pass_threshold: clamped / 100 })
        .eq("user_id", uid)
        .select("user_id");
      if (error) throw error;
      if (!data || data.length === 0) {
        toast({
          title: "계정 매칭 실패",
          description: `'${s.name}' 이름 계정이 없습니다.`,
          variant: "destructive",
        });
        return false;
      }
      setAnalysisByName((p) => ({ ...p, [s.name]: clamped / 100 }));
      toast({ title: `✅ ${s.name} 분석 통과기준 ${clamped}% 저장` });
      return true;
    } catch (e) {
      toast({ title: "저장 실패", description: String(e), variant: "destructive" });
      return false;
    } finally {
      setAnalysisSaving(null);
    }
  };


  // Load students from DB (student_profiles) + merge with localStorage entries
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("student_profiles")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("user_id, student_no, display_name, start_level, current_level, actual_grade, created_at, word_test_pass_threshold, analysis_pass_threshold, word_test_time_limit_sec, start_series_id, start_volume_id, start_unit_id") as { data: any[] | null; error: { message: string } | null };
      if (error) {
        toast({ title: "학생 목록 불러오기 실패", description: error.message, variant: "destructive" });
      }

      // 시리즈/권/유닛 메타 한 번에 로드 (라벨용)
      const [seriesAll, tbAll, unitsAll, passagesAll] = await Promise.all([
        supabase.from("textbook_series").select("id, title, series_no, level"),
        supabase.from("textbooks").select("id, level, title, volume_no, series_id"),
        supabase.from("textbook_units").select("id, title, unit_no, textbook_id"),
        supabase.from("textbook_passages").select("textbook_id"),
      ]);
      const seriesById = new Map<string, { title: string; series_no: number }>();
      ((seriesAll.data ?? []) as { id: string; title: string; series_no: number }[])
        .forEach((r) => seriesById.set(r.id, { title: r.title, series_no: r.series_no }));
      const volById = new Map<string, { title: string; volume_no: number }>();
      ((tbAll.data ?? []) as { id: string; title: string; volume_no: number }[])
        .forEach((r) => volById.set(r.id, { title: r.title, volume_no: r.volume_no }));
      const unitById = new Map<string, { title: string; unit_no: number }>();
      ((unitsAll.data ?? []) as { id: string; title: string; unit_no: number }[])
        .forEach((r) => unitById.set(r.id, { title: r.title, unit_no: r.unit_no }));

      const wtMap: Record<string, number> = {};
      const anMap: Record<string, number> = {};
      const tlMap: Record<string, number> = {};
      const userMap: Record<string, string> = {};
      const noMap: Record<string, string> = {};
      const gradeMap: Record<string, string> = {};
      const dbStudents: Student[] = [];
      (data ?? []).forEach((row) => {
        const name = row.display_name || row.student_no || String(row.user_id).slice(0, 8);
        wtMap[name] = Number(row.word_test_pass_threshold ?? 0.8);
        anMap[name] = Number(row.analysis_pass_threshold ?? 0.8);
        tlMap[name] = Number(row.word_test_time_limit_sec ?? 20);
        userMap[name] = row.user_id;
        if (row.student_no) noMap[name] = row.student_no;
        gradeMap[name] = row.actual_grade ?? "";
        // 범위 라벨 만들기
        const labelParts: string[] = [];
        if (row.start_series_id && seriesById.has(row.start_series_id)) {
          labelParts.push(seriesById.get(row.start_series_id)!.title);
        }
        if (row.start_volume_id && volById.has(row.start_volume_id)) {
          const v = volById.get(row.start_volume_id)!;
          labelParts.push(`Vol.${v.volume_no} ${v.title}`);
        }
        if (row.start_unit_id && unitById.has(row.start_unit_id)) {
          const u = unitById.get(row.start_unit_id)!;
          labelParts.push(`Unit ${u.unit_no} ${u.title}`);
        }
        dbStudents.push({
          id: `db-${row.user_id}`,
          name,
          level: ((row.start_level as LevelCode) || (row.current_level as LevelCode) || "L05"),
          startSeriesId: row.start_series_id ?? null,
          startVolumeId: row.start_volume_id ?? null,
          startUnitId: row.start_unit_id ?? null,
          scopeLabel: labelParts.length > 0 ? labelParts.join(" / ") : undefined,
          createdAt: row.created_at,
          userId: row.user_id,
        });
      });
      setThresholdByName(wtMap);
      setAnalysisByName(anMap);
      setTimeLimitByName(tlMap);
      setProfileUserIdByName(userMap);
      setProfileNoByName(noMap);
      setActualGradeByName(gradeMap);

      // Merge: DB students first, then any localStorage students whose name doesn't match a DB account
      const localOnly = loadStudents().filter((s) => !userMap[s.name]);
      setStudents([...dbStudents, ...localOnly]);

      // 레벨별 지문 수 집계 (textbooks.level → textbook_passages 카운트)
      const levelOf: Record<string, string> = {};
      ((tbAll.data ?? []) as { id: string; level: string }[]).forEach((r) => { levelOf[r.id] = r.level; });
      const cnt: Record<string, number> = {};
      ((passagesAll.data ?? []) as { textbook_id: string }[]).forEach((r) => {
        const lv = levelOf[r.textbook_id];
        if (lv) cnt[lv] = (cnt[lv] ?? 0) + 1;
      });
      setPassageCountByLevel(cnt);
    })();
  }, []);

  const sorted = useMemo(
    () => [...students].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    [students],
  );

  const openCreate = () => {
    setEditing(null);
    setName("");
    setLevel("L05");
    setSeriesId(null);
    setVolumeId(null);
    setUnitId(null);
    setVolumeList([]);
    setUnitList([]);
    setOpen(true);
  };

  const openEdit = (s: Student) => {
    setEditing(s);
    setName(s.name);
    setLevel(s.level);
    setSeriesId(s.startSeriesId ?? null);
    setVolumeId(s.startVolumeId ?? null);
    setUnitId(s.startUnitId ?? null);
    setOpen(true);
  };

  // 다이얼로그가 열려있는 동안 항상 전체 시리즈를 보여준다.
  // (학생 학습레벨과 무관 — 시리즈를 고르면 그 시리즈의 레벨로 학습레벨을 자동 맞춘다.)
  useEffect(() => {
    if (!open) return;
    fetchAllSeries()
      .then(setSeriesList)
      .catch(() => setSeriesList([]));
  }, [open]);

  // 시리즈가 바뀌면 → 권 목록 로드
  useEffect(() => {
    if (!open) return;
    if (!seriesId) {
      setVolumeList([]);
      return;
    }
    fetchTextbooksBySeries(seriesId)
      .then(setVolumeList)
      .catch(() => setVolumeList([]));
  }, [open, seriesId]);

  // 권이 바뀌면 → 유닛 목록 로드
  useEffect(() => {
    if (!open) return;
    if (!volumeId) {
      setUnitList([]);
      return;
    }
    fetchUnitsByTextbook(volumeId)
      .then(setUnitList)
      .catch(() => setUnitList([]));
  }, [open, volumeId]);

  const submit = async () => {
    if (!name.trim()) {
      toast({ title: "이름을 입력해주세요" });
      return;
    }
    if (editing) {
      const trimmed = name.trim();
      const oldName = editing.name;
      const uid = editing.userId ?? profileUserIdByName[oldName];
      // DB 계정에 연결된 학생이면 display_name 도 함께 update
      if (uid && trimmed !== oldName) {
        const { error } = await supabase
          .from("student_profiles")
          .update({ display_name: trimmed })
          .eq("user_id", uid);
        if (error) {
          toast({ title: "이름 저장 실패", description: error.message, variant: "destructive" });
          return;
        }
        // 이름이 키로 쓰이는 보조 맵들도 새 이름으로 마이그레이트
        const moveKey = <T,>(m: Record<string, T>): Record<string, T> => {
          if (!(oldName in m)) return m;
          const { [oldName]: v, ...rest } = m;
          return { ...rest, [trimmed]: v };
        };
        setProfileUserIdByName((p) => moveKey(p));
        setProfileNoByName((p) => moveKey(p));
        setThresholdByName((p) => moveKey(p));
        setAnalysisByName((p) => moveKey(p));
        setTimeLimitByName((p) => moveKey(p));
      }
      // 시작 범위(레벨/시리즈/권/유닛) 저장 — 항상 호출 (값이 같아도 안전)
      if (uid) {
        await updateStudentStartScope(uid, {
          start_level: level,
          start_series_id: seriesId,
          start_volume_id: volumeId,
          start_unit_id: unitId,
        });
      }
      // 표시용 라벨 즉시 갱신
      const labelParts: string[] = [];
      const sObj = seriesList.find((x) => x.id === seriesId);
      if (sObj) labelParts.push(sObj.title);
      const vObj = volumeList.find((x) => x.id === volumeId);
      if (vObj) labelParts.push(`Vol.${vObj.volume_no} ${vObj.title}`);
      const uObj = unitList.find((x) => x.id === unitId);
      if (uObj) labelParts.push(`Unit ${uObj.unit_no} ${uObj.title}`);
      const next = students.map((s) =>
        s.id === editing.id
          ? {
              ...s,
              name: trimmed,
              level,
              startSeriesId: seriesId,
              startVolumeId: volumeId,
              startUnitId: unitId,
              scopeLabel: labelParts.length > 0 ? labelParts.join(" / ") : undefined,
              userId: uid ?? s.userId,
            }
          : s,
      );
      setStudents(next);
      persist(next);
      toast({ title: "✏️ 학생 정보가 수정되었습니다" });
    } else {
      const next: Student[] = [
        ...students,
        {
          id: `st-${Date.now()}`,
          name: name.trim(),
          level,
          createdAt: new Date().toISOString(),
        },
      ];
      setStudents(next);
      persist(next);
      toast({ title: "✅ 학생이 등록되었습니다" });
    }
    setOpen(false);
  };

  const remove = (id: string) => {
    const next = students.filter((s) => s.id !== id);
    setStudents(next);
    persist(next);
    toast({ title: "🗑️ 학생이 삭제되었습니다" });
  };

  return (
    <TeacherLayout>
    <main className="max-w-[1400px] mx-auto p-4 lg:p-8 flex flex-col gap-6 font-kr">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link
            to="/teacher"
            className="inline-flex items-center gap-1 text-[11px] font-bold text-muted-foreground hover:text-primary transition-colors"
          >
            <ChevronLeft className="size-3.5" /> 대시보드
          </Link>
          <h1 className="text-2xl font-extrabold tracking-tight mt-1">학생 관리</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            학생을 등록하고 레벨·통과기준을 지정하세요. (분석 통과율은 저학년일수록 높게 설정 권장)
          </p>
          {(() => {
            const missing = Array.from(new Set(students.map((s) => s.level))).filter(
              (lv) => (passageCountByLevel[lv] ?? 0) === 0,
            );
            if (missing.length === 0) return null;
            const affected = students.filter((s) => missing.includes(s.level));
            return (
              <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm">
                <AlertTriangle className="w-4 h-4 mt-0.5 text-amber-600 shrink-0" />
                <div className="text-amber-800 dark:text-amber-200">
                  <strong>지문이 없는 레벨이 있어요:</strong>{" "}
                  {missing.map((lv) => `${lv}·${LEVEL_LABEL[lv as LevelCode]}`).join(", ")} —{" "}
                  해당 레벨의 학생({affected.length}명)은 학습을 시작할 수 없습니다.
                  <Link to="/teacher/bookshelf" className="ml-1 underline font-bold">책장에서 지문 추가</Link>
                </div>
              </div>
            );
          })()}
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreate}>
              <Plus className="size-4" />
              학생 추가
            </Button>
          </DialogTrigger>
          <DialogContent className="font-kr">
            <DialogHeader>
              <DialogTitle>{editing ? "학생 정보 수정" : "새 학생 등록"}</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-4 py-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="student-name">이름</Label>
                <Input
                  id="student-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="홍길동"
                  autoFocus
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>레벨</Label>
                <Select
                  value={level}
                  onValueChange={(v) => {
                    const next = v as LevelCode;
                    setLevel(next);
                    // 선택된 시리즈가 새 레벨과 다르면 하위 지정 초기화
                    const picked = seriesList.find((s) => s.id === seriesId);
                    if (!picked || picked.level !== next) {
                      setSeriesId(null);
                      setVolumeId(null);
                      setUnitId(null);
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LEVELS.map((l) => (
                      <SelectItem key={l.code} value={l.code}>
                        {l.code} · {l.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>책 (선택)</Label>
                <Select
                  value={seriesId ?? "__all__"}
                  onValueChange={(v) => {
                    if (v === "__all__") {
                      setSeriesId(null);
                    } else {
                      setSeriesId(v);
                      // 시리즈를 고르면 그 시리즈의 레벨로 학습레벨을 자동 맞춘다
                      const picked = seriesList.find((s) => s.id === v);
                      if (picked && picked.level !== level) {
                        setLevel(picked.level as LevelCode);
                      }
                    }
                    setVolumeId(null);
                    setUnitId(null);
                  }}
                  disabled={seriesList.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={seriesList.length === 0 ? "등록된 책 없음" : "레벨 전체"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">레벨 전체 (책 미지정)</SelectItem>
                    {seriesList.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        [{s.level}] {s.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>권 (선택)</Label>
                <Select
                  value={volumeId ?? "__all__"}
                  onValueChange={(v) => {
                    setVolumeId(v === "__all__" ? null : v);
                    setUnitId(null);
                  }}
                  disabled={!seriesId || volumeList.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={!seriesId ? "먼저 책을 선택" : volumeList.length === 0 ? "등록된 권 없음" : "책 전체"}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">책 전체</SelectItem>
                    {volumeList.map((v) => (
                      <SelectItem key={v.id} value={v.id}>Vol.{v.volume_no} {v.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>유닛 (선택)</Label>
                <Select
                  value={unitId ?? "__all__"}
                  onValueChange={(v) => setUnitId(v === "__all__" ? null : v)}
                  disabled={!volumeId || unitList.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={!volumeId ? "먼저 권을 선택" : unitList.length === 0 ? "등록된 유닛 없음" : "권 전체"}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">권 전체</SelectItem>
                    {unitList.map((u) => (
                      <SelectItem key={u.id} value={u.id}>Unit {u.unit_no} {u.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  비워두면 상위 단계 전체가 학습 범위가 됩니다. 좁힐수록 학생은 그 범위의 지문만 학습합니다.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                취소
              </Button>
              <Button onClick={submit}>{editing ? "수정" : "등록"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="glass-panel rounded-2xl overflow-hidden border border-border/40">
        <Table className="text-[15px]">
          <TableHeader className="sticky top-0 z-10 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
            <TableRow className="border-b-2 border-border">
              <TableHead className="font-bold text-foreground">이름</TableHead>
              <TableHead className="font-bold text-foreground">실제 학년</TableHead>
              <TableHead className="font-bold text-foreground">학습 레벨</TableHead>
              <TableHead className="font-bold text-foreground">단어 통과%</TableHead>
              <TableHead className="font-bold text-foreground">분석 통과%</TableHead>
              <TableHead className="font-bold text-foreground">단어시험 제한</TableHead>
              <TableHead className="font-bold text-foreground">등록일</TableHead>
              <TableHead className="font-bold text-foreground">상태</TableHead>
              <TableHead className="font-bold text-foreground text-right">작업</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-10">
                  등록된 학생이 없습니다. 우측 상단 [학생 추가]로 시작하세요.
                </TableCell>
              </TableRow>
            )}
            {sorted.map((s) => {
              const pct = Math.round((thresholdByName[s.name] ?? 0.8) * 100);
              const aPct = Math.round((analysisByName[s.name] ?? 0.8) * 100);
              const tlSec = Math.round(timeLimitByName[s.name] ?? 20);
              const isExpanded = expandedStudentId === s.id;
              const hasAccount = !!profileUserIdByName[s.name];
              return (
                <Fragment key={s.id}>
                  <TableRow
                    key={s.id}
                    className="hover:bg-muted/40 transition-colors [&>td]:py-3.5"
                  >
                    <TableCell className="font-bold text-base">
                      <div className="flex flex-col">
                        <span>{s.name}</span>
                        {profileNoByName[s.name] && (
                          <span className="text-[11px] font-mono text-muted-foreground mt-0.5">
                            #{profileNoByName[s.name]}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={actualGradeByName[s.name] ?? ""}
                        onValueChange={(v) => saveActualGrade(s, v === "__none__" ? "" : v)}
                        disabled={!hasAccount || actualGradeSaving === s.name}
                      >
                        <SelectTrigger className="h-8 w-[92px] text-sm">
                          <SelectValue placeholder="미지정" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">미지정</SelectItem>
                          {ACTUAL_GRADE_OPTIONS.map((g) => (
                            <SelectItem key={g} value={g}>{g}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5">
                          <Badge variant="secondary" className="font-bold text-sm px-2.5 py-1">
                            {s.level} · {LEVEL_LABEL[s.level]}
                          </Badge>
                          {(passageCountByLevel[s.level] ?? 0) === 0 && (
                            <span
                              title="이 레벨에 등록된 지문이 없습니다. 책장에서 지문을 추가해 주세요."
                              className="inline-flex items-center text-amber-600"
                            >
                              <AlertTriangle className="w-4 h-4" />
                            </span>
                          )}
                        </div>
                        {s.scopeLabel && (
                          <span className="text-[11px] text-muted-foreground leading-tight max-w-[220px] truncate" title={s.scopeLabel}>
                            📚 {s.scopeLabel}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <SaveNumberInput
                        value={pct}
                        min={50}
                        max={100}
                        step={5}
                        suffix="%"
                        ariaLabel={`${s.name} 단어 통과 기준`}
                        onSave={(v) => saveThreshold(s, v)}
                      />
                    </TableCell>
                    <TableCell>
                      <SaveNumberInput
                        value={aPct}
                        min={50}
                        max={100}
                        step={5}
                        suffix="%"
                        ariaLabel={`${s.name} 분석 통과 기준`}
                        onSave={(v) => saveAnalysisThreshold(s, v)}
                      />
                    </TableCell>
                    <TableCell>
                      <SaveNumberInput
                        value={tlSec}
                        min={0}
                        max={120}
                        step={5}
                        suffix={tlSec === 0 ? "OFF" : "초"}
                        ariaLabel={`${s.name} 단어시험 제한 시간`}
                        onSave={(v) => saveTimeLimit(s, v)}
                      />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground tabular-nums">
                      {formatDate(s.createdAt)}
                    </TableCell>
                    <TableCell>
                      {hasAccount ? (
                        <span className="inline-flex items-center gap-1.5 text-xs text-element-v font-bold">
                          <span className="size-2 rounded-full bg-element-v" /> 활성
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground font-bold">
                          <span className="size-2 rounded-full bg-muted-foreground/50" /> 미연결
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex items-center gap-0.5 flex-wrap justify-end">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2"
                          disabled={!hasAccount}
                          onClick={() => {
                            const uid = profileUserIdByName[s.name];
                            if (!uid) {
                              toast({ title: "연결된 학생 계정이 없습니다", variant: "destructive" });
                              return;
                            }
                            setHistorySheet({
                              userId: uid,
                              name: s.name,
                              no: profileNoByName[s.name] ?? null,
                            });
                          }}
                          title="학습 이력 분석"
                        >
                          <BarChart3 className="size-3.5" /> 이력
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2"
                          onClick={() => setExpandedStudentId(isExpanded ? null : s.id)}
                        >
                          <ChevronDown className={`size-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                          점수
                        </Button>
                        <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => openPin(s)}>
                          <KeyRound className="size-3.5" /> PIN
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2"
                          disabled={!hasAccount}
                          onClick={() => {
                            const uid = profileUserIdByName[s.name];
                            if (!uid) {
                              toast({ title: "연결된 학생 계정이 없습니다", variant: "destructive" });
                              return;
                            }
                            setSkipDialog({ userId: uid, name: s.name });
                          }}
                          title="지문별 단어학습 스킵 관리"
                        >
                          <FastForward className="size-3.5" /> 스킵
                        </Button>
                        <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => openEdit(s)}>
                          <Pencil className="size-3.5" /> 수정
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2 text-destructive hover:text-destructive"
                          onClick={() => remove(s.id)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  {isExpanded && (
                    <TableRow>
                      <TableCell colSpan={9} className="bg-muted/20 py-5">
                        {profileUserIdByName[s.name] ? (
                          <DailyTestSummary userId={profileUserIdByName[s.name]} days={14} />
                        ) : (
                          <div className="text-sm text-muted-foreground text-center py-4">
                            연결된 학생 계정이 없어 종합점수를 표시할 수 없습니다.
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog open={pinOpen} onOpenChange={setPinOpen}>
        <DialogContent className="font-kr max-w-sm">
          <DialogHeader>
            <DialogTitle>선생님 패스키 설정</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <p className="text-xs text-muted-foreground">
              학생 <b>{pinTarget?.name}</b> 의 발화/의미 단계에서 인식이 막힐 때 선생님이
              직접 입력하면 통과시킬 수 있는 4–6자리 숫자 PIN 입니다.
            </p>
            <Input
              inputMode="numeric"
              maxLength={6}
              value={pinValue}
              onChange={(e) => setPinValue(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="••••"
              className="text-center text-2xl tracking-[0.5em] font-mono"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPinOpen(false)} disabled={pinSaving}>
              취소
            </Button>
            <Button onClick={submitPin} disabled={pinSaving || pinValue.length < 4}>
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <StudentHistorySheet
        open={historySheet !== null}
        onOpenChange={(o) => !o && setHistorySheet(null)}
        userId={historySheet?.userId ?? null}
        studentName={historySheet?.name ?? null}
        studentNo={historySheet?.no ?? null}
      />

      <SkipPreManagerDialog
        open={skipDialog !== null}
        onOpenChange={(o) => !o && setSkipDialog(null)}
        userId={skipDialog?.userId ?? null}
        studentName={skipDialog?.name ?? null}
      />
    </main>
    </TeacherLayout>
  );
};

export default TeacherStudents;

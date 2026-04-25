import { Link } from "react-router-dom";
import { BarChart3, ChevronDown, ChevronLeft, FastForward, KeyRound, Pencil, Plus, Trash2 } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { toast } from "@/hooks/use-toast";
import { SkipPreManagerDialog } from "@/components/teacher/SkipPreManagerDialog";

interface Student {
  id: string;
  name: string;
  level: LevelCode;
  createdAt: string;
}

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
  const [workbookModeByName, setWorkbookModeByName] = useState<
    Record<string, "unit_only" | "both">
  >({});
  const [workbookModeSaving, setWorkbookModeSaving] = useState<string | null>(null);
  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null);
  const [profileUserIdByName, setProfileUserIdByName] = useState<Record<string, string>>({});
  const [profileNoByName, setProfileNoByName] = useState<Record<string, string>>({});
  const [historySheet, setHistorySheet] = useState<{ userId: string; name: string; no: string | null } | null>(null);
  const [skipDialog, setSkipDialog] = useState<{ userId: string; name: string } | null>(null);

  const saveTimeLimit = async (s: Student, seconds: number) => {
    const clamped = Math.max(0, Math.min(120, Math.round(seconds)));
    setTimeLimitByName((p) => ({ ...p, [s.name]: clamped }));
    setTimeLimitSaving(s.name);
    try {
      const { data, error } = await supabase
        .from("student_profiles")
        .update({ word_test_time_limit_sec: clamped })
        .eq("display_name", s.name)
        .select("user_id");
      if (error) throw error;
      if (!data || data.length === 0) {
        toast({ title: "계정 매칭 실패", description: `'${s.name}' 이름 계정이 없습니다.`, variant: "destructive" });
      } else {
        toast({ title: `⏱ ${s.name} 단어시험 제한 ${clamped === 0 ? "OFF" : `${clamped}초`} 저장` });
      }
    } catch (e) {
      toast({ title: "저장 실패", description: String(e), variant: "destructive" });
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
      let q = supabase
        .from("student_profiles")
        .update({ teacher_pin: pinValue })
        .select("user_id");
      const profileUserId = profileUserIdByName[pinTarget.name];
      q = profileUserId ? q.eq("user_id", profileUserId) : q.eq("display_name", pinTarget.name);
      const { data, error } = await q;
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

  const saveThreshold = async (s: Student, percent: number) => {
    const clamped = Math.max(50, Math.min(100, Math.round(percent)));
    setThresholdByName((p) => ({ ...p, [s.name]: clamped / 100 }));
    setThresholdSaving(s.name);
    try {
      const { data, error } = await supabase
        .from("student_profiles")
        .update({ word_test_pass_threshold: clamped / 100 })
        .eq("display_name", s.name)
        .select("user_id");
      if (error) throw error;
      if (!data || data.length === 0) {
        toast({
          title: "계정 매칭 실패",
          description: `'${s.name}' 이름 계정이 없습니다.`,
          variant: "destructive",
        });
      } else {
        toast({ title: `✅ ${s.name} 단어 통과기준 ${clamped}% 저장` });
      }
    } catch (e) {
      toast({ title: "저장 실패", description: String(e), variant: "destructive" });
    } finally {
      setThresholdSaving(null);
    }
  };

  const saveAnalysisThreshold = async (s: Student, percent: number) => {
    const clamped = Math.max(50, Math.min(100, Math.round(percent)));
    setAnalysisByName((p) => ({ ...p, [s.name]: clamped / 100 }));
    setAnalysisSaving(s.name);
    try {
      const { data, error } = await supabase
        .from("student_profiles")
        .update({ analysis_pass_threshold: clamped / 100 })
        .eq("display_name", s.name)
        .select("user_id");
      if (error) throw error;
      if (!data || data.length === 0) {
        toast({
          title: "계정 매칭 실패",
          description: `'${s.name}' 이름 계정이 없습니다.`,
          variant: "destructive",
        });
      } else {
        toast({ title: `✅ ${s.name} 분석 통과기준 ${clamped}% 저장` });
      }
    } catch (e) {
      toast({ title: "저장 실패", description: String(e), variant: "destructive" });
    } finally {
      setAnalysisSaving(null);
    }
  };

  const saveWorkbookMode = async (s: Student, mode: "unit_only" | "both") => {
    setWorkbookModeByName((p) => ({ ...p, [s.name]: mode }));
    setWorkbookModeSaving(s.name);
    try {
      const { data, error } = await supabase
        .from("student_profiles")
        .update({ unit_workbook_mode: mode })
        .eq("display_name", s.name)
        .select("user_id");
      if (error) throw error;
      if (!data || data.length === 0) {
        toast({
          title: "계정 매칭 실패",
          description: `'${s.name}' 이름 계정이 없습니다.`,
          variant: "destructive",
        });
      } else {
        toast({
          title: `📘 ${s.name} 워크북 모드 ${mode === "unit_only" ? "유닛만" : "유닛+문장"} 저장`,
        });
      }
    } catch (e) {
      toast({ title: "저장 실패", description: String(e), variant: "destructive" });
    } finally {
      setWorkbookModeSaving(null);
    }
  };

  // Load students from DB (student_profiles) + merge with localStorage entries
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("student_profiles")
        .select("user_id, student_no, display_name, current_level, created_at, word_test_pass_threshold, analysis_pass_threshold, word_test_time_limit_sec, unit_workbook_mode");
      if (error) {
        toast({ title: "학생 목록 불러오기 실패", description: error.message, variant: "destructive" });
      }
      const wtMap: Record<string, number> = {};
      const anMap: Record<string, number> = {};
      const tlMap: Record<string, number> = {};
      const wbMap: Record<string, "unit_only" | "both"> = {};
      const userMap: Record<string, string> = {};
      const noMap: Record<string, string> = {};
      const dbStudents: Student[] = [];
      (data ?? []).forEach((row: { user_id: string; student_no: string | null; display_name: string | null; current_level: string | null; created_at: string; word_test_pass_threshold: number | null; analysis_pass_threshold: number | null; word_test_time_limit_sec: number | null; unit_workbook_mode: string | null }) => {
        const name = row.display_name || row.student_no || row.user_id.slice(0, 8);
        wtMap[name] = Number(row.word_test_pass_threshold ?? 0.8);
        anMap[name] = Number(row.analysis_pass_threshold ?? 0.8);
        tlMap[name] = Number(row.word_test_time_limit_sec ?? 20);
        wbMap[name] = (row.unit_workbook_mode === "unit_only" ? "unit_only" : "both");
        userMap[name] = row.user_id;
        if (row.student_no) noMap[name] = row.student_no;
        dbStudents.push({
          id: `db-${row.user_id}`,
          name,
          level: ((row.current_level as LevelCode) || "L05"),
          createdAt: row.created_at,
        });
      });
      setThresholdByName(wtMap);
      setAnalysisByName(anMap);
      setTimeLimitByName(tlMap);
      setWorkbookModeByName(wbMap);
      setProfileUserIdByName(userMap);
      setProfileNoByName(noMap);

      // Merge: DB students first, then any localStorage students whose name doesn't match a DB account
      const localOnly = loadStudents().filter((s) => !userMap[s.name]);
      setStudents([...dbStudents, ...localOnly]);
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
    setOpen(true);
  };

  const openEdit = (s: Student) => {
    setEditing(s);
    setName(s.name);
    setLevel(s.level);
    setOpen(true);
  };

  const submit = () => {
    if (!name.trim()) {
      toast({ title: "이름을 입력해주세요" });
      return;
    }
    if (editing) {
      const next = students.map((s) =>
        s.id === editing.id ? { ...s, name: name.trim(), level } : s,
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
    <main className="max-w-6xl mx-auto p-4 lg:p-8 flex flex-col gap-6 font-kr">
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
                <Select value={level} onValueChange={(v) => setLevel(v as LevelCode)}>
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

      <div className="glass-panel rounded-2xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>이름</TableHead>
              <TableHead>레벨</TableHead>
              <TableHead>단어 통과%</TableHead>
              <TableHead>분석 통과%</TableHead>
              <TableHead>단어시험 제한(초)</TableHead>
              <TableHead>워크북 모드</TableHead>
              <TableHead>등록일</TableHead>
              <TableHead>상태</TableHead>
              <TableHead className="text-right">작업</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-8">
                  등록된 학생이 없습니다. 우측 상단 [학생 추가]로 시작하세요.
                </TableCell>
              </TableRow>
            )}
            {sorted.map((s) => {
              const pct = Math.round((thresholdByName[s.name] ?? 0.8) * 100);
              const aPct = Math.round((analysisByName[s.name] ?? 0.8) * 100);
              const tlSec = Math.round(timeLimitByName[s.name] ?? 20);
              const isExpanded = expandedStudentId === s.id;
              return (
                <Fragment key={s.id}>
                  <TableRow key={s.id}>
                    <TableCell className="font-semibold">{s.name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-bold">
                        {s.level} · {LEVEL_LABEL[s.level]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Input
                          type="number"
                          min={50}
                          max={100}
                          step={5}
                          defaultValue={pct}
                          disabled={thresholdSaving === s.name}
                          className="h-8 w-20 text-center font-bold tabular-nums"
                          onBlur={(e) => {
                            const v = Number(e.target.value);
                            if (!Number.isNaN(v) && v !== pct) saveThreshold(s, v);
                          }}
                        />
                        <span className="text-xs text-muted-foreground">%</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Input
                          type="number"
                          min={50}
                          max={100}
                          step={5}
                          defaultValue={aPct}
                          disabled={analysisSaving === s.name}
                          className="h-8 w-20 text-center font-bold tabular-nums"
                          onBlur={(e) => {
                            const v = Number(e.target.value);
                            if (!Number.isNaN(v) && v !== aPct) saveAnalysisThreshold(s, v);
                          }}
                        />
                        <span className="text-xs text-muted-foreground">%</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Input
                          type="number"
                          min={0}
                          max={120}
                          step={5}
                          defaultValue={tlSec}
                          disabled={timeLimitSaving === s.name}
                          className="h-8 w-20 text-center font-bold tabular-nums"
                          onBlur={(e) => {
                            const v = Number(e.target.value);
                            if (!Number.isNaN(v) && v !== tlSec) saveTimeLimit(s, v);
                          }}
                        />
                        <span className="text-xs text-muted-foreground">{tlSec === 0 ? "OFF" : "초"}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={workbookModeByName[s.name] ?? "both"}
                        onValueChange={(v) =>
                          saveWorkbookMode(s, v as "unit_only" | "both")
                        }
                        disabled={workbookModeSaving === s.name}
                      >
                        <SelectTrigger className="h-8 w-28 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="both">유닛+문장</SelectItem>
                          <SelectItem value="unit_only">유닛만</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground tabular-nums">
                      {formatDate(s.createdAt)}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1 text-xs text-element-v font-bold">
                        <span className="size-1.5 rounded-full bg-element-v" /> 활성
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={!profileUserIdByName[s.name]}
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
                          onClick={() => setExpandedStudentId(isExpanded ? null : s.id)}
                        >
                          <ChevronDown className={`size-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                          종합점수
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => openPin(s)}>
                          <KeyRound className="size-3.5" /> PIN
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={!profileUserIdByName[s.name]}
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
                        <Button size="sm" variant="ghost" onClick={() => openEdit(s)}>
                          <Pencil className="size-3.5" /> 수정
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => remove(s.id)}
                        >
                          <Trash2 className="size-3.5" /> 삭제
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
  );
};

export default TeacherStudents;

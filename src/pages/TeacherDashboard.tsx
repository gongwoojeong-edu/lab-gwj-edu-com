import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LEVELS, LEVEL_LABEL, type LevelCode } from "@/lib/levels";
import {
  fetchAllStudents,
  fetchStudentStatsMap,
  fetchStudentFailCounts,
  updateStudentStartLevel,
  updateStudentHintMode,
  type StudentProfile,
  type StudentStats,
} from "@/lib/studentProfile";
import { useAuth, signOut, type AppRole } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { LogOut, ChevronLeft, Shield, ShieldCheck, GraduationCap } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { addUserRole, fetchAllUserRoles, removeUserRole } from "@/lib/userRoles";

const ROLE_OPTIONS: { value: AppRole; label: string; icon: typeof Shield }[] = [
  { value: "student", label: "학생", icon: GraduationCap },
  { value: "teacher", label: "선생님", icon: Shield },
  { value: "admin", label: "관리자", icon: ShieldCheck },
];

const TeacherDashboard = () => {
  const { user, roles: myRoles } = useAuth();
  const isAdmin = myRoles.includes("admin");
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [stats, setStats] = useState<Record<string, StudentStats>>({});
  const [failCounts, setFailCounts] = useState<Record<string, number>>({});
  const [rolesMap, setRolesMap] = useState<Record<string, AppRole[]>>({});
  const [loading, setLoading] = useState(true);

  const refreshRoles = () => {
    if (!isAdmin) return;
    fetchAllUserRoles().then(setRolesMap).catch(() => {
      /* ignore — non-admin이거나 권한 없음 */
    });
  };

  useEffect(() => {
    let mounted = true;
    Promise.all([fetchAllStudents(), fetchStudentStatsMap(), fetchStudentFailCounts()]).then(([s, st, fc]) => {
      if (mounted) {
        setStudents(s);
        setStats(st);
        setFailCounts(fc);
        setLoading(false);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    refreshRoles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const handleToggleRole = async (userId: string, role: AppRole, has: boolean) => {
    try {
      if (has) {
        await removeUserRole(userId, role);
        toast({ title: `${role} 역할이 제거되었습니다` });
      } else {
        await addUserRole(userId, role);
        toast({ title: `${role} 역할이 부여되었습니다` });
      }
      refreshRoles();
    } catch (e) {
      toast({ title: "권한 변경 실패", description: (e as Error).message, variant: "destructive" });
    }
  };

  const formatLastActivity = (iso: string | null): string => {
    if (!iso) return "-";
    const d = new Date(iso);
    const now = Date.now();
    const diffMin = Math.floor((now - d.getTime()) / 60000);
    if (diffMin < 1) return "방금 전";
    if (diffMin < 60) return `${diffMin}분 전`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}시간 전`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 30) return `${diffDay}일 전`;
    return d.toLocaleDateString("ko-KR");
  };

  const handleStartLevel = async (userId: string, level: LevelCode) => {
    await updateStudentStartLevel(userId, level);
    setStudents((prev) =>
      prev.map((s) =>
        s.user_id === userId ? { ...s, start_level: level, current_level: level, current_no: 1 } : s,
      ),
    );
    toast({ title: "시작 레벨이 변경되었습니다" });
  };

  const handleToggleHint = async (userId: string, enabled: boolean) => {
    try {
      await updateStudentHintMode(userId, enabled);
      setStudents((prev) =>
        prev.map((s) => (s.user_id === userId ? { ...s, hint_mode_enabled: enabled } : s)),
      );
      toast({ title: enabled ? "힌트 모드 ON" : "힌트 모드 OFF" });
    } catch (e) {
      toast({ title: "힌트 모드 변경 실패", description: (e as Error).message, variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              to="/"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="size-4" /> 학습화면
            </Link>
            <h1 className="text-lg font-bold">선생님 대시보드</h1>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="font-mono">{user?.email?.split("@")[0]}</span>
            <Button variant="ghost" size="sm" onClick={() => signOut()}>
              <LogOut className="w-4 h-4 mr-1" /> 로그아웃
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 space-y-4">
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold">학생 목록 ({students.length}명)</h2>
            <p className="text-xs text-muted-foreground">
              학생이 회원가입하면 여기에 자동으로 표시됩니다.
            </p>
          </div>
          {loading ? (
            <div className="text-sm text-muted-foreground py-8 text-center">불러오는 중…</div>
          ) : students.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">
              등록된 학생이 없습니다.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3">학번</th>
                    <th className="py-2 pr-3">이름</th>
                    <th className="py-2 pr-3">시작 레벨</th>
                    <th className="py-2 pr-3">현재 진행</th>
                    <th className="py-2 pr-3 text-right">Pass</th>
                    <th className="py-2 pr-3 text-right">미통</th>
                    <th className="py-2 pr-3">힌트모드</th>
                    <th className="py-2 pr-3">마지막 활동</th>
                    {isAdmin && <th className="py-2 pr-3">권한</th>}
                  </tr>
                </thead>
                <tbody>
                  {students.map((s) => {
                    const st = stats[s.user_id];
                    const failN = failCounts[s.user_id] ?? 0;
                    return (
                      <tr key={s.user_id} className="border-b border-border/50">
                        <td className="py-2 pr-3 font-mono">{s.student_no}</td>
                        <td className="py-2 pr-3">{s.display_name ?? "-"}</td>
                        <td className="py-2 pr-3">
                          <Select
                            value={s.start_level}
                            onValueChange={(v) => handleStartLevel(s.user_id, v as LevelCode)}
                          >
                            <SelectTrigger className="w-32 h-8">
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
                        </td>
                        <td className="py-2 pr-3 text-muted-foreground">
                          {LEVEL_LABEL[s.current_level]} · {s.current_no}번
                        </td>
                        <td className="py-2 pr-3 text-right font-mono font-bold tabular-nums">
                          {st?.pass_count ?? 0}
                        </td>
                        <td className="py-2 pr-3 text-muted-foreground text-xs">
                          {formatLastActivity(st?.last_activity_at ?? null)}
                        </td>
                        {isAdmin && (
                          <td className="py-2 pr-3">
                            <div className="flex flex-wrap gap-1">
                              {ROLE_OPTIONS.map((opt) => {
                                const has = (rolesMap[s.user_id] ?? []).includes(opt.value);
                                const Icon = opt.icon;
                                return (
                                  <Button
                                    key={opt.value}
                                    size="sm"
                                    variant={has ? "default" : "outline"}
                                    className="h-7 px-2 text-xs"
                                    onClick={() => handleToggleRole(s.user_id, opt.value, has)}
                                  >
                                    <Icon className="size-3 mr-1" />
                                    {opt.label}
                                  </Button>
                                );
                              })}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </main>
    </div>
  );
};

export default TeacherDashboard;

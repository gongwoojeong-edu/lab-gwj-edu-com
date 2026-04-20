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
  updateStudentStartLevel,
  type StudentProfile,
} from "@/lib/studentProfile";
import { useAuth, signOut } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { LogOut, ChevronLeft } from "lucide-react";

const TeacherDashboard = () => {
  const { user } = useAuth();
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    fetchAllStudents().then((s) => {
      if (mounted) {
        setStudents(s);
        setLoading(false);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  const handleStartLevel = async (userId: string, level: LevelCode) => {
    await updateStudentStartLevel(userId, level);
    setStudents((prev) =>
      prev.map((s) =>
        s.user_id === userId ? { ...s, start_level: level, current_level: level, current_no: 1 } : s,
      ),
    );
    toast({ title: "시작 레벨이 변경되었습니다" });
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
                  </tr>
                </thead>
                <tbody>
                  {students.map((s) => (
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
                    </tr>
                  ))}
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

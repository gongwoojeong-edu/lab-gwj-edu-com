import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, BookOpen, Activity, ChevronLeft, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { LEVEL_LABEL, type LevelCode } from "@/lib/levels";

interface Student {
  id: string;
  name: string;
  level: LevelCode;
  createdAt: string;
}

const STUDENTS_KEY = "gwj.students.v1";

const TeacherDashboard = () => {
  const [students, setStudents] = useState<Student[]>([]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STUDENTS_KEY);
      if (raw) setStudents(JSON.parse(raw) as Student[]);
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <main className="max-w-6xl mx-auto p-4 lg:p-8 flex flex-col gap-6 font-kr">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Link
            to="/"
            className="inline-flex items-center gap-1 text-[11px] font-bold text-muted-foreground hover:text-primary transition-colors"
          >
            <ChevronLeft className="size-3.5" /> 분석기로 돌아가기
          </Link>
          <h1 className="text-2xl font-extrabold tracking-tight mt-1">선생님 대시보드</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            학생을 등록하고 분석 진행 상황을 한눈에 확인하세요. (현재 로컬 더미 모드)
          </p>
        </div>
        <Button asChild>
          <Link to="/teacher/students">
            <UserPlus className="size-4" />
            학생 등록
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
        <Card className="glass-panel">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="size-4 text-primary" /> 내 학생
            </CardTitle>
            <CardDescription>등록된 학생 수</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-extrabold text-primary tabular-nums">{students.length}명</p>
            {students.length > 0 && (
              <ul className="mt-2 text-xs text-muted-foreground space-y-0.5 max-h-24 overflow-y-auto">
                {students.slice(0, 5).map((s) => (
                  <li key={s.id} className="flex justify-between">
                    <span>{s.name}</span>
                    <span className="text-primary/70 font-semibold">{LEVEL_LABEL[s.level]}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="glass-panel">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpen className="size-4 text-element-v" /> 할당된 문장
            </CardTitle>
            <CardDescription>레벨별 분석 과제</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-extrabold tabular-nums">5문장</p>
            <p className="text-xs text-muted-foreground mt-1">현재 데모: L10(고3) 5문장</p>
          </CardContent>
        </Card>

        <Card className="glass-panel">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="size-4 text-element-o" /> 최근 분석 활동
            </CardTitle>
            <CardDescription>학생 학습 로그</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              백엔드 연결 후 실시간 로그가 표시됩니다.
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
};

export default TeacherDashboard;

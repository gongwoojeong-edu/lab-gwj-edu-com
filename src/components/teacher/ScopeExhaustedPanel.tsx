// ============================================================
// ScopeExhaustedPanel — 진도 끊김 알림
//   선생님이 지정한 시리즈/책(권) 범위를 모두 끝낸 학생을 모아
//   새 시리즈·책 등록을 유도한다.
// ============================================================
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BookOpen, AlertTriangle } from "lucide-react";
import { fetchScopeStatusMap } from "@/lib/progressScope";
import type { StudentProfile } from "@/lib/studentProfile";

interface Props {
  students: StudentProfile[];
}

export const ScopeExhaustedPanel = ({ students }: Props) => {
  const [rows, setRows] = useState<StudentProfile[]>([]);

  useEffect(() => {
    const inputs = students.map((s) => ({
      user_id: s.user_id,
      start_series_id: s.start_series_id ?? null,
      start_volume_id: s.start_volume_id ?? null,
      start_unit_id: s.start_unit_id ?? null,
    }));
    if (inputs.length === 0) {
      setRows([]);
      return;
    }
    let alive = true;
    fetchScopeStatusMap(inputs)
      .then((map) => {
        if (!alive) return;
        setRows(students.filter((s) => map[s.user_id]?.kind === "exhausted"));
      })
      .catch(() => alive && setRows([]));
    return () => {
      alive = false;
    };
  }, [students]);

  if (rows.length === 0) return null;

  return (
    <Card className="p-4 border-amber-300 bg-amber-50/60 dark:bg-amber-950/20">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className="size-5 text-amber-600 mt-0.5 shrink-0" />
          <div>
            <h2 className="text-base font-bold">진도 끊김 — {rows.length}명</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              등록된 시리즈·책의 학습을 모두 마쳤습니다. 새 시리즈나 책을 등록해 주세요.
            </p>
          </div>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link to="/teacher/students">
            <BookOpen className="size-3.5" /> 진도 설정
          </Link>
        </Button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {rows.map((s) => (
          <span
            key={s.user_id}
            className="text-xs font-medium rounded-full border border-amber-300 bg-background px-2.5 py-1"
          >
            {s.display_name ?? s.student_no}
            {s.orbit_class_name ? (
              <span className="text-muted-foreground"> · {s.orbit_class_name}</span>
            ) : null}
          </span>
        ))}
      </div>
    </Card>
  );
};

export default ScopeExhaustedPanel;

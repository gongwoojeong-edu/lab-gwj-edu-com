import { useEffect, useState } from "react";
import { TeacherLayout } from "@/components/teacher/TeacherLayout";
import { Card } from "@/components/ui/card";
import { RefreshCcw, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Row {
  id: string;
  user_id: string | null;
  sentence_id: string;
  score: number;
  taken_at: string;
}

const Retests = () => {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("word_test_results")
      .select("id, user_id, sentence_id, score, taken_at")
      .eq("passed", false)
      .order("taken_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        setRows((data ?? []) as Row[]);
        setLoading(false);
      });
  }, []);

  return (
    <TeacherLayout>
      <div className="p-6 max-w-4xl mx-auto space-y-4">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <RefreshCcw className="size-6 text-primary" /> 재시험 관리
        </h1>
        <Card className="p-4">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="animate-spin text-primary" />
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-10">
              미통과 단어 테스트 기록이 없습니다.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-2 px-2">학생 ID</th>
                  <th className="py-2 px-2">지문</th>
                  <th className="py-2 px-2 text-right">점수</th>
                  <th className="py-2 px-2">일시</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-border/50">
                    <td className="py-2 px-2 font-mono text-xs">
                      {r.user_id?.slice(0, 8) ?? "-"}
                    </td>
                    <td className="py-2 px-2 font-mono text-xs text-primary">{r.sentence_id}</td>
                    <td className="py-2 px-2 text-right tabular-nums">
                      {Math.round(r.score * 100)}%
                    </td>
                    <td className="py-2 px-2 text-xs text-muted-foreground">
                      {new Date(r.taken_at).toLocaleString("ko-KR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </TeacherLayout>
  );
};

export default Retests;

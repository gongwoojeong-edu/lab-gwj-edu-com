import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { TeacherLayout } from "@/components/teacher/TeacherLayout";
import { Card } from "@/components/ui/card";
import { Loader2, BookOpen, FileCheck, FileEdit } from "lucide-react";
import { LEVELS, LEVEL_LABEL, type LevelCode } from "@/lib/levels";
import { fetchLevelStats, type LevelStats } from "@/lib/textbooks";

const Bookshelf = () => {
  const [stats, setStats] = useState<Map<LevelCode, LevelStats>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLevelStats()
      .then(setStats)
      .finally(() => setLoading(false));
  }, []);

  return (
    <TeacherLayout>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookOpen className="size-6 text-primary" /> 책장
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            레벨별로 교재(유닛)를 관리합니다. 카드를 클릭해 해당 레벨로 이동하세요.
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {LEVELS.map((l) => {
              const s = stats.get(l.code);
              const tb = s?.textbook_count ?? 0;
              const passages = s?.passage_count ?? 0;
              const ready = s?.ready_count ?? 0;
              const draft = passages - ready;
              return (
                <Link key={l.code} to={`/teacher/bookshelf/${l.code}`}>
                  <Card className="p-5 hover:border-primary/50 hover:shadow-md transition-all cursor-pointer h-full">
                    <div className="flex items-baseline justify-between mb-2">
                      <div className="font-mono text-xs text-muted-foreground">{l.code}</div>
                      <div className="text-xs font-bold text-primary">{LEVEL_LABEL[l.code]}</div>
                    </div>
                    <div className="text-3xl font-extrabold mb-3">{tb}</div>
                    <div className="text-xs text-muted-foreground">교재 수</div>
                    <div className="mt-4 flex items-center gap-3 text-xs">
                      <span className="inline-flex items-center gap-1 text-emerald-600">
                        <FileCheck className="size-3.5" /> {ready}
                      </span>
                      <span className="inline-flex items-center gap-1 text-amber-600">
                        <FileEdit className="size-3.5" /> {draft}
                      </span>
                      <span className="ml-auto text-muted-foreground">지문 {passages}개</span>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </TeacherLayout>
  );
};

export default Bookshelf;

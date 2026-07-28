import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Activity, CheckCircle2, TrendingUp, Users } from "lucide-react";
import { fetchClassKpis, type ClassKpis } from "@/lib/learningStats";

const ClassKpiCards = () => {
  const { data: kpis, isLoading: loading } = useQuery<ClassKpis>({
    queryKey: ["class-kpis-today"],
    queryFn: fetchClassKpis,
    // 5분 캐시 — 대시보드 왕복/재마운트마다 무거운 집계를 다시 부르지 않도록
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  const cards = [
    {
      label: "오늘 학습 활동",
      value: kpis ? `${kpis.activeToday} / ${kpis.totalStudents}` : "—",
      sub: "명",
      icon: Activity,
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      label: "오늘 PASS 문장",
      value: kpis ? `${kpis.passSentencesToday}` : "—",
      sub: "문장",
      icon: CheckCircle2,
      color: "text-emerald-600",
      bg: "bg-emerald-500/10",
    },
    {
      label: "오늘 평균 통합점수",
      value: kpis?.avgIntegratedToday != null ? kpis.avgIntegratedToday.toFixed(1) : "—",
      sub: "점",
      icon: TrendingUp,
      color: "text-amber-600",
      bg: "bg-amber-500/10",
    },
    {
      label: "주간 활성 학생",
      value: kpis ? `${kpis.weeklyActiveStudents}` : "—",
      sub: "명 (7일)",
      icon: Users,
      color: "text-violet-600",
      bg: "bg-violet-500/10",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <Card key={c.label} className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[11px] text-muted-foreground font-medium">{c.label}</div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-2xl font-extrabold tabular-nums">{loading ? "…" : c.value}</span>
                  <span className="text-[11px] text-muted-foreground">{c.sub}</span>
                </div>
              </div>
              <div className={`shrink-0 size-9 rounded-lg ${c.bg} flex items-center justify-center`}>
                <Icon className={`size-4 ${c.color}`} />
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
};

export default ClassKpiCards;

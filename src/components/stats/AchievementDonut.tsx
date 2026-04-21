import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { AchievementDistribution } from "@/lib/learningStats";

interface Props {
  data: AchievementDistribution;
}

const AchievementDonut = ({ data }: Props) => {
  const items = [
    { name: "PASS", value: data.pass, color: "hsl(var(--primary))" },
    { name: "FAIL", value: data.fail, color: "hsl(var(--destructive))" },
    { name: "진행중", value: data.pending, color: "hsl(var(--muted-foreground))" },
  ].filter((x) => x.value > 0);

  const passRate = data.total > 0 ? Math.round((data.pass / data.total) * 100) : 0;

  if (data.total === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
        아직 학습 기록이 없습니다.
      </div>
    );
  }

  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={items}
            dataKey="value"
            nameKey="name"
            innerRadius={55}
            outerRadius={85}
            paddingAngle={2}
            stroke="hsl(var(--background))"
            strokeWidth={2}
          >
            {items.map((it) => (
              <Cell key={it.name} fill={it.color} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--background))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 8,
              fontSize: 12,
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <div className="text-2xl font-extrabold tabular-nums">{passRate}%</div>
        <div className="text-[10px] text-muted-foreground">PASS율</div>
      </div>
      <div className="flex flex-wrap justify-center gap-3 mt-2 text-xs">
        {items.map((it) => (
          <div key={it.name} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ backgroundColor: it.color }} />
            <span className="font-medium">{it.name}</span>
            <span className="text-muted-foreground tabular-nums">{it.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AchievementDonut;

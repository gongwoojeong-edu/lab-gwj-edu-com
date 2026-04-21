import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import type { LevelTrendPoint } from "@/lib/learningStats";

// 10단계 레벨 색상 — HSL 토큰을 활용한 점진적 색상
const LEVEL_COLORS: Record<string, string> = {
  L01: "hsl(200 80% 60%)",
  L02: "hsl(180 70% 50%)",
  L03: "hsl(150 65% 45%)",
  L04: "hsl(120 55% 50%)",
  L05: "hsl(80 65% 50%)",
  L06: "hsl(45 90% 55%)",
  L07: "hsl(30 90% 55%)",
  L08: "hsl(15 85% 55%)",
  L09: "hsl(0 80% 60%)",
  L10: "hsl(330 75% 55%)",
};

interface Props {
  points: LevelTrendPoint[];
}

const LevelTrendChart = ({ points }: Props) => {
  // Discover series (level codes present)
  const seriesSet = new Set<string>();
  points.forEach((p) => {
    Object.keys(p).forEach((k) => {
      if (k !== "date") seriesSet.add(k);
    });
  });
  const series = Array.from(seriesSet).sort();

  if (points.length === 0 || series.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
        최근 30일 학습 데이터가 없습니다.
      </div>
    );
  }

  const formatDate = (d: string) => d.slice(5).replace("-", "/");

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={points} margin={{ top: 8, right: 12, bottom: 4, left: -12 }}>
        <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={formatDate}
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          stroke="hsl(var(--border))"
        />
        <YAxis
          domain={[0, 100]}
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          stroke="hsl(var(--border))"
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--background))",
            border: "1px solid hsl(var(--border))",
            borderRadius: 8,
            fontSize: 12,
          }}
          labelFormatter={(v) => `날짜: ${v}`}
        />
        <Legend
          wrapperStyle={{ fontSize: 11 }}
          iconType="circle"
          iconSize={8}
        />
        {series.map((lv) => (
          <Line
            key={lv}
            type="monotone"
            dataKey={lv}
            stroke={LEVEL_COLORS[lv] ?? "hsl(var(--primary))"}
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
};

export default LevelTrendChart;

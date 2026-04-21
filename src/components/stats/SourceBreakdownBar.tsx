import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { SourceBreakdownPoint } from "@/lib/learningStats";

interface Props {
  points: SourceBreakdownPoint[];
}

const SOURCE_COLORS = {
  regular: "hsl(var(--primary))",
  review: "hsl(45 90% 55%)",
  assignment: "hsl(280 70% 60%)",
  test: "hsl(0 75% 60%)",
};

const SOURCE_LABEL = {
  regular: "정규",
  review: "복습",
  assignment: "과제",
  test: "시험",
};

const SourceBreakdownBar = ({ points }: Props) => {
  const formatDate = (d: string) => d.slice(5).replace("-", "/");
  const hasData = points.some((p) => p.regular + p.review + p.assignment + p.test > 0);

  if (!hasData) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
        해당 기간 학습 활동이 없습니다.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={points} margin={{ top: 8, right: 12, bottom: 4, left: -12 }}>
        <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={formatDate}
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          stroke="hsl(var(--border))"
        />
        <YAxis
          allowDecimals={false}
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
          formatter={(value: number, name: string) => [
            `${value}회`,
            SOURCE_LABEL[name as keyof typeof SOURCE_LABEL] ?? name,
          ]}
          labelFormatter={(v) => `날짜: ${v}`}
        />
        <Legend
          wrapperStyle={{ fontSize: 11 }}
          iconType="square"
          iconSize={10}
          formatter={(value) => SOURCE_LABEL[value as keyof typeof SOURCE_LABEL] ?? value}
        />
        <Bar dataKey="regular" stackId="a" fill={SOURCE_COLORS.regular} radius={[0, 0, 0, 0]} />
        <Bar dataKey="review" stackId="a" fill={SOURCE_COLORS.review} />
        <Bar dataKey="assignment" stackId="a" fill={SOURCE_COLORS.assignment} />
        <Bar dataKey="test" stackId="a" fill={SOURCE_COLORS.test} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
};

export default SourceBreakdownBar;

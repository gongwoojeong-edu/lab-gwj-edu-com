// ============================================================
// PraiseSparkle — 매우잘함/잘함 승인 시 학생 화면에 뜨는 1회성 칭찬 연출
//   - 큰 칭찬 문구 + 등급별 색상 그라데이션
//   - ✨/🌟 입자가 살짝 퍼지며 1.2초 뒤 자동 소거 (학습 흐름 방해 안 함)
//   - tailwindcss-animate(animate-* 클래스) 기반, 외부 라이브러리 없음
// ============================================================
import { useEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { GRADE_LABEL, type ApprovalGrade } from "@/lib/sentenceApprovals";

interface Props {
  grade: ApprovalGrade;
  text: string;
  /** 재학습(추가학습) 지적 사항을 해결하고 통과한 경우 — 전용 색/문구로 표시 */
  comeback?: boolean;
}

const PARTICLES = ["✨", "🌟", "💫", "⭐"];

const SPARKLE_SLOTS = (grade: ApprovalGrade) =>
  grade === "excellent" ? 8 : 5;

const GRADIENT: Record<string, string> = {
  excellent:
    "bg-gradient-to-r from-amber-500 via-rose-500 to-violet-500 bg-clip-text text-transparent",
  good:
    "bg-gradient-to-r from-sky-500 via-emerald-500 to-teal-500 bg-clip-text text-transparent",
  comeback:
    "bg-gradient-to-r from-emerald-500 via-teal-500 to-indigo-500 bg-clip-text text-transparent",
};

export const PraiseSparkle = ({ grade, text, comeback = false }: Props) => {
  const [visible, setVisible] = useState(true);

  // 컴포넌트 마운트 시 1회성 애니메이션. 1.2초 후 입자만 소거.
  useEffect(() => {
    const t = window.setTimeout(() => setVisible(false), 1200);
    return () => window.clearTimeout(t);
  }, []);

  const slots = useMemo(
    () =>
      Array.from({ length: comeback ? 7 : SPARKLE_SLOTS(grade) }, () => {
        const left = Math.round(Math.random() * 90) + 5; // 5~95%
        const delay = Math.round(Math.random() * 180); // 0~180ms
        const drift = Math.round(Math.random() * 40 - 20); // -20~20px
        const emoji = PARTICLES[Math.floor(Math.random() * PARTICLES.length)];
        return { left, delay, drift, emoji, id: `${left}-${delay}` };
      }),
    [grade, comeback],
  );

  if (!visible && !comeback && grade !== "excellent" && grade !== "good") return null;

  return (
    <div className="relative overflow-hidden rounded-lg bg-gradient-to-br from-amber-50 to-rose-50 dark:from-amber-500/10 dark:to-rose-500/10 border border-amber-300/50 dark:border-amber-500/30 px-4 py-3">
      {visible && (
        <div className="pointer-events-none absolute inset-0">
          {slots.map((s) => (
            <span
              key={s.id}
              className="absolute top-1/2 text-lg animate-ping"
              style={{
                left: `${s.left}%`,
                animationDelay: `${s.delay}ms`,
                animationDuration: "1.1s",
                transform: `translate(${s.drift}px, -50%)`,
                animationIterationCount: 1,
              }}
            >
              {s.emoji}
            </span>
          ))}
        </div>
      )}
      <div className="relative flex items-center gap-2">
        <Sparkles
          className={cn(
            "w-5 h-5 shrink-0",
            comeback
              ? "text-emerald-500"
              : grade === "excellent"
                ? "text-amber-500"
                : "text-sky-500",
          )}
        />
        <div className="min-w-0">
          <div
            className={cn(
              "text-xl font-black tracking-tight leading-snug break-words",
              (comeback ? GRADIENT.comeback : GRADIENT[grade]) ?? "text-foreground",
            )}
          >
            {text}
          </div>
          <div className="text-[11px] font-semibold text-muted-foreground">
            {comeback
              ? `재학습 해결 · ${GRADE_LABEL[grade]} · 선생님 칭찬`
              : `${GRADE_LABEL[grade]} · 선생님 칭찬`}
          </div>
        </div>
      </div>
    </div>
  );
};

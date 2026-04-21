import { LEVELS, type LevelCode } from "@/lib/levels";
import { MapPin } from "lucide-react";

interface Props {
  startLevel: LevelCode;
  currentLevel: LevelCode;
  currentNo: number;
}

const RoadmapStepper = ({ startLevel, currentLevel, currentNo }: Props) => {
  const startIdx = LEVELS.findIndex((l) => l.code === startLevel);
  const currIdx = LEVELS.findIndex((l) => l.code === currentLevel);
  const totalIdx = LEVELS.length - 1;

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between text-[10px] text-muted-foreground">
        <span>시작 {LEVELS[Math.max(0, startIdx)].label}</span>
        <span className="font-bold text-foreground">
          현재 {LEVELS[Math.max(0, currIdx)].label} · {currentNo}번
        </span>
        <span>목표 {LEVELS[totalIdx].label}</span>
      </div>

      <div className="relative">
        {/* base track */}
        <div className="absolute top-1/2 left-0 right-0 h-1 -translate-y-1/2 rounded-full bg-muted" />
        {/* filled */}
        <div
          className="absolute top-1/2 left-0 h-1 -translate-y-1/2 rounded-full bg-gradient-to-r from-primary/60 to-primary"
          style={{
            width: `${totalIdx === 0 ? 0 : (Math.max(0, currIdx) / totalIdx) * 100}%`,
          }}
        />

        <div className="relative flex justify-between">
          {LEVELS.map((lv, i) => {
            const isStart = i === startIdx;
            const isCurrent = i === currIdx;
            const isPast = i < currIdx;
            const isFuture = i > currIdx;
            return (
              <div key={lv.code} className="flex flex-col items-center gap-1.5 w-7">
                <div
                  className={[
                    "size-3.5 rounded-full border-2 transition-all flex items-center justify-center",
                    isCurrent
                      ? "bg-primary border-primary scale-150 shadow-lg shadow-primary/40"
                      : isPast
                        ? "bg-primary border-primary"
                        : isStart
                          ? "bg-background border-primary"
                          : "bg-background border-muted-foreground/30",
                  ].join(" ")}
                >
                  {isCurrent && <MapPin className="size-2.5 text-primary-foreground" strokeWidth={3} />}
                </div>
                <div
                  className={[
                    "text-[9px] font-bold tabular-nums",
                    isCurrent ? "text-primary" : isFuture ? "text-muted-foreground/50" : "text-foreground",
                  ].join(" ")}
                >
                  {lv.code}
                </div>
                <div className="text-[8px] text-muted-foreground hidden sm:block">{lv.label}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default RoadmapStepper;

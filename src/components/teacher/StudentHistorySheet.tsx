import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { LEVEL_LABEL, type LevelCode } from "@/lib/levels";
import {
  fetchAchievementDistribution,
  fetchLevelTrend,
  fetchSourceBreakdown,
  fetchRecentAttempts,
  type AchievementDistribution,
  type LevelTrendPoint,
  type SourceBreakdownPoint,
  type RecentAttemptRow,
} from "@/lib/learningStats";
import AchievementDonut from "@/components/stats/AchievementDonut";
import RoadmapStepper from "@/components/stats/RoadmapStepper";
import LevelTrendChart from "@/components/stats/LevelTrendChart";
import SourceBreakdownBar from "@/components/stats/SourceBreakdownBar";
import { CheckCircle2, XCircle } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string | null;
  studentName: string | null;
  studentNo: string | null;
}

interface ProfileLite {
  start_level: LevelCode;
  current_level: LevelCode;
  current_no: number;
}

const SOURCE_LABEL: Record<string, string> = {
  regular: "정규",
  review: "복습",
  assignment: "과제",
  test: "시험",
};

const SOURCE_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  regular: "secondary",
  review: "outline",
  assignment: "default",
  test: "destructive",
};

const StudentHistorySheet = ({ open, onOpenChange, userId, studentName, studentNo }: Props) => {
  const [profile, setProfile] = useState<ProfileLite | null>(null);
  const [achievement, setAchievement] = useState<AchievementDistribution | null>(null);
  const [trend, setTrend] = useState<LevelTrendPoint[]>([]);
  const [breakdown, setBreakdown] = useState<SourceBreakdownPoint[]>([]);
  const [recent, setRecent] = useState<RecentAttemptRow[]>([]);
  const [days, setDays] = useState<7 | 14 | 30>(14);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !userId) return;
    let mounted = true;
    setLoading(true);

    Promise.all([
      supabase
        .from("student_profiles")
        .select("start_level, current_level, current_no")
        .eq("user_id", userId)
        .maybeSingle(),
      fetchAchievementDistribution(userId),
      fetchLevelTrend(userId, 30),
      fetchRecentAttempts(userId, 20),
    ])
      .then(([{ data: p }, ach, tr, rec]) => {
        if (!mounted) return;
        setProfile(
          p
            ? {
                start_level: (p.start_level as LevelCode) ?? "L01",
                current_level: (p.current_level as LevelCode) ?? "L01",
                current_no: Number(p.current_no ?? 1),
              }
            : null,
        );
        setAchievement(ach);
        setTrend(tr);
        setRecent(rec);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [open, userId]);

  // Re-fetch breakdown when days changes
  useEffect(() => {
    if (!open || !userId) return;
    let mounted = true;
    fetchSourceBreakdown(userId, days).then((b) => {
      if (mounted) setBreakdown(b);
    });
    return () => {
      mounted = false;
    };
  }, [open, userId, days]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-3xl overflow-y-auto p-0"
      >
        <div className="p-6 space-y-5">
          <SheetHeader className="space-y-1">
            <SheetTitle className="flex items-center gap-2">
              <span className="text-xl font-extrabold">{studentName ?? "학생"}</span>
              {studentNo && (
                <Badge variant="outline" className="font-mono text-[10px]">
                  #{studentNo}
                </Badge>
              )}
            </SheetTitle>
            <SheetDescription>
              {profile
                ? `현재 ${LEVEL_LABEL[profile.current_level]} · ${profile.current_no}번 · 시작 ${LEVEL_LABEL[profile.start_level]}`
                : "학습 이력 분석"}
            </SheetDescription>
          </SheetHeader>

          {loading && !achievement ? (
            <div className="text-center text-sm text-muted-foreground py-12">불러오는 중…</div>
          ) : (
            <div className="space-y-5">
              {/* Roadmap */}
              <Card className="p-4">
                <h3 className="text-sm font-bold mb-3">학습 로드맵 (L01 → L10)</h3>
                {profile ? (
                  <RoadmapStepper
                    startLevel={profile.start_level}
                    currentLevel={profile.current_level}
                    currentNo={profile.current_no}
                  />
                ) : (
                  <div className="text-xs text-muted-foreground py-3 text-center">
                    프로필 정보를 찾을 수 없습니다.
                  </div>
                )}
              </Card>

              {/* Donut + Source breakdown side-by-side on desktop */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <Card className="p-4">
                  <h3 className="text-sm font-bold mb-2">전체 성취 분포</h3>
                  {achievement && <AchievementDonut data={achievement} />}
                </Card>

                <Card className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-bold">소스별 학습량</h3>
                    <div className="inline-flex rounded-md border border-border overflow-hidden">
                      {([7, 14, 30] as const).map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setDays(d)}
                          className={[
                            "px-2 py-0.5 text-[11px] font-bold transition-colors",
                            days === d
                              ? "bg-primary text-primary-foreground"
                              : "bg-background text-muted-foreground hover:bg-muted",
                          ].join(" ")}
                        >
                          {d}일
                        </button>
                      ))}
                    </div>
                  </div>
                  <SourceBreakdownBar points={breakdown} />
                </Card>
              </div>

              {/* Level trend */}
              <Card className="p-4">
                <h3 className="text-sm font-bold mb-2">레벨별 통합점수 추이 (최근 30일)</h3>
                <LevelTrendChart points={trend} />
              </Card>

              {/* Recent log */}
              <Card className="p-4">
                <h3 className="text-sm font-bold mb-3">최근 시도 기록 (20건)</h3>
                {recent.length === 0 ? (
                  <div className="text-xs text-muted-foreground py-4 text-center">
                    학습 기록이 없습니다.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border text-left text-[10px] text-muted-foreground">
                          <th className="py-1.5 pr-2">날짜</th>
                          <th className="py-1.5 pr-2">문장</th>
                          <th className="py-1.5 pr-2">소스</th>
                          <th className="py-1.5 pr-2">시도</th>
                          <th className="py-1.5 pr-2 text-right">분석</th>
                          <th className="py-1.5 pr-2 text-right">단어</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recent.map((r) => (
                          <tr key={r.id} className="border-b border-border/40">
                            <td className="py-1.5 pr-2 tabular-nums">
                              {new Date(r.completed_at).toLocaleDateString("ko-KR", {
                                month: "2-digit",
                                day: "2-digit",
                              })}
                            </td>
                            <td className="py-1.5 pr-2 font-mono">{r.sentence_id}</td>
                            <td className="py-1.5 pr-2">
                              <Badge
                                variant={SOURCE_VARIANT[r.attempt_source] ?? "secondary"}
                                className="text-[9px] px-1.5 py-0 font-bold"
                              >
                                {SOURCE_LABEL[r.attempt_source] ?? r.attempt_source}
                              </Badge>
                            </td>
                            <td className="py-1.5 pr-2 tabular-nums">{r.attempt_no}</td>
                            <td className="py-1.5 pr-2 text-right">
                              <span className="inline-flex items-center gap-1">
                                {r.analysis_passed ? (
                                  <CheckCircle2 className="size-3 text-emerald-600" />
                                ) : (
                                  <XCircle className="size-3 text-muted-foreground" />
                                )}
                                <span className="tabular-nums">
                                  {Math.round(r.analysis_match_rate * 100)}%
                                </span>
                              </span>
                            </td>
                            <td className="py-1.5 pr-2 text-right">
                              <span className="inline-flex items-center gap-1">
                                {r.word_test_passed ? (
                                  <CheckCircle2 className="size-3 text-emerald-600" />
                                ) : (
                                  <XCircle className="size-3 text-muted-foreground" />
                                )}
                                <span className="tabular-nums">
                                  {Math.round(r.word_test_score * 100)}%
                                </span>
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>

              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                  닫기
                </Button>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default StudentHistorySheet;

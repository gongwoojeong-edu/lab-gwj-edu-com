import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, LogOut, Play, Trophy, Sparkles, Flame, Gem } from "lucide-react";
import { resolveNextSentence } from "@/lib/nextSentence";
import { signOut, useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { SENTENCES, type Sentence } from "@/data/sentences";
import { LEVEL_LABEL } from "@/lib/levels";
import { fetchStudentRewards, type StudentRewards } from "@/lib/rewards";
import type { StudentProfile } from "@/lib/studentProfile";
import { useViewMode } from "@/hooks/useViewMode";
import { cn } from "@/lib/utils";

interface RecentItem {
  sentence: Sentence;
  status: "pass" | "fail";
  updated_at: string;
}

const StudentHome = () => {
  const navigate = useNavigate();
  const { user, roles } = useAuth();
  const { setMode } = useViewMode();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [rewards, setRewards] = useState<StudentRewards | null>(null);
  const [next, setNext] = useState<Sentence | null>(null);
  const [done, setDone] = useState(false);
  const [recent, setRecent] = useState<RecentItem[]>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      const [r, rw] = await Promise.all([resolveNextSentence(), fetchStudentRewards()]);
      if (!mounted) return;
      setProfile(r.profile);
      setNext(r.sentence);
      setDone(r.done);
      setRewards(rw);

      if (user) {
        const { data } = await supabase
          .from("sentence_progress")
          .select("sentence_id, status, updated_at, passed_at")
          .eq("user_id", user.id)
          .in("status", ["pass", "fail"])
          .order("updated_at", { ascending: false })
          .limit(5);
        const rows = (data ?? []) as { sentence_id: string; status: "pass" | "fail"; updated_at: string; passed_at: string | null }[];
        const enriched: RecentItem[] = rows
          .map((row) => {
            const s = SENTENCES.find((x) => x.id === row.sentence_id);
            return s ? { sentence: s, status: row.status, updated_at: row.passed_at ?? row.updated_at } : null;
          })
          .filter(Boolean) as RecentItem[];
        if (mounted) setRecent(enriched);
      }
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [user?.id]);

  const handleStart = () => {
    if (next) navigate(`/learn/sentence/${encodeURIComponent(next.id)}`);
  };

  const startLabel = next ? `${next.id} 학습 시작` : "다음 Passage 없음";

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-secondary/40">
      {/* Header */}
      <header className="sticky top-0 z-30 backdrop-blur-md bg-background/70 border-b border-border">
        <div className="max-w-5xl mx-auto px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-primary-foreground" />
            </div>
            <div>
              <div className="text-sm font-bold text-foreground leading-none">공우정 영어</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                {profile?.student_no ?? "—"} · {profile?.display_name ?? ""}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            {rewards && (
              <>
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-streak/15 text-streak text-xs font-bold">
                  <Flame className="w-3.5 h-3.5" />
                  {rewards.current_streak}
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-primary/15 text-primary text-xs font-bold">
                  <Gem className="w-3.5 h-3.5" />
                  {rewards.points}
                </span>
              </>
            )}
            {(roles.includes("teacher") || roles.includes("admin")) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setMode("teacher");
                  navigate("/teacher");
                }}
              >
                🛠 선생님 화면
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => signOut()}>
              <LogOut className="w-4 h-4 mr-1" /> 로그아웃
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-10 space-y-8">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : done ? (
          <Card className="p-10 text-center space-y-4 bg-gradient-to-br from-primary/10 to-accent/10 border-primary/30">
            <Trophy className="w-16 h-16 mx-auto text-primary" />
            <h1 className="text-3xl font-extrabold text-primary">학습 완료! 🎓</h1>
            <p className="text-muted-foreground">
              모든 레벨을 통과했어요. 정말 수고 많았습니다.
            </p>
          </Card>
        ) : (
          <>
            {/* Hero start card */}
            <Card className="relative overflow-hidden p-8 sm:p-10 bg-gradient-to-br from-primary to-accent text-primary-foreground border-0 shadow-2xl">
              <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-white/10 blur-2xl" />
              <div className="absolute -bottom-16 -left-10 w-56 h-56 rounded-full bg-white/5 blur-3xl" />
              <div className="relative space-y-6">
                <div className="space-y-1">
                  <div className="text-xs uppercase tracking-widest opacity-80">오늘의 학습</div>
                  <h1 className="text-3xl sm:text-4xl font-extrabold">
                    {next ? LEVEL_LABEL[next.level] ?? next.level : "—"}
                  </h1>
                  <div className="text-sm opacity-90">
                    {next ? `${next.id} · Passage ${next.no}` : "다음 Passage가 없습니다"}
                  </div>
                </div>
                {next && (
                  <p className="text-base sm:text-lg leading-relaxed font-medium opacity-95 line-clamp-3">
                    {next.english}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    size="lg"
                    onClick={handleStart}
                    disabled={!next}
                    className="bg-white text-primary hover:bg-white/90 font-bold text-base h-12 px-8 shadow-lg"
                  >
                    <Play className="w-5 h-5 mr-2 fill-primary" />
                    {startLabel}
                  </Button>
                  <span className="text-xs opacity-80">
                    1단어 학습 → 2구문 분석 + 해석 → 3단어 테스트
                  </span>
                </div>
              </div>
            </Card>

            {/* Recent */}
            <section className="space-y-3">
              <h2 className="text-sm font-bold text-foreground/80 uppercase tracking-wider">
                최근 학습 Passage
              </h2>
              {recent.length === 0 ? (
                <Card className="p-6 text-center text-sm text-muted-foreground">
                  아직 학습한 Passage가 없어요. 위 버튼을 눌러 시작하세요.
                </Card>
              ) : (
                <div className="grid gap-3 sm:grid-cols-3">
                  {recent.map(({ sentence, status, updated_at }) => {
                    const isFail = status === "fail";
                    return (
                      <Card
                        key={sentence.id}
                        className={cn(
                          "p-4 space-y-2 transition-colors",
                          isFail
                            ? "border-amber-500/40 hover:border-amber-500/60"
                            : "border-primary/20 hover:border-primary/40",
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-primary">{sentence.id}</span>
                          <span
                            className={cn(
                              "px-2 py-0.5 rounded-full text-[10px] font-extrabold",
                              isFail ? "bg-amber-500 text-white" : "bg-emerald-500 text-white",
                            )}
                          >
                            {isFail ? "미통" : "PASS"}
                          </span>
                        </div>
                        <p className="text-xs text-foreground/80 line-clamp-2 min-h-[2.5em]">
                          {sentence.english}
                        </p>
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-[10px] text-muted-foreground">
                            {new Date(updated_at).toLocaleString("ko-KR", {
                              month: "2-digit",
                              day: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>
                          {isFail && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => navigate(`/learn/sentence/${encodeURIComponent(sentence.id)}`)}
                            >
                              다시 도전
                            </Button>
                          )}
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
};

export default StudentHome;

// ============================================================
// AnalysisRequests — 선생님: 자기 첨삭 요청 실시간 대시보드
// ============================================================
import { useEffect, useMemo, useState } from "react";
import { TeacherLayout } from "@/components/teacher/TeacherLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Bell,
  BellOff,
  CheckCircle2,
  XCircle,
  Volume2,
  PlayCircle,
  Eye,
  ShieldCheck,
  Loader2,
} from "lucide-react";
import {
  approveAllPending,
  approveReviewRequest,
  fetchPendingRequests,
  rejectReviewRequest,
  subscribeToReviewRequests,
  type AnalysisReviewRequest,
} from "@/lib/analysisReview";
import { loadSoundPrefs, saveSoundPrefs, playNotifyDing } from "@/lib/notifySound";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

interface StudentInfo {
  user_id: string;
  display_name: string | null;
  student_no: string;
}

const AnalysisRequests = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState<AnalysisReviewRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<Record<string, StudentInfo>>({});
  const [prefs, setPrefs] = useState(() => loadSoundPrefs());

  const refresh = async () => {
    setLoading(true);
    const list = await fetchPendingRequests();
    setRows(list);
    const userIds = Array.from(new Set(list.map((r) => r.user_id)));
    if (userIds.length > 0) {
      const { data } = await supabase
        .from("student_profiles")
        .select("user_id, display_name, student_no")
        .in("user_id", userIds);
      const map: Record<string, StudentInfo> = {};
      (data ?? []).forEach((s) => {
        map[s.user_id] = s as StudentInfo;
      });
      setStudents(map);
    }
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    const unsub = subscribeToReviewRequests((event, row) => {
      if (event === "INSERT" && row.status === "pending") {
        playNotifyDing();
      }
      // 변경이 있을 때마다 목록 새로고침 (가장 단순)
      refresh();
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updatePrefs = (next: Parameters<typeof saveSoundPrefs>[0]) => {
    setPrefs(next);
    saveSoundPrefs(next);
  };

  const handleApprove = async (id: string) => {
    try {
      await approveReviewRequest(id);
      toast({ title: "승인 완료" });
    } catch (e) {
      toast({ title: "승인 실패", description: String(e), variant: "destructive" });
    }
  };

  const handleReject = async (id: string) => {
    const note = window.prompt("반려 사유 (선택):") ?? undefined;
    try {
      await rejectReviewRequest(id, note);
      toast({ title: "반려 처리됨" });
    } catch (e) {
      toast({ title: "반려 실패", description: String(e), variant: "destructive" });
    }
  };

  const handleApproveAll = async () => {
    if (rows.length === 0) return;
    if (!window.confirm(`현재 대기 ${rows.length}건을 모두 승인할까요?`)) return;
    const n = await approveAllPending();
    toast({ title: `${n}건 일괄 승인 완료` });
  };

  const groupCounts = useMemo(() => {
    const normal = rows.filter((r) => r.track === "normal").length;
    const fail = rows.filter((r) => r.track === "fail_assist").length;
    return { normal, fail };
  }, [rows]);

  const goReview = (req: AnalysisReviewRequest) => {
    // 선생님 전용 사이드바이사이드 검토 화면 (좌: 학생 / 우: 마스터)
    navigate(`/teacher/review/${req.id}`);
  };

  return (
    <TeacherLayout>
      <div className="max-w-5xl mx-auto p-6 space-y-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-extrabold text-foreground">선생님분석본보기요청</h1>
            <p className="text-sm text-muted-foreground">
              학생들이 보낸 자기 첨삭 요청을 실시간으로 처리합니다.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => playNotifyDing(0.6)}
              title="알림음 미리듣기"
            >
              <PlayCircle className="w-4 h-4 mr-1" /> 미리듣기
            </Button>
            <Button
              size="sm"
              onClick={handleApproveAll}
              disabled={rows.length === 0}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              🔥 전원 승인 ({rows.length})
            </Button>
          </div>
        </div>

        <Card className="p-4 flex items-center gap-6 flex-wrap">
          <div className="flex items-center gap-2">
            {prefs.enabled ? (
              <Bell className="w-4 h-4 text-primary" />
            ) : (
              <BellOff className="w-4 h-4 text-muted-foreground" />
            )}
            <Label htmlFor="snd" className="text-sm font-bold">
              알림음
            </Label>
            <Switch
              id="snd"
              checked={prefs.enabled}
              onCheckedChange={(v) => updatePrefs({ ...prefs, enabled: v })}
            />
          </div>
          <div className="flex items-center gap-2 min-w-[200px] flex-1 max-w-xs">
            <Volume2 className="w-4 h-4 text-muted-foreground" />
            <Slider
              value={[Math.round(prefs.volume * 100)]}
              min={0}
              max={100}
              step={5}
              onValueChange={(arr) => updatePrefs({ ...prefs, volume: (arr[0] ?? 50) / 100 })}
              disabled={!prefs.enabled}
            />
            <span className="text-xs text-muted-foreground tabular-nums w-8">
              {Math.round(prefs.volume * 100)}
            </span>
          </div>
          <div className="text-xs text-muted-foreground">
            🟢 정상 {groupCounts.normal}건 · 🟡 미통 보조 {groupCounts.fail}건
          </div>
        </Card>

        {loading ? (
          <div className="py-20 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : rows.length === 0 ? (
          <Card className="p-12 text-center text-sm text-muted-foreground">
            현재 대기 중인 요청이 없습니다. 학생이 요청을 보내면 여기에 자동으로 나타납니다.
          </Card>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => {
              const s = students[r.user_id];
              return (
                <Card
                  key={r.id}
                  className={cn(
                    "p-4 flex items-center justify-between gap-3 flex-wrap border-2",
                    r.track === "fail_assist"
                      ? "border-amber-500/40 bg-amber-50/20 dark:bg-amber-500/5"
                      : "border-emerald-500/30 bg-emerald-50/20 dark:bg-emerald-500/5",
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span
                      className={cn(
                        "px-2 py-0.5 rounded-md text-[10px] font-extrabold whitespace-nowrap",
                        r.track === "fail_assist"
                          ? "bg-amber-500 text-white"
                          : "bg-emerald-600 text-white",
                      )}
                    >
                      {r.track === "fail_assist" ? "미통 보조" : "정상"}
                    </span>
                    <div className="min-w-0">
                      <div className="font-bold text-foreground">
                        {s?.display_name ?? s?.student_no ?? r.user_id.slice(0, 8)}
                        <span className="ml-2 text-xs text-muted-foreground font-mono">
                          {r.sentence_id}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        분석률 {Math.round(Number(r.analysis_rate) * 100)}% · 시도 {r.attempt_no}회 ·{" "}
                        {new Date(r.requested_at).toLocaleTimeString("ko-KR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => goReview(r)}>
                      <Eye className="w-4 h-4 mr-1" /> 보기
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => window.open(`/teacher/compare/${r.sentence_id}/${r.user_id}`, "_blank")}
                      title="시각 비교 (마스터 vs 학생, 새 탭)"
                    >
                      🖼 시각 비교
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleReject(r.id)}
                    >
                      <XCircle className="w-4 h-4 mr-1" /> 반려
                    </Button>
                    <Button
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                      onClick={() => handleApprove(r.id)}
                    >
                      <CheckCircle2 className="w-4 h-4 mr-1" /> 승인
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        <Card className="p-3 text-[11px] text-muted-foreground bg-muted/30 flex items-center gap-2">
          <ShieldCheck className="w-3.5 h-3.5" />
          승인 시 학생 화면에 마스터 답안과 비교 화면이 열립니다. 학생 답안은 잠겨 있어 베껴 쓰기가 차단됩니다.
        </Card>
      </div>
    </TeacherLayout>
  );
};

export default AnalysisRequests;

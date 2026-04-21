// ============================================================
// PrintQueue — 선생님: 학생 시험지(핸드아웃) 인쇄 요청 대기열
// ============================================================
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { TeacherLayout } from "@/components/teacher/TeacherLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Printer, FileText, CheckCircle2, Loader2 } from "lucide-react";
import {
  fetchPendingPrintRequests,
  markPrintRequestHandled,
  subscribeToPrintRequests,
  type PrintRequest,
} from "@/lib/printRequests";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface StudentInfo {
  user_id: string;
  display_name: string | null;
  student_no: string;
}

const PrintQueue = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState<PrintRequest[]>([]);
  const [students, setStudents] = useState<Record<string, StudentInfo>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const refresh = async () => {
    setLoading(true);
    const list = await fetchPendingPrintRequests();
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
    const unsub = subscribeToPrintRequests(() => refresh());
    return unsub;
  }, []);

  const handleOpenHandout = (req: PrintRequest) => {
    window.open(
      `/teacher/handout/${encodeURIComponent(req.sentence_id)}?student=${req.user_id}`,
      "_blank",
    );
  };

  const handleMark = async (id: string) => {
    setBusy((p) => ({ ...p, [id]: true }));
    try {
      await markPrintRequestHandled(id);
      toast({ title: "처리 완료" });
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch (e) {
      toast({ title: "처리 실패", description: String(e), variant: "destructive" });
    } finally {
      setBusy((p) => ({ ...p, [id]: false }));
    }
  };

  return (
    <TeacherLayout>
      <div className="p-6 max-w-4xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Printer className="size-6 text-primary" /> 인쇄 대기열
            <span className="text-sm font-normal text-muted-foreground">
              · 대기 {rows.length}건
            </span>
          </h1>
        </div>

        {loading ? (
          <Card className="p-10 flex items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </Card>
        ) : rows.length === 0 ? (
          <Card className="p-10 text-center text-sm text-muted-foreground">
            대기 중인 시험지 요청이 없습니다.
          </Card>
        ) : (
          <div className="space-y-2">
            {rows.map((req) => {
              const s = students[req.user_id];
              return (
                <Card key={req.id} className="p-4 flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-bold text-foreground">
                        {s?.display_name ?? "학생"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        ({s?.student_no ?? "—"})
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      지문 <span className="font-mono text-foreground">{req.sentence_id}</span>
                      {" · "}
                      {new Date(req.requested_at).toLocaleString("ko-KR", {
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => handleOpenHandout(req)}>
                      <FileText className="size-4 mr-1" /> 핸드아웃 PDF
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleMark(req.id)}
                      disabled={!!busy[req.id]}
                    >
                      <CheckCircle2 className="size-4 mr-1" /> 처리 완료
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </TeacherLayout>
  );
};

export default PrintQueue;

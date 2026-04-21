// ============================================================
// PrintQueue — 선생님: 학생 시험지(핸드아웃) 인쇄 요청 대기열
// 워크플로:
//  - [PDF] 클릭 → 새 탭으로 핸드아웃 열기 (이 시점엔 처리 마킹 X)
//  - 새 탭 핸드아웃 페이지에서 실제 인쇄(window.print) 실행 시
//    onbeforeprint 가 ?fromQueue=1&reqId=... 를 감지하고 처리완료 마킹.
//  - 처리되면 실시간 구독으로 행이 사라짐.
// ============================================================
import { useEffect, useState } from "react";
import { TeacherLayout } from "@/components/teacher/TeacherLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Printer, FileText, Loader2 } from "lucide-react";
import {
  fetchPendingPrintRequests,
  subscribeToPrintRequests,
  type PrintRequest,
} from "@/lib/printRequests";
import { supabase } from "@/integrations/supabase/client";

interface StudentInfo {
  user_id: string;
  display_name: string | null;
  student_no: string;
}

const PrintQueue = () => {
  const [rows, setRows] = useState<PrintRequest[]>([]);
  const [students, setStudents] = useState<Record<string, StudentInfo>>({});
  const [loading, setLoading] = useState(true);

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

  const handleOpenPdf = (req: PrintRequest) => {
    const url =
      `/teacher/handout/${encodeURIComponent(req.sentence_id)}` +
      `?student=${req.user_id}&fromQueue=1&reqId=${req.id}`;
    window.open(url, "_blank");
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

        <Card className="px-4 py-2 text-xs text-muted-foreground bg-muted/30 font-kr">
          [PDF] 버튼 클릭 시 새 탭에서 핸드아웃이 열립니다. 그 화면에서{" "}
          <b>인쇄</b> 버튼을 누르면 자동으로 처리완료 처리되고 학습결과함으로 합류합니다.
        </Card>

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
                    <Button size="sm" onClick={() => handleOpenPdf(req)}>
                      <FileText className="size-4 mr-1" /> PDF
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

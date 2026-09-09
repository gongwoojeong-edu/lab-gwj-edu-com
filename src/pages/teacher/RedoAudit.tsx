import { useEffect, useMemo, useState } from "react";
import { TeacherLayout } from "@/components/teacher/TeacherLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2, RotateCcw, AlertTriangle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { fetchRedoAudit, clearRedoRequests, type RedoAuditRow } from "@/lib/redoAudit";

const keyOf = (r: RedoAuditRow) => `${r.userId}|${r.sentenceId}`;

const RedoAudit = () => {
  const [rows, setRows] = useState<RedoAuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = async () => {
    setLoading(true);
    try {
      const list = await fetchRedoAudit();
      setRows(list);
      setSelected(new Set());
    } catch (e) {
      toast({ title: "불러오기 실패", description: String(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const outOfScope = useMemo(() => rows.filter((r) => !r.inScope), [rows]);
  const inScope = useMemo(() => rows.filter((r) => r.inScope), [rows]);

  const toggle = (k: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  const clearSelected = async () => {
    const targets = outOfScope.filter((r) => selected.has(keyOf(r)));
    if (targets.length === 0) return;
    setBusy(true);
    try {
      await clearRedoRequests(
        targets.map((r) => ({ userId: r.userId, sentenceId: r.sentenceId })),
      );
      toast({ title: `재학습 요청 ${targets.length}건을 해제했습니다.` });
      await load();
    } catch (e) {
      toast({ title: "해제 실패", description: String(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const selectOld = () => {
    const cutoff = Date.now() - 21 * 24 * 60 * 60 * 1000;
    setSelected(
      new Set(
        outOfScope
          .filter((r) => new Date(r.requestedAt).getTime() < cutoff)
          .map(keyOf),
      ),
    );
  };

  const renderTable = (list: RedoAuditRow[], selectable: boolean) => (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border text-left text-xs text-muted-foreground">
          {selectable && <th className="py-2 px-2 w-8" />}
          <th className="py-2 px-2">학생</th>
          <th className="py-2 px-2">요청 문장</th>
          <th className="py-2 px-2">요청 교재</th>
          <th className="py-2 px-2">현재 메인덱</th>
          <th className="py-2 px-2">요청일</th>
        </tr>
      </thead>
      <tbody>
        {list.map((r) => (
          <tr key={keyOf(r)} className="border-b border-border/50 align-top">
            {selectable && (
              <td className="py-2 px-2">
                <Checkbox
                  checked={selected.has(keyOf(r))}
                  onCheckedChange={() => toggle(keyOf(r))}
                />
              </td>
            )}
            <td className="py-2 px-2 whitespace-nowrap">
              <div className="font-medium">{r.studentName}</div>
              <div className="text-xs text-muted-foreground">{r.studentNo}</div>
            </td>
            <td className="py-2 px-2 font-mono text-xs text-primary">
              {r.sentenceId}
              {r.memo && (
                <div className="font-sans text-xs text-muted-foreground mt-1 max-w-[220px]">
                  {r.memo}
                </div>
              )}
            </td>
            <td className="py-2 px-2 text-xs">{r.bookLabel}</td>
            <td className="py-2 px-2 text-xs text-muted-foreground">{r.currentBookLabel}</td>
            <td className="py-2 px-2 text-xs text-muted-foreground whitespace-nowrap">
              {new Date(r.requestedAt).toLocaleDateString("ko-KR")}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <TeacherLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-5">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <RotateCcw className="size-6 text-primary" /> 재학습 점검
          </h1>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            새로고침
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="animate-spin text-primary" />
          </div>
        ) : (
          <>
            <Card className="p-4 space-y-3 border-amber-300">
              <div className="flex flex-wrap items-center gap-2">
                <AlertTriangle className="size-5 text-amber-500" />
                <h2 className="font-semibold">진도 범위 밖 요청</h2>
                <Badge variant="destructive">{outOfScope.length}건</Badge>
                <span className="text-xs text-muted-foreground">
                  학생 화면에 뜨지 않습니다. 해제하거나 진도를 그 교재로 되돌려 주세요.
                </span>
              </div>
              {outOfScope.length === 0 ? (
                <div className="text-sm text-muted-foreground py-6 text-center">
                  범위 밖 재학습 요청이 없습니다.
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={selectOld}>
                      3주 이상 지난 요청 선택
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={busy || selected.size === 0}
                      onClick={() => void clearSelected()}
                    >
                      {busy && <Loader2 className="size-3 mr-1 animate-spin" />}
                      선택 {selected.size}건 요청 해제
                    </Button>
                  </div>
                  <div className="overflow-x-auto">{renderTable(outOfScope, true)}</div>
                </>
              )}
            </Card>

            <Card className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <h2 className="font-semibold">학생 화면에 표시 중</h2>
                <Badge variant="secondary">{inScope.length}건</Badge>
              </div>
              {inScope.length === 0 ? (
                <div className="text-sm text-muted-foreground py-6 text-center">
                  진행 중인 재학습 요청이 없습니다.
                </div>
              ) : (
                <div className="overflow-x-auto">{renderTable(inScope, false)}</div>
              )}
            </Card>
          </>
        )}
      </div>
    </TeacherLayout>
  );
};

export default RedoAudit;

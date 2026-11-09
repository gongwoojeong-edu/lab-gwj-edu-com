import { useEffect, useMemo, useState } from "react";
import { TeacherLayout } from "@/components/teacher/TeacherLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, RotateCcw, Search, AlertTriangle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { fetchRedoAudit, clearRedoRequests, type RedoAuditRow } from "@/lib/redoAudit";

const keyOf = (r: RedoAuditRow) => `${r.userId}|${r.sentenceId}`;

const RedoAudit = () => {
  const [rows, setRows] = useState<RedoAuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [confirmTargets, setConfirmTargets] = useState<RedoAuditRow[] | null>(null);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const list = await fetchRedoAudit();
      setRows(list);
      setSelected(new Set());
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setLoadError(msg);
      toast({ title: "재학습 목록을 불러오지 못했어요", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) => r.studentName.toLowerCase().includes(q) || r.studentNo.toLowerCase().includes(q),
    );
  }, [rows, query]);

  const studentCount = useMemo(() => new Set(visible.map((r) => r.userId)).size, [visible]);
  const selectedRows = useMemo(() => rows.filter((r) => selected.has(keyOf(r))), [rows, selected]);
  const allVisibleSelected = visible.length > 0 && visible.every((r) => selected.has(keyOf(r)));

  const toggle = (k: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visible.forEach((r) => next.delete(keyOf(r)));
      else visible.forEach((r) => next.add(keyOf(r)));
      return next;
    });
  };

  const selectOld = () => {
    const cutoff = Date.now() - 21 * 24 * 60 * 60 * 1000;
    setSelected(
      new Set(visible.filter((r) => new Date(r.requestedAt).getTime() < cutoff).map(keyOf)),
    );
  };

  const runCancel = async () => {
    const targets = confirmTargets ?? [];
    setConfirmTargets(null);
    if (targets.length === 0) return;
    setBusy(true);
    try {
      await clearRedoRequests(targets.map((r) => ({ userId: r.userId, sentenceId: r.sentenceId })));
      toast({ title: `재학습 요청 ${targets.length}건을 취소했어요.` });
      await load();
    } catch (e) {
      toast({
        title: "취소하지 못했어요",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <TeacherLayout>
      <div className="p-6 max-w-6xl mx-auto space-y-5">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <RotateCcw className="size-6 text-primary" /> 재학습 점검
          </h1>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            새로고침
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          학생에게 아직 남아 있는 재학습 요청입니다. 필요 없는 요청을 골라 취소하면 학생 알림함과
          진도에서 바로 빠집니다. 지난 제출·첨삭 기록은 그대로 남습니다.
        </p>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="animate-spin text-primary" />
          </div>
        ) : loadError ? (
          <Card className="p-6 flex flex-col items-center gap-3 text-center">
            <AlertTriangle className="size-6 text-destructive" />
            <div className="text-sm">재학습 목록을 불러오지 못했어요.</div>
            <Button size="sm" onClick={() => void load()}>
              다시 불러오기
            </Button>
          </Card>
        ) : (
          <Card className="p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="학생 이름·학번 검색"
                  className="pl-8 w-56"
                  aria-label="학생 이름 또는 학번 검색"
                />
              </div>
              <Badge variant="secondary">
                학생 {studentCount}명 · {visible.length}건
              </Badge>
              <div className="flex-1" />
              <Button size="sm" variant="outline" onClick={selectOld} disabled={visible.length === 0}>
                3주 이상 지난 요청 선택
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={busy || selectedRows.length === 0}
                onClick={() => setConfirmTargets(selectedRows)}
              >
                {busy && <Loader2 className="size-3 mr-1 animate-spin" />}
                선택 {selectedRows.length}건 취소
              </Button>
            </div>

            {visible.length === 0 ? (
              <div className="text-sm text-muted-foreground py-10 text-center">
                {query ? "검색한 학생에게 남은 재학습이 없어요." : "남아 있는 재학습 요청이 없어요."}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="py-2 px-2 w-8">
                        <Checkbox
                          checked={allVisibleSelected}
                          onCheckedChange={toggleAllVisible}
                          aria-label="보이는 요청 모두 선택"
                        />
                      </th>
                      <th className="py-2 px-2">학생</th>
                      <th className="py-2 px-2">문장</th>
                      <th className="py-2 px-2">교재</th>
                      <th className="py-2 px-2">요청일</th>
                      <th className="py-2 px-2 w-20" />
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((r) => (
                      <tr key={keyOf(r)} className="border-b border-border/50 align-top">
                        <td className="py-2 px-2">
                          <Checkbox
                            checked={selected.has(keyOf(r))}
                            onCheckedChange={() => toggle(keyOf(r))}
                            aria-label={`${r.studentName} ${r.sentenceId} 선택`}
                          />
                        </td>
                        <td className="py-2 px-2 whitespace-nowrap">
                          <div className="font-medium">{r.studentName}</div>
                          <div className="text-xs text-muted-foreground">{r.studentNo}</div>
                        </td>
                        <td className="py-2 px-2 max-w-[340px]">
                          <div className="font-mono text-xs text-primary">{r.sentenceId}</div>
                          {r.englishPreview && <div className="text-xs mt-0.5">{r.englishPreview}</div>}
                          {r.memo && (
                            <div className="text-xs text-muted-foreground mt-1 line-clamp-2 whitespace-pre-line">
                              {r.memo}
                            </div>
                          )}
                        </td>
                        <td className="py-2 px-2 text-xs">
                          <div>{r.bookLabel}</div>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {!r.inScope && <Badge variant="outline">현재 진도 밖</Badge>}
                            {r.fromAssignment && <Badge variant="outline">특별과제</Badge>}
                          </div>
                        </td>
                        <td className="py-2 px-2 text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(r.requestedAt).toLocaleDateString("ko-KR")}
                        </td>
                        <td className="py-2 px-2 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => setConfirmTargets([r])}
                          >
                            취소
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}
      </div>

      <AlertDialog open={!!confirmTargets} onOpenChange={(o) => !o && setConfirmTargets(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>재학습 요청 {confirmTargets?.length ?? 0}건을 취소할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmTargets && confirmTargets.length === 1
                ? `${confirmTargets[0].studentName} · ${confirmTargets[0].bookLabel}`
                : "선택한 학생들의 재학습 요청이 취소됩니다."}
              {" "}학생 알림함과 진도에서 바로 빠지고, 지난 제출·첨삭 기록은 남습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>그대로 두기</AlertDialogCancel>
            <AlertDialogAction onClick={() => void runCancel()}>재학습 취소</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TeacherLayout>
  );
};

export default RedoAudit;

// ============================================================
// IdiomTestBanner — 선생님이 관용어구 테스트를 부여하면 학생 화면
// 어디서든 상단 배너로 안내하고, 바로 응시할 수 있게 한다.
// (RedoAlertBar와 같은 전역 배너 패턴)
// ============================================================
import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { BookMarked, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import {
  fetchMyPendingIdiomTest,
  fetchIdiomTestItems,
  submitIdiomTest,
  type IdiomTestAssignment,
  type IdiomBankItem,
} from "@/lib/idiomBank";
import { cn } from "@/lib/utils";

export function IdiomTestBanner() {
  const { pathname } = useLocation();
  const [pending, setPending] = useState<IdiomTestAssignment | null>(null);
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<IdiomBankItem[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loadingItems, setLoadingItems] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ correct: number; total: number; score: number } | null>(null);

  const check = useCallback(async () => {
    const a = await fetchMyPendingIdiomTest();
    setPending(a);
  }, []);

  useEffect(() => {
    void check();
    const onFocus = () => void check();
    window.addEventListener("focus", onFocus);
    const timer = window.setInterval(() => void check(), 60_000);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(timer);
    };
  }, [check]);

  if (pathname.startsWith("/teacher")) return null;
  if (!pending || pending.id === dismissedId) return null;

  const start = async () => {
    setOpen(true);
    setResult(null);
    setAnswers({});
    setLoadingItems(true);
    try {
      const its = await fetchIdiomTestItems(pending);
      setItems(its);
      if (its.length === 0) {
        toast({ title: "출제된 항목을 찾지 못했습니다.", variant: "destructive" });
      }
    } catch {
      toast({ title: "테스트를 불러오지 못했습니다.", variant: "destructive" });
      setOpen(false);
    } finally {
      setLoadingItems(false);
    }
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const r = await submitIdiomTest(pending, items, answers);
      setResult(r);
      setPending(null);
    } catch {
      toast({ title: "제출에 실패했습니다. 다시 시도해 주세요.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const answeredCount = items.filter((it) => (answers[it.id] ?? "").trim()).length;

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-[60] px-2 pt-2 pointer-events-none">
        <div className="pointer-events-auto mx-auto flex max-w-3xl items-center gap-3 rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2 shadow-lg dark:border-indigo-700 dark:bg-indigo-950/80">
          <BookMarked className="h-5 w-5 shrink-0 text-indigo-600" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-indigo-900 dark:text-indigo-100">
              관용어구 테스트 {pending.total}문항이 도착했어요
            </div>
            <div className="truncate text-xs text-indigo-800/80 dark:text-indigo-200/80">
              지금까지 모아둔 외워야 할 표현들이에요. 준비되면 시작하세요!
            </div>
          </div>
          <Button size="sm" className="shrink-0 bg-indigo-600 text-white hover:bg-indigo-700" onClick={() => void start()}>
            테스트 시작
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 shrink-0 p-0 text-indigo-700"
            onClick={() => setDismissedId(pending.id)}
            aria-label="나중에 하기"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>관용어구 테스트 ({items.length}문항)</DialogTitle>
            <DialogDescription>
              영어 표현의 뜻을 한글로 적어주세요. 비슷한 뜻이면 정답으로 인정됩니다.
            </DialogDescription>
          </DialogHeader>

          {loadingItems ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : result ? (
            <div className="space-y-4 overflow-auto">
              <div className="rounded-lg border bg-muted/40 p-4 text-center">
                <div className="text-3xl font-extrabold">{result.score}점</div>
                <div className="text-sm text-muted-foreground">
                  {result.total}문항 중 {result.correct}개 정답
                </div>
              </div>
              <div className="divide-y">
                {items.map((it, i) => {
                  const given = (answers[it.id] ?? "").trim();
                  const ok = given.length > 0 && undefined; // 표시용 재채점 대신 결과에서 찾기
                  void ok;
                  return (
                    <div key={it.id} className="py-2 text-sm">
                      <div className="font-semibold">
                        {i + 1}. {it.expression}
                      </div>
                      <div className="text-muted-foreground">
                        정답: {it.meaning}
                        {given && <> · 내 답: {given}</>}
                      </div>
                    </div>
                  );
                })}
              </div>
              <Button className="w-full" onClick={() => setOpen(false)}>
                닫기
              </Button>
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-auto divide-y pr-1">
                {items.map((it, i) => (
                  <div key={it.id} className="py-2 flex items-center gap-2">
                    <span className="w-7 shrink-0 text-right text-xs text-muted-foreground">{i + 1}.</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate">{it.expression}</div>
                    </div>
                    <Input
                      value={answers[it.id] ?? ""}
                      onChange={(e) =>
                        setAnswers((prev) => ({ ...prev, [it.id]: e.target.value }))
                      }
                      placeholder="뜻을 적으세요"
                      className={cn("h-8 w-44 text-sm")}
                    />
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between gap-2 pt-2 border-t">
                <span className="text-xs text-muted-foreground">
                  {answeredCount}/{items.length} 작성됨
                </span>
                <Button disabled={submitting || items.length === 0} onClick={() => void submit()}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "제출하기"}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export default IdiomTestBanner;

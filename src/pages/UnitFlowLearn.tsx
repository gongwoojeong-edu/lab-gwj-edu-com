import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2, Trophy, AlertCircle, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchParagraphFlowProgress,
  saveParagraphFlowAttempt,
} from "@/lib/paragraphFlowProgress";

const UnitFlowLearn = () => {
  const { unitId } = useParams<{ unitId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<Array<{ code: string; korean: string; english: string; passage_no: number }>>([]);
  const [unitTitle, setUnitTitle] = useState("");
  const [pool, setPool] = useState<string[]>([]);
  const [ordered, setOrdered] = useState<string[]>([]);
  const [result, setResult] = useState<"idle" | "pass" | "fail">("idle");
  const [passed, setPassed] = useState(false);
  const [attempts, setAttempts] = useState(0);

  const codeToKorean = useMemo(() => {
    const m = new Map<string, string>();
    items.forEach((i) => m.set(i.code, i.korean || i.english));
    return m;
  }, [items]);

  const correctOrder = useMemo(
    () => items.slice().sort((a, b) => a.passage_no - b.passage_no).map((i) => i.code),
    [items],
  );

  const load = useCallback(async () => {
    if (!unitId) return;
    setLoading(true);
    try {
      const { data: unitRow } = await supabase
        .from("textbook_units")
        .select("title")
        .eq("id", unitId)
        .maybeSingle();
      setUnitTitle((unitRow as { title: string } | null)?.title ?? "유닛");

      const { data: passages } = await supabase
        .from("textbook_passages")
        .select("code, english, korean, passage_no, mem_status")
        .eq("unit_id", unitId)
        .order("passage_no", { ascending: true });

      const ready = ((passages ?? []) as Array<{
        code: string;
        english: string;
        korean: string | null;
        passage_no: number;
        mem_status: string;
      }>).filter((p) => p.mem_status === "ready" && (p.korean?.trim() || p.english?.trim()));

      if (ready.length < 2) {
        setError("단락흐름암기는 암기 공개 지문 2개 이상 필요합니다.");
        return;
      }

      setItems(
        ready.map((p) => ({
          code: p.code,
          english: p.english,
          korean: p.korean ?? "",
          passage_no: p.passage_no,
        })),
      );

      const prog = await fetchParagraphFlowProgress(unitId);
      if (prog?.passed_at) setPassed(true);

      const shuffled = ready.map((p) => p.code).sort(() => Math.random() - 0.5);
      setPool(shuffled);
      setOrdered([]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [unitId]);

  useEffect(() => {
    void load();
  }, [load]);

  const pick = (code: string) => {
    setOrdered((o) => [...o, code]);
    setPool((p) => p.filter((c) => c !== code));
    setResult("idle");
  };

  const unpick = (idx: number) => {
    const code = ordered[idx];
    setOrdered((o) => o.filter((_, i) => i !== idx));
    setPool((p) => [...p, code]);
    setResult("idle");
  };

  const reset = () => {
    const shuffled = items.map((i) => i.code).sort(() => Math.random() - 0.5);
    setPool(shuffled);
    setOrdered([]);
    setResult("idle");
  };

  const check = async () => {
    if (!unitId) return;
    const ok =
      ordered.length === correctOrder.length &&
      ordered.every((c, i) => c === correctOrder[i]);
    setResult(ok ? "pass" : "fail");
    setAttempts((a) => a + 1);
    if (ok) {
      await saveParagraphFlowAttempt(unitId, 100, true);
      setPassed(true);
    } else {
      const score = Math.round(
        (ordered.filter((c, i) => c === correctOrder[i]).length / correctOrder.length) * 100,
      );
      await saveParagraphFlowAttempt(unitId, score, false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6">
        <AlertCircle className="w-10 h-10 text-muted-foreground" />
        <p className="text-center text-muted-foreground">{error}</p>
        <Button variant="outline" onClick={() => navigate("/learn")}>
          홈으로
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b bg-background/90 backdrop-blur px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/learn")}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-muted-foreground">단락흐름암기</div>
          <div className="font-bold truncate">{unitTitle}</div>
        </div>
        <Badge variant="secondary">한글 → 순서</Badge>
      </header>

      <main className="max-w-2xl mx-auto p-5 space-y-4">
        {passed ? (
          <Card className="p-8 text-center space-y-4">
            <Trophy className="w-14 h-14 mx-auto text-violet-600" />
            <h2 className="text-xl font-bold">단락흐름 완료!</h2>
            <Button onClick={() => navigate("/learn")}>홈으로</Button>
          </Card>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              한글 문장 카드를 <strong>지문 순서</strong>대로 배열하세요.
            </p>
            <Card className="p-4 min-h-[120px] space-y-2">
              <div className="text-xs font-bold text-muted-foreground">배열 순서</div>
              {ordered.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">아래 카드를 순서대로 탭…</p>
              ) : (
                ordered.map((code, i) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => unpick(i)}
                    className="block w-full text-left text-sm p-2 rounded-lg bg-primary/10 hover:bg-primary/15 border border-primary/20"
                  >
                    {i + 1}. {codeToKorean.get(code)}
                  </button>
                ))
              )}
            </Card>
            <div className="flex flex-wrap gap-2">
              {pool.map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => pick(code)}
                  className="text-sm px-3 py-2 rounded-lg border bg-card hover:bg-accent max-w-full text-left"
                >
                  {codeToKorean.get(code)}
                </button>
              ))}
            </div>
            <div className="flex gap-2 flex-wrap items-center">
              <Button onClick={() => void check()} disabled={ordered.length !== correctOrder.length}>
                확인
              </Button>
              <Button variant="ghost" size="sm" onClick={reset}>
                <RotateCcw className="w-3 h-3 mr-1" /> 섞기
              </Button>
              {attempts >= 2 && (
                <span className="text-xs text-muted-foreground">힌트: 번호 순서를 생각해 보세요</span>
              )}
              {result === "pass" && <span className="text-emerald-600 text-sm font-bold">통과!</span>}
              {result === "fail" && <span className="text-amber-600 text-sm font-bold">다시 시도</span>}
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default UnitFlowLearn;

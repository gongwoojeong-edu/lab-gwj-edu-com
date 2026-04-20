import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, X, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WordTestEntry } from "@/lib/wordTestBuilder";
import { fetchLatestWordPre, insertWordPreResult } from "@/lib/wordPre";
import { toast } from "@/hooks/use-toast";

interface Props {
  sentenceId: string;
  entries: WordTestEntry[];
  onCompleted: () => void;
}

export const WordPreStep = ({ sentenceId, entries, onCompleted }: Props) => {
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [marks, setMarks] = useState<Record<string, "known" | "unknown">>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    fetchLatestWordPre(sentenceId).then((r) => {
      if (!mounted) return;
      if (r?.completed) {
        const m: Record<string, "known" | "unknown"> = {};
        r.known_words.forEach((w) => (m[w] = "known"));
        r.unknown_words.forEach((w) => (m[w] = "unknown"));
        setMarks(m);
        setDone(true);
        setIdx(entries.length);
      } else {
        setMarks({});
        setDone(false);
        setIdx(0);
      }
      setRevealed(false);
      setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [sentenceId, entries.length]);

  const total = entries.length;
  const current = entries[idx];
  const markedCount = Object.keys(marks).length;

  const allMarked = useMemo(() => total > 0 && markedCount >= total, [markedCount, total]);

  const handleMark = (status: "known" | "unknown") => {
    if (!current) return;
    setMarks((p) => ({ ...p, [current.word]: status }));
    setRevealed(false);
    if (idx + 1 < total) {
      setIdx(idx + 1);
    } else {
      setIdx(total);
    }
  };

  const handleSubmit = async () => {
    if (!allMarked) return;
    const known: string[] = [];
    const unknown: string[] = [];
    entries.forEach((e) => {
      if (marks[e.word] === "known") known.push(e.word);
      else unknown.push(e.word);
    });
    setSaving(true);
    try {
      await insertWordPreResult(sentenceId, known, unknown);
      setDone(true);
      toast({ title: "단어 학습 완료", description: `안다 ${known.length} · 모른다 ${unknown.length}` });
      onCompleted();
    } catch (e) {
      toast({ title: "저장 실패", description: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleRestart = () => {
    setMarks({});
    setIdx(0);
    setRevealed(false);
    setDone(false);
  };

  if (loading) {
    return <Card className="p-6 text-sm text-muted-foreground">불러오는 중…</Card>;
  }
  if (total === 0) {
    return (
      <Card className="p-6 text-sm text-muted-foreground">
        학습할 단어가 없습니다. 분석 단계에서 단어 의미를 먼저 입력해야 합니다.
      </Card>
    );
  }

  if (done || idx >= total) {
    const known = entries.filter((e) => marks[e.word] === "known").length;
    const unknown = total - known;
    return (
      <Card className="p-6 space-y-4">
        <div className="text-lg font-bold">
          단어 학습 완료 — <span className="text-emerald-600">안다 {known}</span> ·{" "}
          <span className="text-destructive">모른다 {unknown}</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
          {entries.map((e) => (
            <div
              key={e.word}
              className={cn(
                "p-2 rounded-md border flex flex-col gap-0.5",
                marks[e.word] === "known"
                  ? "border-emerald-500/50 bg-emerald-500/5"
                  : "border-destructive/50 bg-destructive/5",
              )}
            >
              <span className="font-semibold">{e.word}</span>
              <span className="text-xs text-muted-foreground">{e.expected}</span>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={handleRestart}>
            <RotateCcw className="w-4 h-4 mr-1" /> 다시 학습
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 space-y-5">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>단어 학습 (PRE)</span>
        <span>
          {idx + 1} / {total}
        </span>
      </div>
      <div
        className="min-h-[140px] rounded-xl border-2 border-dashed border-border bg-card flex flex-col items-center justify-center gap-3 cursor-pointer select-none"
        onClick={() => setRevealed((r) => !r)}
        role="button"
        aria-label="카드 뒤집기"
      >
        <div className="text-3xl font-bold">{current.word}</div>
        {revealed ? (
          <div className="text-lg text-primary">{current.expected}</div>
        ) : (
          <div className="text-xs text-muted-foreground">탭하면 뜻이 보입니다</div>
        )}
      </div>
      <div className="flex justify-center gap-3">
        <Button variant="outline" onClick={() => handleMark("unknown")} className="min-w-28">
          <X className="w-4 h-4 mr-1 text-destructive" /> 모른다
        </Button>
        <Button onClick={() => handleMark("known")} className="min-w-28">
          <Check className="w-4 h-4 mr-1" /> 안다
        </Button>
      </div>
      {allMarked && (
        <div className="flex justify-end">
          <Button onClick={handleSubmit} disabled={saving}>
            결과 저장 후 다음 단계로
          </Button>
        </div>
      )}
    </Card>
  );
};

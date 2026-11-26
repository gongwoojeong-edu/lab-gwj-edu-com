import { useEffect, useState } from "react";
import { describeAnswer, matchesMaster, splitWords, pronounCandidates, isReferentReviewComplete, type ReferentAnswer } from "@/lib/pronounReferents";
import { fetchMasterReferents, fetchReferents } from "@/lib/pronounReferentStore";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

/** 승인창: 학생이 적은 대명사 지시어를 한 줄씩, 정답과 다르면 표시 */
export const PronounReferentReview = ({ studentUserId, sentenceId, english, onReviewChange }: { studentUserId: string; sentenceId: string; english: string; onReviewChange: (complete: boolean) => void }) => {
  const [rows, setRows] = useState<ReferentAnswer[]>([]);
  const [master, setMaster] = useState<Map<number, ReferentAnswer>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [reload, setReload] = useState(0);
  const [reviewed, setReviewed] = useState<Set<number>>(new Set());
  useEffect(() => {
    let alive = true;
    setError(null);
    setLoaded(false);
    setRows([]);
    setMaster(new Map());
    setReviewed(new Set());
    onReviewChange(false);
    Promise.all([fetchReferents(studentUserId, sentenceId), fetchMasterReferents(sentenceId)])
      .then(([r, m]) => { if (alive) { setRows(r); setMaster(m); setLoaded(true); } })
      .catch((e) => { if (alive) {
        setError(String(e?.message ?? e));
        toast({ title: "대명사 지시어를 불러오지 못했어요", description: "다시 불러온 후 검토해 주세요.", variant: "destructive" });
      } });
    return () => { alive = false; };
  }, [studentUserId, sentenceId, english, reload, onReviewChange]);
  const candidates = [...new Map([...pronounCandidates(english), ...rows.map(a => ({ index: a.wordIndex, word: a.word }))].map(c => [c.index, c])).values()];
  const complete = isReferentReviewComplete(loaded && !!english.trim(), !!error, candidates.map(c => c.index), reviewed);
  useEffect(() => { onReviewChange(complete); }, [complete, onReviewChange]);
  if (error) return <div className="text-sm text-destructive">대명사 지시어를 불러오지 못했어요: {error}<Button variant="outline" size="sm" className="ml-2" onClick={() => setReload(n => n + 1)}>다시 불러오기</Button></div>;
  if (!loaded || !english.trim()) return <div className="text-sm text-muted-foreground">대명사 지시어 확인 중…</div>;
  if (!candidates.length) return <div className="text-sm text-muted-foreground">대명사 지시어 검토 항목 없음</div>;
  const words = splitWords(english);
  return (
    <div>
      <div className="text-sm font-medium">대명사 지시어 · 검토 {reviewed.size}/{candidates.length}</div>
      <ul className="text-sm space-y-2 mt-2">
        {candidates.map((c) => {
          const a = rows.find(r => r.wordIndex === c.index);
          const m = master.get(c.index);
          const ok = a ? matchesMaster(a, m) : false;
          return (
            <li key={c.index} className={cn(ok === false && "text-destructive")}>
              <label className="flex items-start gap-2 cursor-pointer">
              <Checkbox aria-label={`${c.word} 지시어 검토 완료`} checked={reviewed.has(c.index)} onCheckedChange={(checked) => setReviewed(prev => {
                const next = new Set(prev);
                if (checked === true) next.add(c.index); else next.delete(c.index);
                return next;
              })} />
              <span>{a ? describeAnswer(a, words) : `${c.word} → 미제출`}
              {ok === false && m && <span className="ml-2 text-[11px]">(정답: {describeAnswer(m, words)})</span>}
              <span className="ml-2 text-[11px] text-muted-foreground">검토 완료</span></span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

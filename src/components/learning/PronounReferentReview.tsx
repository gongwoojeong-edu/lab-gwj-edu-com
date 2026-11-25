import { useEffect, useState } from "react";
import { describeAnswer, matchesMaster, splitWords, type ReferentAnswer } from "@/lib/pronounReferents";
import { fetchMasterReferents, fetchReferents } from "@/lib/pronounReferentStore";
import { cn } from "@/lib/utils";

/** 승인창: 학생이 적은 대명사 지시어를 한 줄씩, 정답과 다르면 표시 */
export const PronounReferentReview = ({ studentUserId, sentenceId, english }: { studentUserId: string; sentenceId: string; english: string }) => {
  const [rows, setRows] = useState<ReferentAnswer[]>([]);
  const [master, setMaster] = useState<Map<number, ReferentAnswer>>(new Map());
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setError(null);
    Promise.all([fetchReferents(studentUserId, sentenceId), fetchMasterReferents(sentenceId)])
      .then(([r, m]) => { if (alive) { setRows(r); setMaster(m); } })
      .catch((e) => { if (alive) setError(String(e?.message ?? e)); });
    return () => { alive = false; };
  }, [studentUserId, sentenceId]);
  if (error) return <div className="text-[11px] text-destructive">대명사 지시어를 불러오지 못했어요: {error}</div>;
  if (!rows.length) return null;
  const words = splitWords(english);
  return (
    <div>
      <div className="text-[11px] text-muted-foreground">대명사 지시어</div>
      <ul className="text-sm space-y-0.5">
        {rows.map((a) => {
          const m = master.get(a.wordIndex);
          const ok = matchesMaster(a, m);
          return (
            <li key={a.wordIndex} className={cn(ok === false && "text-destructive")}>
              {describeAnswer(a, words)}
              {ok === false && m && <span className="ml-2 text-[11px]">(정답: {describeAnswer(m, words)})</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
};

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  NON_PRONOUN_TYPES, isAnswerComplete, pronounCandidates, splitWords, type ReferentAnswer,
} from "@/lib/pronounReferents";

interface Props {
  english: string;
  answers: ReferentAnswer[];
  onChange: (next: ReferentAnswer[]) => void;
}

/** 해석칸 아래: 대명사마다 지시어(문장 안 / 문장 밖 영어 / 대명사 아님) 필수 입력 */
export const PronounReferentInput = ({ english, answers, onChange }: Props) => {
  const words = useMemo(() => english.trim().split(/\s+/).filter(Boolean), [english]);
  const clean = useMemo(() => splitWords(english), [english]);
  const cands = useMemo(() => pronounCandidates(english), [english]);
  const [picking, setPicking] = useState<number | null>(null);
  useEffect(() => setPicking(null), [english]);
  if (cands.length === 0) return null;

  const byIdx = new Map(answers.map((a) => [a.wordIndex, a]));
  const set = (a: ReferentAnswer) => onChange([...answers.filter((x) => x.wordIndex !== a.wordIndex), a].sort((x, y) => x.wordIndex - y.wordIndex));

  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <div className="text-sm font-semibold">대명사 지시어 <span className="text-xs font-normal text-muted-foreground">— 모두 처리해야 제출할 수 있어요</span></div>
      {picking != null && (
        <div className="space-y-1">
          <div className="text-xs text-primary">'{clean[picking]}'이(가) 가리키는 단어를 누르세요</div>
          <div className="flex flex-wrap gap-1">
            {words.map((w, i) => (
              <button key={i} type="button" disabled={i === picking}
                onClick={() => { set({ wordIndex: picking, word: clean[picking], kind: "in_sentence", targetIndex: i }); setPicking(null); }}
                className={cn("rounded border border-border px-1.5 py-0.5 text-sm hover:bg-accent disabled:opacity-40", i === picking && "bg-muted")}>
                {w}
              </button>
            ))}
            <Button size="sm" variant="ghost" className="h-7" onClick={() => setPicking(null)}>취소</Button>
          </div>
        </div>
      )}
      <ul className="space-y-2">
        {cands.map(({ index, word }) => {
          const a = byIdx.get(index);
          const done = isAnswerComplete(a);
          return (
            <li key={index} className={cn("rounded border p-2 space-y-1.5", done ? "border-border" : "border-destructive/50")}>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-semibold">{word}</span>
                <span className="text-xs text-muted-foreground">({index + 1}번째 단어)</span>
                <Button size="sm" variant={a?.kind === "in_sentence" ? "default" : "outline"} className="h-7"
                  onClick={() => setPicking(index)}>
                  {a?.kind === "in_sentence" && a.targetIndex != null ? `→ ${clean[a.targetIndex]}` : "문장에서 잇기"}
                </Button>
                <Button size="sm" variant={a?.kind === "outside" ? "default" : "outline"} className="h-7"
                  onClick={() => set({ wordIndex: index, word, kind: "outside", outsideText: a?.kind === "outside" ? a.outsideText : "" })}>
                  문장 밖
                </Button>
                <Button size="sm" variant={a?.kind === "non_pronoun" ? "default" : "outline"} className="h-7"
                  onClick={() => set({ wordIndex: index, word, kind: "non_pronoun", nonPronounType: a?.kind === "non_pronoun" ? a.nonPronounType : null })}>
                  대명사 아님
                </Button>
              </div>
              {a?.kind === "outside" && (
                <Input value={a.outsideText ?? ""} placeholder="가리키는 말을 영어로 (예: the scientists)"
                  aria-label={`${word} 문장 밖 지시어`}
                  onChange={(e) => set({ ...a, outsideText: e.target.value })} className="h-8" />
              )}
              {a?.kind === "outside" && a.outsideText && !done && (
                <p className="text-[11px] text-destructive">영어로 적어 주세요.</p>
              )}
              {a?.kind === "non_pronoun" && (
                <div className="flex flex-wrap gap-1">
                  {NON_PRONOUN_TYPES.map((t) => (
                    <Button key={t} size="sm" variant={a.nonPronounType === t ? "default" : "secondary"} className="h-7"
                      onClick={() => set({ ...a, nonPronounType: t })}>{t}</Button>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
};

// ============================================================
// UnknownWordActivity — 한글해석 단계의 "모르는 단어" 표시·저장
// 원문의 단어를 눌러 모르는 단어로 고르면 학생별로 누적되고,
// 워크북 맨 뒤 "사전활동" 부록(뜻·품사 쓰기)으로 출력된다.
// ============================================================
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { BookOpenCheck, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { getCurrentUserId } from "@/lib/authState";
import {
  addUnknownWord,
  dedupeWords,
  listUnknownWords,
  normalizeWord,
  removeUnknownWord,
  tokenizeWords,
  type UnknownWordItem,
} from "@/lib/unknownWords";

interface Props {
  sentenceId: string;
  englishSentence: string;
}

export const UnknownWordActivity = ({ sentenceId, englishSentence }: Props) => {
  const [userId, setUserId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<UnknownWordItem[]>([]);
  const [saving, setSaving] = useState(false);

  const tokens = useMemo(() => tokenizeWords(englishSentence), [englishSentence]);
  const savedKeys = useMemo(() => new Set(saved.map((w) => normalizeWord(w.word))), [saved]);

  useEffect(() => {
    let alive = true;
    setSelected(new Set());
    (async () => {
      const uid = await getCurrentUserId();
      if (!alive) return;
      setUserId(uid);
      if (!uid) return;
      try {
        const items = await listUnknownWords(uid);
        if (alive) setSaved(items);
      } catch (e) {
        if (alive) {
          toast({
            title: "모르는 단어 목록을 불러오지 못했어요",
            description: String(e),
            variant: "destructive",
          });
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [sentenceId]);

  const toggle = (word: string) => {
    const key = normalizeWord(word);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSave = async () => {
    if (!userId) {
      toast({ title: "로그인 정보를 확인할 수 없어요", variant: "destructive" });
      return;
    }
    const words = dedupeWords(tokens.filter((t) => selected.has(normalizeWord(t))));
    if (words.length === 0) return;
    setSaving(true);
    try {
      for (const w of words) {
        await addUnknownWord(userId, w, sentenceId);
      }
      const items = await listUnknownWords(userId);
      setSaved(items);
      setSelected(new Set());
      toast({ title: `모르는 단어 ${words.length}개를 저장했어요` });
    } catch (e) {
      // 일부만 저장됐을 수 있으니 실제 DB 상태를 다시 읽는다
      try {
        setSaved(await listUnknownWords(userId));
      } catch {
        /* 목록 재조회 실패는 아래 저장 실패 토스트로 충분 */
      }
      toast({ title: "단어 저장 실패", description: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (item: UnknownWordItem) => {
    try {
      await removeUnknownWord(item.id);
      setSaved((prev) => prev.filter((w) => w.id !== item.id));
    } catch (e) {
      toast({ title: "삭제 실패", description: String(e), variant: "destructive" });
    }
  };

  return (
    <div className="space-y-2 rounded-md border border-dashed border-border p-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <BookOpenCheck className="w-3.5 h-3.5" />
          모르는 단어를 눌러 선택하세요 (사전활동 워크북에 실립니다)
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 px-2 text-[11px]"
          disabled={saving || selected.size === 0}
          onClick={handleSave}
        >
          모르는 단어 저장{selected.size > 0 ? ` (${selected.size})` : ""}
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {tokens.map((token, i) => {
          const key = normalizeWord(token);
          const isSaved = savedKeys.has(key);
          const isSelected = selected.has(key);
          return (
            <button
              key={`${key}-${i}`}
              type="button"
              aria-pressed={isSelected}
              disabled={isSaved}
              onClick={() => toggle(token)}
              className={
                isSaved
                  ? "px-1.5 py-0.5 rounded text-xs bg-accent text-accent-foreground opacity-60 cursor-default"
                  : isSelected
                    ? "px-1.5 py-0.5 rounded text-xs bg-primary text-primary-foreground"
                    : "px-1.5 py-0.5 rounded text-xs bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              }
            >
              {token}
            </button>
          );
        })}
      </div>
      {saved.length > 0 && (
        <div className="space-y-1">
          <div className="text-[11px] text-muted-foreground">내 모르는 단어 ({saved.length}개)</div>
          <div className="flex flex-wrap gap-1.5">
            {saved.map((item) => (
              <span
                key={item.id}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-accent text-accent-foreground"
              >
                {item.word}
                <button
                  type="button"
                  aria-label={`${item.word} 삭제`}
                  onClick={() => handleRemove(item)}
                  className="hover:opacity-70"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

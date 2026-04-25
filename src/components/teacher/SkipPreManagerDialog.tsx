// ============================================================
// SkipPreManagerDialog
// 한 학생에 대해, 지문(sentence)별로 "단어학습(pre) 스킵" 토글 관리.
// student_passage_overrides 테이블의 skip_pre 컬럼을 upsert/제거.
// ============================================================
import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, FastForward } from "lucide-react";
import { SENTENCES, type Sentence } from "@/data/sentences";
import { hydrateSentencesFromDb } from "@/lib/sentenceSource";
import {
  fetchOverridesForStudent,
  upsertSkipPre,
} from "@/lib/studentPassageOverrides";
import { LEVEL_LABEL } from "@/lib/levels";
import { toast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId: string | null;
  studentName: string | null;
}

export const SkipPreManagerDialog = ({ open, onOpenChange, userId, studentName }: Props) => {
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [skipMap, setSkipMap] = useState<Record<string, boolean>>({});
  const [allSentences, setAllSentences] = useState<Sentence[]>([]);
  const [query, setQuery] = useState("");
  const [showOnlyOn, setShowOnlyOn] = useState(false);

  useEffect(() => {
    if (!open || !userId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        await hydrateSentencesFromDb();
        const overrides = await fetchOverridesForStudent(userId);
        if (cancelled) return;
        const m: Record<string, boolean> = {};
        overrides.forEach((o) => {
          if (o.skip_pre) m[o.sentence_id] = true;
        });
        setSkipMap(m);
        // SENTENCES는 hydrate 후 모듈 export로 갱신됨
        setAllSentences([...SENTENCES]);
      } catch (e) {
        toast({ title: "지문 목록을 불러오지 못했습니다", description: String(e), variant: "destructive" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, userId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allSentences
      .filter((s) => (showOnlyOn ? !!skipMap[s.id] : true))
      .filter((s) => {
        if (!q) return true;
        return (
          s.id.toLowerCase().includes(q) ||
          s.english.toLowerCase().includes(q) ||
          (s.korean ?? "").toLowerCase().includes(q)
        );
      })
      .slice(0, 300);
  }, [allSentences, skipMap, showOnlyOn, query]);

  const onToggle = async (sentenceId: string, next: boolean) => {
    if (!userId) return;
    setSavingId(sentenceId);
    try {
      await upsertSkipPre(userId, sentenceId, next);
      setSkipMap((prev) => {
        const m = { ...prev };
        if (next) m[sentenceId] = true;
        else delete m[sentenceId];
        return m;
      });
    } catch (e) {
      toast({ title: "저장 실패", description: String(e), variant: "destructive" });
    } finally {
      setSavingId(null);
    }
  };

  const onCount = Object.values(skipMap).filter(Boolean).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="font-kr max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FastForward className="size-4" />
            단어학습 스킵 관리
            {studentName && <span className="text-muted-foreground font-normal text-sm">— {studentName}</span>}
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 py-1">
          <Input
            placeholder="지문 ID / 영문 / 국문 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-9"
          />
          <Button
            variant={showOnlyOn ? "default" : "outline"}
            size="sm"
            onClick={() => setShowOnlyOn((v) => !v)}
            className="shrink-0"
          >
            스킵 ON만 ({onCount})
          </Button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto rounded-md border">
          {loading ? (
            <div className="py-10 text-center text-muted-foreground">
              <Loader2 className="size-5 animate-spin inline mr-2" />
              불러오는 중...
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground text-sm">
              {showOnlyOn ? "스킵 설정된 지문이 없습니다." : "조건에 맞는 지문이 없습니다."}
            </div>
          ) : (
            <ul className="divide-y">
              {filtered.map((s) => {
                const on = !!skipMap[s.id];
                return (
                  <li key={s.id} className="flex items-center gap-3 px-3 py-2">
                    <Badge variant="secondary" className="shrink-0 font-bold tabular-nums">
                      {s.level} · {LEVEL_LABEL[s.level]} · #{s.no}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm truncate" title={s.english}>
                        {s.english}
                      </div>
                      {s.korean && (
                        <div className="text-xs text-muted-foreground truncate" title={s.korean}>
                          {s.korean}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-xs ${on ? "text-primary font-semibold" : "text-muted-foreground"}`}>
                        {on ? "단어학습 스킵" : "기본"}
                      </span>
                      <Switch
                        checked={on}
                        disabled={savingId === s.id}
                        onCheckedChange={(v) => onToggle(s.id, v)}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          ON: 해당 학생은 이 지문에서 <b>1단계 단어 학습을 건너뛰고 단어 테스트부터</b> 시작합니다.
          오답이 있을 경우 기존 오답 학습 흐름은 그대로 유지됩니다.
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            닫기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SkipPreManagerDialog;

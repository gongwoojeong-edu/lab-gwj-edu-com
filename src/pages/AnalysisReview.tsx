// ============================================================
// AnalysisReview — 자기 첨삭 모드: 마스터 답안(좌) vs 내 답안(우) 비교
// 입력 차단(Read-only). 승인된 요청이 있을 때만 마스터 답안을 노출.
// ============================================================
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, Eye, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SENTENCES, type Sentence } from "@/data/sentences";
import { hydrateSentencesFromDb } from "@/lib/sentenceSource";
import { fetchMasterAnswers, fetchStudentAnswers } from "@/lib/analysisGrading";
import { fetchOpenRequest } from "@/lib/analysisReview";
import { fetchAttemptCount } from "@/integrations/supabase/storage";
import { fetchIdiomsAll } from "@/integrations/supabase/storage";
import { LEVEL_LABEL } from "@/lib/levels";
import { useLevelLabels } from "@/hooks/useLevelLabels";
import { cn } from "@/lib/utils";

interface AnyProgress {
  pos: string | null;
  noun?: { form: string | null; element: string | null; role: string | null; subrole?: string | null };
  adj?: { form: string | null; element: string | null; role: string | null };
  adv?: { form: string | null; subtype?: string | null; role: string | null };
  etc?: { kind: string | null; role: string | null };
  verb?: { number?: string | null; tense?: string | null; aspect?: string | null; voice?: string | null; proverb?: string | null };
}

const POS_LABEL: Record<string, string> = {
  noun: "명",
  adj: "형",
  adv: "부",
  verb: "동",
  etc: "기타",
};

const formatProgress = (p: AnyProgress | undefined): string => {
  if (!p || !p.pos) return "—";
  const tag = POS_LABEL[p.pos] ?? p.pos;
  switch (p.pos) {
    case "noun":
      return `${tag} · ${p.noun?.form ?? "?"} · ${p.noun?.element ?? "?"}${p.noun?.role ? ` · ${p.noun.role}` : ""}${p.noun?.subrole ? ` · ${p.noun.subrole}` : ""}`;
    case "adj":
      return `${tag} · ${p.adj?.form ?? "?"} · ${p.adj?.element ?? "?"}${p.adj?.role ? ` · ${p.adj.role}` : ""}`;
    case "adv":
      return `${tag} · ${p.adv?.form ?? "?"} · ${p.adv?.role ?? "?"}`;
    case "verb": {
      const bits = [p.verb?.tense, p.verb?.aspect, p.verb?.voice, p.verb?.number].filter(Boolean);
      return `${tag}${bits.length ? " · " + bits.join(" / ") : ""}`;
    }
    case "etc":
      return `${tag} · ${p.etc?.kind ?? "?"}${p.etc?.role ? ` · ${p.etc.role}` : ""}`;
    default:
      return tag;
  }
};

const isMatch = (a: AnyProgress | undefined, b: AnyProgress | undefined): "exact" | "partial" | "miss" | "missing" => {
  if (!a) return "missing";
  if (!b) return "missing";
  if (a.pos !== b.pos) return "miss";
  // very loose detail compare for visual indicator
  if (formatProgress(a) === formatProgress(b)) return "exact";
  return "partial";
};

const AnalysisReview = () => {
  const { sentenceId } = useParams<{ sentenceId: string }>();
  const navigate = useNavigate();
  const { displayStudent: levelDisplay } = useLevelLabels();
  const [loading, setLoading] = useState(true);
  const [sentence, setSentence] = useState<Sentence | null>(null);
  const [master, setMaster] = useState<Record<string, AnyProgress>>({});
  const [mine, setMine] = useState<Record<string, AnyProgress>>({});
  const [approved, setApproved] = useState(false);
  const [idioms, setIdioms] = useState<{ surface: string; meaning: string }[]>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      await hydrateSentencesFromDb();
      if (!sentenceId) return;
      const s = SENTENCES.find((x) => x.id === sentenceId) ?? null;
      if (!mounted) return;
      setSentence(s);
      if (!s) {
        setLoading(false);
        return;
      }
      const attemptCnt = await fetchAttemptCount(s.id);
      const req = await fetchOpenRequest(s.id, attemptCnt + 1);
      // 직전 attempt에 대한 요청도 확인
      let approvedReq = req;
      if (!approvedReq || approvedReq.status !== "approved") {
        const prev = await fetchOpenRequest(s.id, attemptCnt);
        if (prev?.status === "approved") approvedReq = prev;
      }
      const isApproved = approvedReq?.status === "approved";
      setApproved(isApproved);

      if (isApproved) {
        const [m, mi, idi] = await Promise.all([
          fetchMasterAnswers(s.id),
          fetchStudentAnswers(s.id),
          fetchIdiomsAll(),
        ]);
        if (!mounted) return;
        setMaster(m);
        setMine(mi);
        setIdioms(
          idi
            .filter((r) => r.sentence_id === s.id)
            .map((r) => ({ surface: r.surface, meaning: r.meaning })),
        );
      }
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [sentenceId]);

  const ownerIds = useMemo(() => {
    const set = new Set<string>([...Object.keys(master), ...Object.keys(mine)]);
    return Array.from(set).sort();
  }, [master, mine]);

  const ownerToSurface = useMemo(() => {
    const map: Record<string, string> = {};
    if (!sentence) return map;
    sentence.tokens.forEach((t) => {
      if (t.type === "analyzable") map[t.id] = t.text;
    });
    return map;
  }, [sentence]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!sentence) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <Card className="p-8 max-w-md text-center space-y-4">
          <div className="font-bold">Passage를 찾을 수 없어요</div>
          <Button onClick={() => navigate("/learn")}>학습 홈으로</Button>
        </Card>
      </div>
    );
  }

  if (!approved) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <Card className="p-8 max-w-md text-center space-y-4">
          <AlertCircle className="w-10 h-10 text-amber-500 mx-auto" />
          <div className="font-bold text-lg">아직 승인되지 않았어요</div>
          <div className="text-sm text-muted-foreground">
            선생님 승인 후에만 정답 비교 화면이 열립니다.
          </div>
          <Button
            onClick={() => navigate(`/learn/sentence/${encodeURIComponent(sentence.id)}`)}
          >
            <ArrowLeft className="w-4 h-4 mr-1" /> 학습으로 돌아가기
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-secondary/30">
      <header className="sticky top-0 z-30 backdrop-blur-md bg-background/70 border-b border-border">
        <div className="max-w-6xl mx-auto px-5 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(`/learn/sentence/${encodeURIComponent(sentence.id)}`)}
              className="shrink-0"
            >
              <ArrowLeft className="w-4 h-4 mr-1" /> 학습으로
            </Button>
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground">
                {levelDisplay(sentence.level)} · {sentence.id}
              </div>
              <div className="text-sm font-bold text-foreground truncate max-w-[55vw]">
                {sentence.english}
              </div>
            </div>
          </div>
          <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-xs font-bold">
            <Eye className="w-3.5 h-3.5" /> 자기 첨삭 모드 (Read-only)
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-5 py-6 space-y-5">
        <Card className="p-4 border-emerald-500/30 bg-emerald-50/30 dark:bg-emerald-500/5">
          <div className="text-sm font-bold text-foreground">
            🏛️ 마스터 답안과 내 답안을 비교하며 자기 첨삭하세요.
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            이 화면에서는 답안 수정이 불가능합니다 (베껴 쓰기 차단). 다음 시도에서 다시 분석할 수 있어요.
          </div>
        </Card>

        {idioms.length > 0 && (
          <Card className="p-4 border-emerald-500/30 bg-emerald-500/5">
            <div className="text-xs font-bold text-emerald-700 dark:text-emerald-400 mb-2">
              📖 관용구 (참고용 · 분석 대상 아님)
            </div>
            <ul className="space-y-1 text-sm">
              {idioms.map((i, idx) => (
                <li key={idx}>
                  <span className="font-bold text-foreground">{i.surface}</span>{" "}
                  <span className="text-muted-foreground">— {i.meaning}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="text-center text-sm font-extrabold text-emerald-700 dark:text-emerald-400 md:col-span-1">
            🏛️ 마스터 답안
          </div>
          <div className="text-center text-sm font-extrabold text-primary md:col-span-1">
            🧑‍🎓 내 답안
          </div>
        </div>

        <div className="space-y-2">
          {ownerIds.map((oid) => {
            const m = master[oid];
            const mi = mine[oid];
            const status = isMatch(m, mi);
            const surface = ownerToSurface[oid] ?? oid;
            return (
              <div key={oid} className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-2 items-stretch">
                <Card
                  className={cn(
                    "p-3 border",
                    m ? "border-emerald-500/30 bg-emerald-50/20 dark:bg-emerald-500/5" : "border-dashed border-muted-foreground/30",
                  )}
                >
                  <div className="text-xs font-mono text-muted-foreground">{oid}</div>
                  <div className="font-bold text-foreground">{surface}</div>
                  <div className="text-sm mt-1 text-foreground/90">{formatProgress(m)}</div>
                </Card>
                <div className="flex items-center justify-center">
                  {status === "exact" && <CheckCircle2 className="w-5 h-5 text-emerald-600" />}
                  {status === "partial" && <AlertCircle className="w-5 h-5 text-amber-500" />}
                  {status === "miss" && <XCircle className="w-5 h-5 text-destructive" />}
                  {status === "missing" && <span className="text-xs text-muted-foreground">—</span>}
                </div>
                <Card
                  className={cn(
                    "p-3 border",
                    mi
                      ? status === "exact"
                        ? "border-emerald-500/30 bg-emerald-50/20 dark:bg-emerald-500/5"
                        : status === "partial"
                          ? "border-amber-500/30 bg-amber-50/20 dark:bg-amber-500/5"
                          : "border-destructive/30 bg-destructive/5"
                      : "border-dashed border-muted-foreground/30",
                  )}
                >
                  <div className="text-xs font-mono text-muted-foreground">{oid}</div>
                  <div className="font-bold text-foreground">{surface}</div>
                  <div className="text-sm mt-1 text-foreground/90">{formatProgress(mi)}</div>
                </Card>
              </div>
            );
          })}
        </div>

        <div className="flex justify-end pt-2">
          <Button
            onClick={() => navigate(`/learn/sentence/${encodeURIComponent(sentence.id)}`)}
          >
            학습으로 돌아가기
          </Button>
        </div>
      </main>
    </div>
  );
};

export default AnalysisReview;

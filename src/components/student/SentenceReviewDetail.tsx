// ============================================================
// SentenceReviewDetail — 학생이 보류/평가 알림에서 펼쳐보는 문장 복기 뷰
//   · 영어 원문 + 내가 제출한 한글해석(첫/최종) + 선생님 메모
//   · 한글 정답(마스터 해석)은 절대 표시하지 않는다.
//   · 펼칠 때만 조회(지연 로딩), 조회 결과는 모듈 캐시에 보관
// ============================================================
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { stripKoreanFromEnglishSource } from "@/lib/sentenceSource";
import { StructuredMemoView } from "@/components/learning/StructuredMemoView";

interface Detail {
  english: string | null;
  first: string | null;
  final: string | null;
}

const cache = new Map<string, Detail>();

const loadDetail = async (sentenceId: string, userId: string): Promise<Detail> => {
  const key = `${userId}::${sentenceId}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const [passageRes, transRes] = await Promise.all([
    supabase
      .from("textbook_passages")
      .select("english")
      .eq("code", sentenceId)
      .limit(1)
      .maybeSingle(),
    supabase
      .from("sentence_translations")
      .select("text, submitted_at")
      .eq("user_id", userId)
      .eq("sentence_id", sentenceId)
      .order("submitted_at", { ascending: true }),
  ]);

  const rawEnglish = (passageRes.data as { english: string } | null)?.english ?? null;
  const list = ((transRes.data ?? []) as { text: string }[])
    .map((r) => (r.text ?? "").trim())
    .filter(Boolean);

  const detail: Detail = {
    english: rawEnglish ? stripKoreanFromEnglishSource(rawEnglish) : null,
    first: list[0] ?? null,
    final: list.length > 1 ? list[list.length - 1] : null,
  };
  cache.set(key, detail);
  return detail;
};

interface Props {
  sentenceId: string;
  userId: string;
  memo?: unknown;
}

export const SentenceReviewDetail = ({ sentenceId, userId, memo }: Props) => {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    loadDetail(sentenceId, userId)
      .then((d) => {
        if (alive) setDetail(d);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : "불러오지 못했습니다");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [sentenceId, userId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-3">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> 불러오는 중…
      </div>
    );
  }
  if (error) {
    return <div className="text-xs text-destructive py-2">불러오지 못했습니다 — {error}</div>;
  }

  const hasSame = detail?.first && !detail?.final;

  return (
    <div className="space-y-3">
      {detail?.english && (
        <div className="rounded-md border bg-card/60 p-3">
          <div className="text-[11px] text-muted-foreground mb-1">영어 원문</div>
          <div className="text-base font-medium leading-relaxed">{detail.english}</div>
        </div>
      )}

      {detail?.first && (
        <div className="rounded-md border bg-card/60 p-3 space-y-2">
          <div className="text-[11px] text-muted-foreground">
            {hasSame ? "내가 제출한 한글해석" : "내가 제출한 한글해석 (처음 / 최종)"}
          </div>
          <div className="text-sm whitespace-pre-wrap leading-relaxed">
            {!hasSame && <span className="text-[11px] font-bold text-muted-foreground mr-1.5">처음</span>}
            {detail.first}
          </div>
          {detail.final && (
            <div className="text-sm whitespace-pre-wrap leading-relaxed">
              <span className="text-[11px] font-bold text-muted-foreground mr-1.5">최종</span>
              {detail.final}
            </div>
          )}
        </div>
      )}

      {(memo != null || showEmptyMemo) && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
          <div className="text-[11px] text-muted-foreground mb-1">선생님 첨삭 메모</div>
          <StructuredMemoView
            memo={memo ?? null}
            showEmpty={showEmptyMemo}
            emptyText="아직 첨삭 메모가 없어요"
          />
        </div>
      )}
    </div>
  );
};

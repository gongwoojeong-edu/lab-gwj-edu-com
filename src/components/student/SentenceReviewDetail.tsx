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
import { TeachingQnaPanel } from "@/components/learning/TeachingQnaPanel";

interface Detail {
  english: string | null;
  first: string | null;
  final: string | null;
}

const CACHE_TTL_MS = 10_000;
const cache = new Map<string, { at: number; detail: Detail }>();

const loadDetail = async (sentenceId: string, userId: string): Promise<Detail> => {
  const key = `${userId}::${sentenceId}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.detail;

  const [passageRes, transRes, logsRes] = await Promise.all([
    supabase
      .from("textbook_passages")
      .select("english")
      .eq("code", sentenceId)
      .limit(1)
      .maybeSingle(),
    // 현재 저장된 해석 = 항상 최신(수정 제출 반영)
    supabase
      .from("sentence_translations")
      .select("text, submitted_at")
      .eq("user_id", userId)
      .eq("sentence_id", sentenceId)
      .order("submitted_at", { ascending: false })
      .limit(1),
    // 최초 제출본은 시도 로그에서
    supabase
      .from("sentence_attempt_logs")
      .select("translation_text, completed_at")
      .eq("user_id", userId)
      .eq("sentence_id", sentenceId)
      .order("completed_at", { ascending: true })
      .limit(1),
  ]);

  const rawEnglish = (passageRes.data as { english: string } | null)?.english ?? null;
  const latest = (((transRes.data ?? [])[0] as { text?: string } | undefined)?.text ?? "").trim();
  const firstLog = (
    ((logsRes.data ?? [])[0] as { translation_text?: string | null } | undefined)?.translation_text ?? ""
  ).trim();

  const detail: Detail = {
    english: rawEnglish ? stripKoreanFromEnglishSource(rawEnglish) : null,
    first: firstLog && latest && firstLog !== latest ? firstLog : latest || firstLog || null,
    final: firstLog && latest && firstLog !== latest ? latest : null,
  };
  cache.set(key, { at: Date.now(), detail });
  return detail;
};


interface Props {
  sentenceId: string;
  userId: string;
  memo?: unknown;
  /** true 면 메모 4칸을 비어 있어도 모두 표시 */
  showEmptyMemo?: boolean;
  /** true 면 첨삭 문답 기록을 표시하지 않음 (티칭 오버레이처럼 별도 패널을 쓰는 경우) */
  hideQna?: boolean;
}

export const SentenceReviewDetail = ({
  sentenceId,
  userId,
  memo,
  showEmptyMemo = false,
  hideQna = false,
}: Props) => {
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

      {!hideQna && (
        <TeachingQnaPanel studentUserId={userId} sentenceId={sentenceId} role="readonly" />
      )}
    </div>
  );
};

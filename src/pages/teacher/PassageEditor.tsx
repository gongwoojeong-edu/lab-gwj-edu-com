import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { TeacherLayout } from "@/components/teacher/TeacherLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Loader2, Eye, EyeOff, RotateCcw, List } from "lucide-react";
import Index from "@/pages/Index";
import {
  hydrateSentencesFromDb,
  setPassageReady,
  tokensMatchEnglish,
  upsertSentenceFromPassage,
} from "@/lib/sentenceSource";
import type { LevelCode } from "@/lib/levels";
import { fetchPassageByCode, clearPassageDerivedCache, type Passage } from "@/lib/textbooks";
import { toast } from "@/hooks/use-toast";

const PassageEditor = () => {
  const { level, seriesNo, volumeNo, unitNo, passageCode } = useParams<{
    level: string;
    seriesNo: string;
    volumeNo: string;
    unitNo: string;
    passageCode: string;
  }>();
  const navigate = useNavigate();
  const [passage, setPassage] = useState<Passage | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    if (!passageCode || !level) return;
    setLoading(true);
    (async () => {
      let p = await fetchPassageByCode(passageCode);
      if (p) {
        // DB tokens가 다른 본문(옛 지문) 분석이면 자동 정리
        if (p.tokens?.length && !tokensMatchEnglish(p.tokens, p.english)) {
          await clearPassageDerivedCache(p.id, p.code);
          p = { ...p, tokens: null };
          toast({
            title: "본문과 맞지 않는 분석 캐시를 정리했습니다",
            description: "이전 지문의 분석 데이터가 남아 있어 초기화했습니다. 정답을 다시 입력해 주세요.",
          });
        }
        // 편집기는 반드시 이 지문 본문·토큰을 사용 (SENTENCES 캐시 충돌/누락 방지)
        upsertSentenceFromPassage(p, level as LevelCode);
      } else {
        await hydrateSentencesFromDb(true);
      }
      setPassage(p);
      setLoading(false);
    })();
  }, [passageCode, level]);

  const togglePublish = async () => {
    if (!passageCode || !passage) return;
    const nextReady = passage.analysis_status !== "ready";
    setToggling(true);
    try {
      await setPassageReady(passageCode, nextReady);
      toast({
        title: nextReady ? "학생에게 공개되었습니다 (ready)" : "비공개로 전환했습니다 (draft)",
        description: nextReady
          ? "학생 화면에서 이 지문이 노출됩니다."
          : "다시 [학생 공개] 버튼으로 언제든 공개할 수 있습니다.",
      });
      const refreshed = await fetchPassageByCode(passageCode);
      setPassage(refreshed);
    } catch (e) {
      toast({
        title: "상태 변경 실패",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setToggling(false);
    }
  };

  const handleClearCache = async () => {
    if (!passage) return;
    setClearing(true);
    try {
      await clearPassageDerivedCache(passage.id, passage.code);
      // 메모리 캐시 강제 갱신 → 새로 만든 토큰으로 화면 즉시 반영
      await hydrateSentencesFromDb(true);
      const refreshed = await fetchPassageByCode(passage.code);
      setPassage(refreshed);
      toast({
        title: "🔄 캐시를 정리했어요",
        description: "단어 단위는 현재 본문 기준으로 다시 만들어졌습니다. AI 단어추출은 필요 시 다시 실행하세요.",
      });
      // Index 임베드가 sentence_id useEffect를 다시 타도록 라우트 리렌더 트릭은 불필요 — hydrate 결과가 SENTENCES 배열에 반영됨.
      // 강제 리렌더가 필요하면 페이지 새로고침을 권장.
      setTimeout(() => window.location.reload(), 400);
    } catch (e) {
      toast({
        title: "캐시 초기화 실패",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setClearing(false);
    }
  };

  if (loading) {
    return (
      <TeacherLayout>
        <div className="flex justify-center py-20">
          <Loader2 className="animate-spin text-primary" />
        </div>
      </TeacherLayout>
    );
  }

  if (!passage) {
    return (
      <TeacherLayout>
        <div className="p-6 max-w-3xl mx-auto">
          <Card className="p-10 text-center text-sm text-muted-foreground">
            지문을 찾을 수 없습니다.
          </Card>
        </div>
      </TeacherLayout>
    );
  }

  const isReady = passage.analysis_status === "ready";

  return (
    <TeacherLayout>
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <Link
              to={`/teacher/bookshelf/${level}/${seriesNo}/${volumeNo}/${unitNo}`}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="size-3" /> 유닛으로
            </Link>
            <h1 className="text-xl font-bold mt-1">
              {level} / S{seriesNo} / V{volumeNo} / U{unitNo} /{" "}
              <span className="font-mono text-primary">{passage.code}</span>
            </h1>
            <p className="text-xs text-muted-foreground line-clamp-1 max-w-3xl">
              {passage.english}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1 font-kr">
              💡 본문은 자동으로 단어 단위로 분리되어 표시됩니다. 하단{" "}
              <b>[정답 입력]</b> 토글을 켠 뒤 단어를 클릭해 입력 →{" "}
              <b>[정답 저장]</b> 으로 저장하세요. (AI 단어 추출은 선택 단계)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={
                "text-[10px] font-bold px-2 py-1 rounded-full " +
                (isReady
                  ? "bg-primary/15 text-primary"
                  : "bg-muted text-muted-foreground")
              }
            >
              {passage.analysis_status}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                navigate(`/teacher/bookshelf/${level}/${seriesNo}/${volumeNo}/${unitNo}`)
              }
              className="gap-1"
            >
              <List className="size-3.5" />
              <span className="hidden sm:inline text-xs font-kr">목록보기</span>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleClearCache}
              disabled={clearing}
              title="본문이 바뀌었는데 분석학습에 옛 영문/단어가 보이면 누르세요"
              className="gap-1"
            >
              {clearing ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RotateCcw className="size-3.5" />
              )}
              <span className="hidden sm:inline text-xs font-kr">캐시 초기화</span>
            </Button>
            <Button
              size="sm"
              onClick={togglePublish}
              disabled={toggling}
              variant={isReady ? "outline" : "default"}
            >
              {toggling ? (
                <Loader2 className="size-3.5 mr-1 animate-spin" />
              ) : isReady ? (
                <EyeOff className="size-3.5 mr-1" />
              ) : (
                <Eye className="size-3.5 mr-1" />
              )}
              {isReady ? "비공개 전환 (draft)" : "학생 공개 (ready)"}
            </Button>
          </div>
        </div>

        <Card className="overflow-hidden">
          <div className="border-b border-border bg-muted/30 px-3 py-2 text-xs font-bold">
            마스터키 분석 입력기
          </div>
          <div className="max-h-[calc(100vh-220px)] overflow-auto">
            <Index
              key={passage.id}
              embedMode
              embedSentenceId={passage.code}
              showStaffToolbar
              onAfterCommitAll={() => {
                navigate(`/teacher/bookshelf/${level}/${seriesNo}/${volumeNo}/${unitNo}`);
              }}
            />
          </div>
        </Card>
      </div>
    </TeacherLayout>
  );
};

export default PassageEditor;

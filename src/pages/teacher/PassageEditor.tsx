import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { TeacherLayout } from "@/components/teacher/TeacherLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Loader2, Eye, EyeOff } from "lucide-react";
import Index from "@/pages/Index";
import { hydrateSentencesFromDb, setPassageReady } from "@/lib/sentenceSource";
import { fetchPassageByCode, type Passage } from "@/lib/textbooks";
import { toast } from "@/hooks/use-toast";

const PassageEditor = () => {
  const { level, unitNo, passageCode } = useParams<{
    level: string;
    unitNo: string;
    passageCode: string;
  }>();
  const [passage, setPassage] = useState<Passage | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    if (!passageCode) return;
    setLoading(true);
    (async () => {
      // 새 교재/지문이 추가됐을 수 있으므로 강제 재 hydrate (캐시된 SENTENCES 갱신)
      await hydrateSentencesFromDb(true);
      const p = await fetchPassageByCode(passageCode);
      setPassage(p);
      setLoading(false);
    })();
  }, [passageCode]);

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
              to={`/teacher/bookshelf/${level}/${unitNo}`}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="size-3" /> 교재로
            </Link>
            <h1 className="text-xl font-bold mt-1">
              {level} / U{unitNo} /{" "}
              <span className="font-mono text-primary">{passage.code}</span>
            </h1>
            <p className="text-xs text-muted-foreground line-clamp-1 max-w-3xl">
              {passage.english}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1 font-kr">
              💡 분석은 하단 <b>[정답 입력]</b> 토글을 켠 뒤 단어를 클릭해 입력 →{" "}
              <b>[정답 저장]</b> 으로 저장하세요 (마스터키).
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
              embedMode
              embedSentenceId={passage.code}
              showStaffToolbar
            />
          </div>
        </Card>
      </div>
    </TeacherLayout>
  );
};

export default PassageEditor;

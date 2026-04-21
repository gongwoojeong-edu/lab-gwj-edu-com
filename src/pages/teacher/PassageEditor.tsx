import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { TeacherLayout } from "@/components/teacher/TeacherLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Loader2, Save } from "lucide-react";
import Index from "@/pages/Index";
import { ExtractedWordsPanel } from "@/components/analyzer/ExtractedWordsPanel";
import { hydrateSentencesFromDb, saveSentenceTokens } from "@/lib/sentenceSource";
import { fetchPassageByCode, type Passage } from "@/lib/textbooks";
import { SENTENCES } from "@/data/sentences";
import { toast } from "@/hooks/use-toast";

const PassageEditor = () => {
  const { level, unitNo, passageCode } = useParams<{
    level: string;
    unitNo: string;
    passageCode: string;
  }>();
  const navigate = useNavigate();
  const [passage, setPassage] = useState<Passage | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!passageCode) return;
    setLoading(true);
    (async () => {
      await hydrateSentencesFromDb();
      const p = await fetchPassageByCode(passageCode);
      setPassage(p);
      setLoading(false);
    })();
  }, [passageCode]);

  const handleSave = async () => {
    if (!passageCode) return;
    const cur = SENTENCES.find((s) => s.id === passageCode);
    if (!cur) {
      toast({ title: "메모리에 지문이 없어요", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await saveSentenceTokens(passageCode, cur.tokens, true);
      toast({ title: "저장되었습니다 (ready)" });
      const refreshed = await fetchPassageByCode(passageCode);
      setPassage(refreshed);
    } catch (e) {
      toast({
        title: "저장 실패",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
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
          </div>
          <div className="flex items-center gap-2">
            <span
              className={
                "text-[10px] font-bold px-2 py-1 rounded-full " +
                (passage.analysis_status === "ready"
                  ? "bg-primary/15 text-primary"
                  : "bg-muted text-muted-foreground")
              }
            >
              {passage.analysis_status}
            </span>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <Loader2 className="size-3.5 mr-1 animate-spin" />
              ) : (
                <Save className="size-3.5 mr-1" />
              )}
              분석 저장 (ready)
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-4">
          <Card className="overflow-hidden">
            <div className="border-b border-border bg-muted/30 px-3 py-2 text-xs font-bold">
              구문분석 정답 입력
            </div>
            <div className="max-h-[calc(100vh-220px)] overflow-auto">
              <Index embedMode embedSentenceId={passage.code} />
            </div>
          </Card>
          <Card className="overflow-hidden">
            <div className="border-b border-border bg-muted/30 px-3 py-2 text-xs font-bold">
              단어 추출 / 편집
            </div>
            <div className="p-3">
              <ExtractedWordsPanel sentenceId={passage.code} english={passage.english} />
            </div>
          </Card>
        </div>
      </div>
    </TeacherLayout>
  );
};

export default PassageEditor;

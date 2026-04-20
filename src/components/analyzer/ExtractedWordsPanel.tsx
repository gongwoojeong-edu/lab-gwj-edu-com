import { useEffect, useState } from "react";
import { ListChecks, Loader2, Plus, RotateCcw, Save, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import {
  deleteExtraction,
  fetchExtraction,
  runExtraction,
  saveExtractionWords,
  type ExtractedWord,
} from "@/lib/wordExtraction";

interface Props {
  sentenceId: string;
  english: string;
}

/** 선생님/관리자 전용 — AI 추출 단어 목록 보기/수정/삭제. */
export const ExtractedWordsPanel = ({ sentenceId, english }: Props) => {
  const { roles } = useAuth();
  const isStaff = roles.includes("teacher") || roles.includes("admin");
  const isAdmin = roles.includes("admin");

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reExtracting, setReExtracting] = useState(false);
  const [words, setWords] = useState<ExtractedWord[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const row = await fetchExtraction(sentenceId);
      setWords(row?.words ?? []);
      setUpdatedAt(row?.updated_at ?? null);
      setModel(row?.model ?? null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sentenceId]);

  const updateWord = (idx: number, patch: Partial<ExtractedWord>) => {
    setWords((prev) => prev.map((w, i) => (i === idx ? { ...w, ...patch } : w)));
  };
  const removeRow = (idx: number) => {
    setWords((prev) => prev.filter((_, i) => i !== idx));
  };
  const addRow = () => {
    setWords((prev) => [...prev, { word: "", meaning: "", pos: "" }]);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveExtractionWords(sentenceId, english, words);
      toast({ title: "✅ 단어 목록이 저장되었습니다" });
      await load();
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

  const handleReExtract = async () => {
    setReExtracting(true);
    try {
      const res = await runExtraction(sentenceId, english);
      if ("error" in res) {
        toast({
          title: "재추출 실패",
          description: res.error,
          variant: "destructive",
        });
        return;
      }
      toast({ title: `🔄 ${res.count}개 단어로 갱신되었습니다` });
      await load();
    } finally {
      setReExtracting(false);
    }
  };

  const handleDeleteAll = async () => {
    try {
      await deleteExtraction(sentenceId);
      toast({ title: "🗑️ 추출 캐시가 삭제되었습니다" });
      setWords([]);
      setUpdatedAt(null);
      setModel(null);
    } catch (e) {
      toast({
        title: "삭제 실패",
        description: (e as Error).message,
        variant: "destructive",
      });
    }
  };

  if (!isStaff) return null;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-1.5 border-primary/40 text-primary hover:bg-primary/10 hover:text-primary"
        >
          <ListChecks className="w-3.5 h-3.5" />
          <span className="hidden sm:inline font-kr text-[11px] font-bold">단어 목록</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0">
        <SheetHeader className="p-4 border-b">
          <SheetTitle className="font-kr">추출된 단어 목록</SheetTitle>
          <SheetDescription className="font-kr text-xs">
            학생 PRE 학습에 그대로 사용됩니다.
            {updatedAt && (
              <span className="block mt-1 text-muted-foreground/80">
                {new Date(updatedAt).toLocaleString("ko-KR")} · {model ?? "-"}
              </span>
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : words.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-12 font-kr">
              아직 추출된 단어가 없습니다.
              <br />
              아래 [AI 재추출]을 눌러 시작하세요.
            </div>
          ) : (
            words.map((w, idx) => (
              <div
                key={idx}
                className="grid grid-cols-[1fr_1.2fr_70px_auto] gap-1.5 items-center"
              >
                <Input
                  value={w.word}
                  onChange={(e) => updateWord(idx, { word: e.target.value })}
                  placeholder="word"
                  className="h-8 text-xs"
                />
                <Input
                  value={w.meaning}
                  onChange={(e) => updateWord(idx, { meaning: e.target.value })}
                  placeholder="뜻"
                  className="h-8 text-xs font-kr"
                />
                <Input
                  value={w.pos}
                  onChange={(e) => updateWord(idx, { pos: e.target.value })}
                  placeholder="품사"
                  className="h-8 text-xs font-kr"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={() => removeRow(idx)}
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))
          )}

          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={addRow}
            className="w-full gap-1 mt-2 text-xs font-kr"
          >
            <Plus className="w-3.5 h-3.5" />
            행 추가
          </Button>
        </div>

        <div className="border-t p-3 flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || loading}
            className="gap-1.5 font-kr"
          >
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            저장
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleReExtract}
            disabled={reExtracting || !english.trim()}
            className="gap-1.5 font-kr"
          >
            {reExtracting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RotateCcw className="w-3.5 h-3.5" />
            )}
            AI 재추출
          </Button>
          {isAdmin && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1.5 ml-auto text-destructive hover:text-destructive font-kr"
                  disabled={words.length === 0 && !updatedAt}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  전체 삭제
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="font-kr">추출 캐시를 삭제할까요?</AlertDialogTitle>
                  <AlertDialogDescription className="font-kr">
                    이 문장의 PRE 단어 목록이 비워집니다. 학생 화면에는 캐시가 사라진 상태로 보입니다.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="font-kr">취소</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDeleteAll}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90 font-kr"
                  >
                    삭제
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

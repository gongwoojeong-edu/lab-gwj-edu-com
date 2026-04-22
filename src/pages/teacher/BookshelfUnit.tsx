import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { TeacherLayout } from "@/components/teacher/TeacherLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ChevronLeft, Loader2, BookOpen, FileEdit, FileCheck, Pencil, Printer, Trash2 } from "lucide-react";
import { LEVEL_LABEL, type LevelCode } from "@/lib/levels";
import {
  fetchTextbook,
  fetchPassagesByTextbook,
  deletePassage,
  type Textbook,
  type Passage,
} from "@/lib/textbooks";
import { hydrateSentencesFromDb } from "@/lib/sentenceSource";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const BookshelfUnit = () => {
  const { level, unitNo } = useParams<{ level: LevelCode; unitNo: string }>();
  const navigate = useNavigate();
  const [tb, setTb] = useState<Textbook | null>(null);
  const [passages, setPassages] = useState<Passage[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Passage | null>(null);
  const [deleting, setDeleting] = useState(false);

  const reload = () => {
    if (!level || !unitNo) return;
    const u = parseInt(unitNo, 10);
    setLoading(true);
    fetchTextbook(level, u).then(async (textbook) => {
      setTb(textbook);
      if (textbook) {
        const ps = await fetchPassagesByTextbook(textbook.id);
        setPassages(ps);
      }
      setLoading(false);
    });
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level, unitNo]);

  const handleDeletePassage = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deletePassage(deleteTarget.id);
      await hydrateSentencesFromDb(true);
      toast({ title: `지문 ${deleteTarget.code} 삭제됨` });
      setDeleteTarget(null);
      reload();
    } catch (e) {
      toast({
        title: "삭제 실패",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
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

  if (!tb) {
    return (
      <TeacherLayout>
        <div className="p-6 max-w-3xl mx-auto">
          <Card className="p-10 text-center text-sm text-muted-foreground">
            교재를 찾을 수 없습니다.{" "}
            <Link to="/teacher/bookshelf" className="text-primary underline">
              책장으로
            </Link>
          </Card>
        </div>
      </TeacherLayout>
    );
  }

  return (
    <TeacherLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-5">
        <div>
          <Link
            to={`/teacher/bookshelf/${level}`}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="size-3" /> {level && LEVEL_LABEL[level]}
          </Link>
          <h1 className="text-2xl font-bold flex items-center gap-2 mt-1">
            <BookOpen className="size-6 text-primary" /> {tb.title}
            <span className="text-xs font-mono text-muted-foreground">
              {level} · U{tb.unit_no}
            </span>
          </h1>
          {tb.description && (
            <p className="text-sm text-muted-foreground mt-1">{tb.description}</p>
          )}
        </div>

        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-2 px-3 w-12">#</th>
                  <th className="py-2 px-3 w-32">코드</th>
                  <th className="py-2 px-3">본문 (미리보기)</th>
                  <th className="py-2 px-3 w-24">상태</th>
                  <th className="py-2 px-3 w-44 text-right">액션</th>
                </tr>
              </thead>
              <tbody>
                {passages.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-sm text-muted-foreground">
                      아직 지문이 없습니다. 이전 화면의 <strong>교재 만들기</strong>로 본문을
                      삽입하세요.
                    </td>
                  </tr>
                ) : (
                  passages.map((p) => {
                    const ready = p.analysis_status === "ready";
                    return (
                      <tr key={p.id} className="border-b border-border/50 hover:bg-muted/30">
                        <td className="py-2 px-3 font-mono text-xs">{p.passage_no}</td>
                        <td className="py-2 px-3 font-mono text-xs text-primary">{p.code}</td>
                        <td className="py-2 px-3 text-xs text-foreground/80 max-w-xl">
                          <span className="line-clamp-2">{p.english}</span>
                        </td>
                        <td className="py-2 px-3">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold",
                              ready
                                ? "bg-[hsl(142_71%_29%_/_0.15)] text-[hsl(var(--success-foreground,142_71%_29%))]"
                                : "bg-[hsl(38_92%_40%_/_0.15)] text-[hsl(var(--warning-foreground,38_92%_40%))]",
                            )}
                          >
                            {ready ? (
                              <>
                                <FileCheck className="size-3" /> ready
                              </>
                            ) : (
                              <>
                                <FileEdit className="size-3" /> draft
                              </>
                            )}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right whitespace-nowrap">
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Hand-out 인쇄"
                            onClick={() =>
                              window.open(
                                `/teacher/handout/${encodeURIComponent(p.code)}`,
                                "_blank",
                              )
                            }
                          >
                            <Printer className="size-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              navigate(
                                `/teacher/bookshelf/${level}/${tb.unit_no}/${encodeURIComponent(
                                  p.code,
                                )}/edit`,
                              )
                            }
                          >
                            <Pencil className="size-3.5 mr-1" /> 정답 설정
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            title="지문 삭제"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10 ml-1"
                            onClick={() => setDeleteTarget(p)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </TeacherLayout>
  );
};

export default BookshelfUnit;

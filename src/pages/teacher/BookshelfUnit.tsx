// ============================================================
// BookshelfUnit — 유닛(예: 2603모고) 안의 지문 목록.
// ============================================================
import { useEffect, useRef, useState } from "react";
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
import {
  ChevronLeft,
  Loader2,
  BookOpen,
  FileEdit,
  FileCheck,
  Pencil,
  Printer,
  Trash2,
  Sparkles,
  Upload,
  FileText,
  X,
} from "lucide-react";
import { LEVEL_LABEL, type LevelCode } from "@/lib/levels";
import {
  fetchSeries,
  fetchTextbook,
  fetchUnit,
  fetchPassagesByUnit,
  deletePassage,
  uploadAnalysisPdf,
  deleteAnalysisPdf,
  type Series,
  type Textbook,
  type Unit,
  type Passage,
} from "@/lib/textbooks";
import { hydrateSentencesFromDb } from "@/lib/sentenceSource";
import { supabase } from "@/integrations/supabase/client";
import { launchPrintHtml } from "@/lib/printLauncher";
import {
  buildHandoutPrintHtmlFor,
  printStageMessage,
  PrintPreloadError,
} from "@/lib/printPreload";
import { runExtraction } from "@/lib/wordExtraction";
import { errMsg } from "@/lib/errMsg";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const BookshelfUnit = () => {
  const { level, seriesNo, volumeNo, unitNo } = useParams<{
    level: LevelCode;
    seriesNo: string;
    volumeNo: string;
    unitNo: string;
  }>();
  const navigate = useNavigate();
  const [series, setSeries] = useState<Series | null>(null);
  const [textbook, setTextbook] = useState<Textbook | null>(null);
  const [unit, setUnit] = useState<Unit | null>(null);
  const [passages, setPassages] = useState<Passage[]>([]);
  const [extractedMap, setExtractedMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Passage | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [extractingCode, setExtractingCode] = useState<string | null>(null);
  const [printingCode, setPrintingCode] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const handlePdfPick = (passageId: string) => {
    fileInputRefs.current[passageId]?.click();
  };

  const handlePdfChange = async (
    p: Passage,
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.type && file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      toast({ title: "PDF 파일만 업로드할 수 있어요", variant: "destructive" });
      return;
    }
    setUploadingId(p.id);
    try {
      const updated = await uploadAnalysisPdf(p.id, file);
      setPassages((prev) => prev.map((x) => (x.id === p.id ? updated : x)));
      toast({ title: "분석자료 업로드 완료", description: file.name });
    } catch (err) {
      toast({ title: "업로드 실패", description: errMsg(err), variant: "destructive" });
    } finally {
      setUploadingId(null);
    }
  };

  const handlePdfDelete = async (p: Passage) => {
    if (!window.confirm(`'${p.analysis_pdf_name ?? "분석자료"}' 파일을 삭제할까요?`)) return;
    setUploadingId(p.id);
    try {
      await deleteAnalysisPdf(p);
      setPassages((prev) =>
        prev.map((x) =>
          x.id === p.id
            ? { ...x, analysis_pdf_url: null, analysis_pdf_name: null, analysis_pdf_uploaded_at: null }
            : x,
        ),
      );
      toast({ title: "분석자료 삭제됨" });
    } catch (err) {
      toast({ title: "삭제 실패", description: errMsg(err), variant: "destructive" });
    } finally {
      setUploadingId(null);
    }
  };

  const handleExtract = async (p: Passage) => {
    if (extractingCode) return;
    setExtractingCode(p.code);
    try {
      const res = await runExtraction(p.code, p.english);
      if ("error" in res) {
        const status = res.status;
        if (status === 429) {
          toast({
            title: "잠시 후 다시 시도해 주세요",
            description: "AI 호출 한도 초과",
            variant: "destructive",
          });
        } else if (status === 402) {
          toast({ title: "AI 크레딧이 소진되었어요", variant: "destructive" });
        } else if (status === 403) {
          toast({ title: "권한이 없습니다", variant: "destructive" });
        } else {
          toast({ title: "추출 실패", description: res.error, variant: "destructive" });
        }
        return;
      }
      toast({ title: "✨ 단어 추출 완료", description: `${res.count}개 단어` });
      setExtractedMap((prev) => ({ ...prev, [p.code]: res.count }));
    } finally {
      setExtractingCode(null);
    }
  };

  const handlePrint = async (p: Passage) => {
    if (printingCode) return;
    setPrintingCode(p.code);
    try {
      const html = await buildHandoutPrintHtmlFor({ sentenceId: p.code });
      await launchPrintHtml(html, { jobKey: `book-handout:${p.code}` });
    } catch (e) {
      const msg = e instanceof PrintPreloadError ? printStageMessage(e.stage) : errMsg(e);
      toast({ title: "인쇄 실패", description: msg, variant: "destructive" });
    } finally {
      setPrintingCode(null);
    }
  };

  const reload = async () => {
    if (!level || !seriesNo || !volumeNo || !unitNo) return;
    setLoading(true);
    try {
      const sNo = parseInt(seriesNo, 10);
      const vNo = parseInt(volumeNo, 10);
      const uNo = parseInt(unitNo, 10);
      const s = await fetchSeries(level, sNo);
      setSeries(s);
      if (!s) return;
      const tb = await fetchTextbook(s.id, vNo);
      setTextbook(tb);
      if (!tb) return;
      const u = await fetchUnit(tb.id, uNo);
      setUnit(u);
      if (!u) return;
      const ps = await fetchPassagesByUnit(u.id);
      setPassages(ps);
      const ids = ps.map((p) => p.code);
      if (ids.length > 0) {
        const { data } = await supabase
          .from("sentence_word_extractions")
          .select("sentence_id, words")
          .in("sentence_id", ids);
        const map: Record<string, number> = {};
        (data ?? []).forEach((row) => {
          const arr = Array.isArray(row.words) ? row.words : [];
          map[row.sentence_id as string] = arr.length;
        });
        setExtractedMap(map);
      } else {
        setExtractedMap({});
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level, seriesNo, volumeNo, unitNo]);

  const handleDeletePassage = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deletePassage(deleteTarget.id);
      await hydrateSentencesFromDb(true);
      toast({ title: `지문 ${deleteTarget.code} 삭제됨` });
      setDeleteTarget(null);
      void reload();
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

  if (!series || !textbook || !unit) {
    return (
      <TeacherLayout>
        <div className="p-6 max-w-3xl mx-auto">
          <Card className="p-10 text-center text-sm text-muted-foreground">
            유닛을 찾을 수 없습니다.{" "}
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
            to={`/teacher/bookshelf/${level}/${series.series_no}/${textbook.volume_no}`}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="size-3" /> {textbook.title}
          </Link>
          <h1 className="text-2xl font-bold flex items-center gap-2 mt-1">
            <BookOpen className="size-6 text-primary" /> {unit.title}
            <span className="text-xs font-mono text-muted-foreground">
              {level && LEVEL_LABEL[level]} · {series.title} · {textbook.title} · U
              {unit.unit_no}
            </span>
          </h1>
          {unit.description && (
            <p className="text-sm text-muted-foreground mt-1">{unit.description}</p>
          )}
        </div>

        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-2 px-3 w-12">#</th>
                  <th className="py-2 px-3 w-44">코드</th>
                  <th className="py-2 px-3">본문 (미리보기)</th>
                  <th className="py-2 px-3 w-28">단어추출</th>
                  <th className="py-2 px-3 w-28">분석상태</th>
                  <th className="py-2 px-3 w-44">분석자료(PDF)</th>
                  <th className="py-2 px-3 w-44 text-right">액션</th>
                </tr>
              </thead>
              <tbody>
                {passages.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="py-12 text-center text-sm text-muted-foreground"
                    >
                      아직 지문이 없습니다. 이전 화면의 <strong>본문 삽입</strong>으로
                      지문을 추가하세요.
                    </td>
                  </tr>
                ) : (
                  passages.map((p) => {
                    const ready = p.analysis_status === "ready";
                    const wordCount = extractedMap[p.code] ?? 0;
                    const hasExtracted = wordCount > 0;
                    return (
                      <tr key={p.id} className="border-b border-border/50 hover:bg-muted/30">
                        <td className="py-2 px-3 font-mono text-xs">{p.passage_no}</td>
                        <td className="py-2 px-3 font-mono text-[10px] text-primary truncate">
                          {p.code}
                        </td>
                        <td className="py-2 px-3 text-xs text-foreground/80 max-w-xl">
                          <span className="line-clamp-2">{p.english}</span>
                        </td>
                        <td className="py-2 px-3">
                          {hasExtracted ? (
                            <button
                              type="button"
                              onClick={() => handleExtract(p)}
                              disabled={extractingCode === p.code}
                              title="다시 추출"
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/15 text-primary hover:bg-primary/25 transition disabled:opacity-50"
                            >
                              {extractingCode === p.code ? (
                                <Loader2 className="size-3 animate-spin" />
                              ) : (
                                <Sparkles className="size-3" />
                              )}
                              {wordCount}개
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleExtract(p)}
                              disabled={extractingCode === p.code}
                              title="AI 단어 추출"
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-muted text-muted-foreground hover:bg-primary/15 hover:text-primary transition disabled:opacity-50"
                            >
                              {extractingCode === p.code ? (
                                <Loader2 className="size-3 animate-spin" />
                              ) : (
                                <Sparkles className="size-3" />
                              )}
                              {extractingCode === p.code ? "추출 중…" : "미추출"}
                            </button>
                          )}
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
                                <FileCheck className="size-3" /> 완료
                              </>
                            ) : (
                              <>
                                <FileEdit className="size-3" /> 준비중
                              </>
                            )}
                          </span>
                        </td>
                        <td className="py-2 px-3">
                          <input
                            ref={(el) => (fileInputRefs.current[p.id] = el)}
                            type="file"
                            accept="application/pdf,.pdf"
                            className="hidden"
                            onChange={(e) => handlePdfChange(p, e)}
                          />
                          {p.analysis_pdf_url ? (
                            <div className="flex items-center gap-1">
                              <span
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-bold max-w-[140px] truncate"
                                title={p.analysis_pdf_name ?? ""}
                              >
                                <FileText className="size-3 shrink-0" />
                                <span className="truncate">{p.analysis_pdf_name ?? "PDF"}</span>
                              </span>
                              <button
                                type="button"
                                onClick={() => handlePdfPick(p.id)}
                                disabled={uploadingId === p.id}
                                title="교체"
                                className="p-1 rounded hover:bg-muted text-muted-foreground"
                              >
                                {uploadingId === p.id ? (
                                  <Loader2 className="size-3 animate-spin" />
                                ) : (
                                  <Upload className="size-3" />
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() => handlePdfDelete(p)}
                                disabled={uploadingId === p.id}
                                title="삭제"
                                className="p-1 rounded hover:bg-destructive/10 text-destructive"
                              >
                                <X className="size-3" />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handlePdfPick(p.id)}
                              disabled={uploadingId === p.id}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-muted text-muted-foreground hover:bg-primary/15 hover:text-primary transition disabled:opacity-50"
                            >
                              {uploadingId === p.id ? (
                                <Loader2 className="size-3 animate-spin" />
                              ) : (
                                <Upload className="size-3" />
                              )}
                              {uploadingId === p.id ? "업로드 중…" : "PDF 업로드"}
                            </button>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right whitespace-nowrap">
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Hand-out 인쇄"
                            disabled={printingCode === p.code}
                            onClick={() => handlePrint(p)}
                          >
                            {printingCode === p.code ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <Printer className="size-3.5" />
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              navigate(
                                `/teacher/bookshelf/${level}/${series.series_no}/${textbook.volume_no}/${unit.unit_no}/${encodeURIComponent(
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

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>지문을 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-mono text-foreground">{deleteTarget?.code}</span>{" "}
              지문과 관련된 분석/학습 기록은 그대로 남지만, 책장에서는 더 이상 보이지
              않습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeletePassage}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="size-3.5 mr-1 animate-spin" />}삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TeacherLayout>
  );
};

export default BookshelfUnit;

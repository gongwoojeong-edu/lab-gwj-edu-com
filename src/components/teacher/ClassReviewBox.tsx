import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, CheckCircle2, ChevronLeft, ChevronRight, Download, Eye, EyeOff, FileDown, Loader2, Presentation, RotateCcw, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import type { HeldTeacher } from "@/lib/heldTeachers";
import { deliverFile, slidesToPdf, slidesToPng } from "@/lib/classSlideExport";
import { classCaptureFilename, classPdfFilename } from "@/lib/classSlideExportMeta";
import { completeClassReviewAttendance, fetchClassReviewStudents, fetchClassReviewGroups, filterGroupsByStudent, removeClassReview, setClassReviewStatus, type ClassReviewGroup, type ClassReviewStudent } from "@/lib/classReview";

interface Props { isAdmin: boolean; viewerId: string | null; teachers: HeldTeacher[]; onProjectingChange?: (open: boolean) => void }

const sourceLabel = (g: ClassReviewGroup) =>
  [g.seriesTitle, g.volumeNo != null ? `${g.volumeNo}과` : null, g.unitNo != null ? `${g.unitNo}번 유닛` : null, g.passageNo != null ? `${g.passageNo}번` : null]
    .filter(Boolean).join(" · ") || g.sentenceId;

export function ClassReviewBox({ isAdmin, viewerId, teachers, onProjectingChange }: Props) {
  const [status, setStatus] = useState<"open" | "done">("open");
  const [groups, setGroups] = useState<ClassReviewGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [teacherFilter, setTeacherFilter] = useState("mine");
  const [seriesFilter, setSeriesFilter] = useState("all");
  const [volumeFilter, setVolumeFilter] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [projecting, setProjecting] = useState(false);
  const [acting, setActing] = useState(false);
  const [attendanceOpen, setAttendanceOpen] = useState(false);
  const [students, setStudents] = useState<ClassReviewStudent[]>([]);
  const [attendees, setAttendees] = useState<Set<string>>(new Set());
  const [studentSearch, setStudentSearch] = useState("");
  const [studentQuery, setStudentQuery] = useState("");
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentsError, setStudentsError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(false);
    try { setGroups(await fetchClassReviewGroups(status)); setSelected(new Set()); }
    catch { setError(true); toast({ title: "수업 자료함을 불러오지 못했어요", variant: "destructive" }); }
    finally { setLoading(false); }
  }, [status]);
  useEffect(() => { load(); }, [load]);

  // 프로젝터가 열려 있는 동안 부모 화면의 실시간 새로고침을 멈추도록 알림
  useEffect(() => {
    onProjectingChange?.(projecting);
    return () => { if (projecting) onProjectingChange?.(false); };
  }, [projecting, onProjectingChange]);

  const byTeacher = useMemo(() => {
    if (!isAdmin || teacherFilter === "all") return groups;
    const id = teacherFilter === "mine" ? viewerId : teacherFilter;
    return groups.filter(g => id && g.teacherIds.includes(id));
  }, [groups, isAdmin, teacherFilter, viewerId]);
  const seriesList = useMemo(() => [...new Set(byTeacher.map(g => g.seriesTitle ?? "기타"))], [byTeacher]);
  const volumeList = useMemo(() => [...new Set(byTeacher.filter(g => seriesFilter === "all" || (g.seriesTitle ?? "기타") === seriesFilter)
    .map(g => g.volumeNo).filter((v): v is number => v != null))].sort((a, b) => a - b), [byTeacher, seriesFilter]);
  const visible = useMemo(() => filterGroupsByStudent(byTeacher.filter(g =>
    (seriesFilter === "all" || (g.seriesTitle ?? "기타") === seriesFilter) &&
    (volumeFilter === "all" || String(g.volumeNo) === volumeFilter)), studentQuery), [byTeacher, seriesFilter, volumeFilter, studentQuery]);

  const chosen = visible.filter(g => selected.has(g.sentenceId));
  const toggle = (id: string) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allChecked = visible.length > 0 && visible.every(g => selected.has(g.sentenceId));

  const act = async (fn: () => Promise<void>, ok: string) => {
    if (acting) return;
    setActing(true);
    try { await fn(); toast({ title: ok }); await load(); }
    catch (e) { toast({ title: "처리하지 못했어요", description: e instanceof Error ? e.message : (e as { message?: string })?.message, variant: "destructive" }); }
    finally { setActing(false); }
  };
  const ids = chosen.flatMap(g => g.itemIds);
  const loadStudents = async () => {
    if (!viewerId) return;
    setStudentsLoading(true); setStudentsError(false);
    try {
      const eligible = await fetchClassReviewStudents(viewerId, isAdmin, chosen.map(g => g.sentenceId));
      setStudents(eligible);
      setAttendees(prev => new Set([...prev].filter(id => eligible.some(st => st.user_id === id))));
    }
    catch { setStudentsError(true); toast({ title: "학생 목록을 불러오지 못했어요", variant: "destructive" }); }
    finally { setStudentsLoading(false); }
  };
  const openAttendance = () => {
    setAttendees(new Set(chosen.flatMap(g => g.studentIds)));
    setStudentSearch(""); setAttendanceOpen(true); void loadStudents();
  };
  const matchingStudents = students.filter(st => `${st.display_name ?? ""} ${st.student_no}`.toLowerCase().includes(studentSearch.trim().toLowerCase()));
  const finishClass = async () => {
    if (acting) return;
    setActing(true);
    try {
      await completeClassReviewAttendance(ids, [...attendees]);
      setAttendanceOpen(false);
      toast({ title: `수업 완료 — 참여 학생 ${attendees.size}명에게 코칭 재학습을 보냈어요` });
      await load();
    } catch (e) { toast({ title: "수업 완료 실패", description: (e as { message?: string })?.message, variant: "destructive" }); }
    finally { setActing(false); }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={status} onValueChange={v => setStatus(v as "open" | "done")}>
          <SelectTrigger className="w-32" aria-label="상태"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="open">수업 예정</SelectItem><SelectItem value="done">수업 완료</SelectItem></SelectContent>
        </Select>
        {isAdmin && <Select value={teacherFilter} onValueChange={setTeacherFilter}>
          <SelectTrigger className="w-44" aria-label="담당 선생님"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="mine">내 수업 자료함</SelectItem>
            <SelectItem value="all">전체</SelectItem>
            {teachers.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
          </SelectContent>
        </Select>}
        <Select value={seriesFilter} onValueChange={v => { setSeriesFilter(v); setVolumeFilter("all"); }}>
          <SelectTrigger className="w-60" aria-label="책 시리즈"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">모든 시리즈</SelectItem>
            {seriesList.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={volumeFilter} onValueChange={setVolumeFilter}>
          <SelectTrigger className="w-28" aria-label="과"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">모든 과</SelectItem>
            {volumeList.map(v => <SelectItem key={v} value={String(v)}>{v}과</SelectItem>)}
          </SelectContent>
        </Select>
        <Input aria-label="수업 자료함 학생 검색" placeholder="학생 이름 또는 학번 검색" value={studentQuery}
          onChange={e => setStudentQuery(e.target.value)} className="w-56" />
        {studentQuery.trim() && <Button size="sm" variant="ghost" onClick={() => setStudentQuery("")}>검색 지우기</Button>}
      </div>

      {error && <div role="alert" className="flex items-center gap-2 text-sm text-destructive">수업 자료함을 불러오지 못했습니다.
        <Button size="sm" variant="outline" onClick={load}>다시 불러오기</Button></div>}

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={allChecked} onCheckedChange={() => setSelected(allChecked ? new Set() : new Set(visible.map(g => g.sentenceId)))} />
          전체 선택 ({chosen.length}/{visible.length})
        </label>
        <Button size="sm" disabled={!chosen.length} onClick={() => setProjecting(true)}><Presentation className="size-4 mr-1" /> 프로젝터로 보기</Button>
        {status === "open"
          ? <Button size="sm" variant="outline" disabled={!chosen.length || acting} onClick={openAttendance}><CheckCircle2 className="size-4 mr-1" /> 수업 완료</Button>
          : <Button size="sm" variant="outline" disabled={!chosen.length || acting} onClick={() => act(() => setClassReviewStatus(ids, "open"), "수업 예정으로 되돌렸어요")}><RotateCcw className="size-4 mr-1" /> 되돌리기</Button>}
        <Button size="sm" variant="ghost" disabled={!chosen.length || acting} onClick={() => act(() => removeClassReview(ids), "자료함에서 뺐어요")}><Trash2 className="size-4 mr-1" /> 빼기</Button>
      </div>

      {loading && !groups.length && <Card className="p-8 text-center text-muted-foreground">불러오는 중...</Card>}
      {!loading && !visible.length && !error && <Card className="p-8 text-center text-muted-foreground">
        {studentQuery.trim() ? `"${studentQuery.trim()}"로 찾은 수업 문장이 없어요.`
          : status === "open" ? "담긴 문장이 없어요. 승인창의 [수업] 버튼으로 담을 수 있어요." : "수업 완료한 문장이 없어요."}</Card>}

      <div className="space-y-2">
        {visible.map(g => (
          <Card key={g.sentenceId} className="p-3 flex gap-3 items-start">
            <Checkbox className="mt-1" checked={selected.has(g.sentenceId)} onCheckedChange={() => toggle(g.sentenceId)} aria-label="선택" />
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <span>{sourceLabel(g)}</span>
                <Badge variant="secondary">학생 {g.studentIds.length}명 · {g.students.map(st => st.name).join(", ")}</Badge>
                {g.teacherIds.map(t => <Badge key={t} variant="outline">{teachers.find(x => x.id === t)?.name ?? "선생님"}</Badge>)}
              </div>
              <p className="font-medium">{g.english}</p>
              {g.notes.map(n => <p key={n} className="text-sm text-primary">· {n}</p>)}
            </div>
          </Card>
        ))}
      </div>

      {projecting && <ClassReviewProjector items={chosen} onClose={() => setProjecting(false)} />}
      <Dialog open={attendanceOpen} onOpenChange={v => { if (!acting) setAttendanceOpen(v); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>수업 참여 학생 · {chosen.length}문장</DialogTitle></DialogHeader>
          <Input aria-label="참여 학생 검색" placeholder="학생 이름 또는 학번 검색" value={studentSearch} onChange={e => setStudentSearch(e.target.value)} />
          <div className="flex flex-wrap gap-1 text-sm">
            {students.filter(st => attendees.has(st.user_id)).map(st => <Badge key={st.user_id} variant="secondary">{st.display_name || st.student_no}</Badge>)}
          </div>
          {studentsError && <div role="alert" className="text-destructive">학생 목록을 불러오지 못했습니다. <Button variant="outline" size="sm" onClick={loadStudents}>다시 불러오기</Button></div>}
          <div className="max-h-72 overflow-y-auto space-y-1">
            {!studentsLoading && !studentsError && !matchingStudents.length && <p className="text-muted-foreground">해당 문장에 학습 지정된 학생이 없습니다.</p>}
            {studentsLoading ? <p className="text-muted-foreground">불러오는 중...</p> : matchingStudents.map(st => <label key={st.user_id} className="flex items-center gap-3 py-2">
              <Checkbox aria-label={`${st.display_name || st.student_no} 참여`} checked={attendees.has(st.user_id)} onCheckedChange={checked => setAttendees(prev => { const next = new Set(prev); checked ? next.add(st.user_id) : next.delete(st.user_id); return next; })} />
              <span>{st.display_name || st.student_no}</span><span className="text-sm text-muted-foreground">{st.student_no}</span>
            </label>)}
          </div>
          <DialogFooter><Button variant="outline" disabled={acting} onClick={() => setAttendanceOpen(false)}>취소</Button><Button disabled={acting || studentsLoading || studentsError || !attendees.size} onClick={finishClass}><CheckCircle2 className="size-4 mr-1" />{acting ? "처리 중..." : `수업 완료 · ${attendees.size}명`}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** 수업 화면 한 장 — 프로젝터와 캡처/PDF가 같은 모양을 쓴다 */
function ClassSlide({ g, showKo, forExport = false }: { g: ClassReviewGroup; showKo: boolean; forExport?: boolean }) {
  return (
    <div data-class-slide className={forExport ? "flex flex-col gap-8 bg-card text-card-foreground px-16 pt-10 pb-48" : "flex flex-col gap-8 px-6 md:px-12 py-8 pb-24"}>
      {forExport && <p className="text-xl text-muted-foreground">{sourceLabel(g)}</p>}
      <p className={`class-review-original font-semibold py-8 break-words ${forExport ? "text-5xl" : "text-4xl md:text-5xl"}`}>{g.english}</p>
      {showKo && g.korean && <p className="text-2xl md:text-3xl text-muted-foreground leading-relaxed">{g.korean}</p>}
      {g.students.length > 0 && <div className="space-y-3 border-t border-border pt-6">
        {g.students.map(st => <div key={st.userId} className="text-2xl leading-relaxed">
          <span className="font-semibold text-primary mr-3">{st.name}</span>
          <span>{st.translation ?? "(제출한 해석 없음)"}</span>
        </div>)}
      </div>}
      {g.notes.length > 0 && <div className="space-y-1">{g.notes.map(n => <p key={n} className="text-2xl text-primary">· {n}</p>)}</div>}
    </div>
  );
}

type ExportJob = { kind: "png" | "pdf"; items: ClassReviewGroup[]; showKo: boolean; filename: string };

function ClassReviewProjector({ items, onClose }: { items: ClassReviewGroup[]; onClose: () => void }) {
  const [i, setI] = useState(0);
  const [showKo, setShowKo] = useState(false);
  const [job, setJob] = useState<ExportJob | null>(null);
  const [ready, setReady] = useState<{ blob: Blob; filename: string } | null>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  const g = items[i];
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") { setI(x => Math.min(items.length - 1, x + 1)); setShowKo(false); }
      if (e.key === "ArrowLeft") { setI(x => Math.max(0, x - 1)); setShowKo(false); }
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    document.documentElement.requestFullscreen?.().catch(() => {});
    return () => { window.removeEventListener("keydown", h); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); };
  }, [items.length, onClose]);

  // 화면 밖에 슬라이드를 그려 파일로 만든다. 만든 뒤에는 [저장] 버튼으로 바로 내려받는다(아이패드 공유 시트 유지).
  useEffect(() => {
    if (!job) return;
    let cancelled = false;
    (async () => {
      try {
        await document.fonts?.ready;
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        const nodes = [...(exportRef.current?.querySelectorAll<HTMLElement>("[data-class-slide]") ?? [])];
        const blob = job.kind === "pdf" ? await slidesToPdf(nodes) : await slidesToPng(nodes[0]);
        if (!cancelled) setReady({ blob, filename: job.filename });
      } catch (e) {
        if (!cancelled) toast({ title: job.kind === "pdf" ? "PDF를 만들지 못했어요" : "캡처하지 못했어요", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
      } finally { if (!cancelled) setJob(null); }
    })();
    return () => { cancelled = true; };
  }, [job]);

  const startCapture = () => { if (!g || job) return; setReady(null); setJob({ kind: "png", items: [g], showKo, filename: classCaptureFilename(i + 1) }); };
  const startPdf = () => { if (job) return; setReady(null); setJob({ kind: "pdf", items, showKo, filename: classPdfFilename() }); };

  if (!g) return null;
  return (
    <div className="fixed inset-0 z-[100] bg-background flex flex-col">
      <div className="flex items-center gap-3 px-6 py-3 border-b border-border">
        <span className="text-muted-foreground min-w-0 flex-1 truncate">{sourceLabel(g)}</span>
        {ready ? <div className="flex items-center gap-1 shrink-0">
          <Button size="sm" onClick={() => { void deliverFile(ready.blob, ready.filename); }}><Download className="size-4 mr-1" /> 저장 · {ready.filename.endsWith(".pdf") ? "PDF" : "이미지"}</Button>
          <Button size="sm" variant="ghost" onClick={() => setReady(null)}>취소</Button>
        </div> : <>
          <Button size="sm" variant="outline" className="shrink-0" disabled={!!job} onClick={startCapture} title="지금 보이는 문장을 이미지로 저장">
            {job?.kind === "png" ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Camera className="size-4 mr-1" />} 캡처
          </Button>
          <Button size="sm" variant="outline" className="shrink-0" disabled={!!job} onClick={startPdf} title={`선택한 ${items.length}문장을 PDF로 저장${showKo ? " (해석 포함)" : ""}`}>
            {job?.kind === "pdf" ? <Loader2 className="size-4 mr-1 animate-spin" /> : <FileDown className="size-4 mr-1" />} PDF {items.length}장{showKo ? " · 해석 포함" : ""}
          </Button>
        </>}
        <span className="text-muted-foreground shrink-0">{i + 1} / {items.length}</span>
        <Button variant="outline" size="icon" aria-label={showKo ? "해석 가리기" : "해석 보기"} title={showKo ? "해석 가리기" : "해석 보기"} onClick={() => { setShowKo(v => !v); setReady(null); }}>
          {showKo ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
        </Button>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="닫기"><X className="size-5" /></Button>
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        <ClassSlide g={g} showKo={showKo} />
      </div>
      <div className="flex justify-between px-6 py-4 border-t border-border">
        <Button variant="outline" size="lg" disabled={i === 0} onClick={() => { setI(i - 1); setShowKo(false); setReady(null); }}><ChevronLeft className="size-5 mr-1" /> 이전</Button>
        <Button variant="outline" size="lg" disabled={i === items.length - 1} onClick={() => { setI(i + 1); setShowKo(false); setReady(null); }}>다음 <ChevronRight className="size-5 ml-1" /></Button>
      </div>
      {job && <div ref={exportRef} aria-hidden className="fixed top-0 pointer-events-none" style={{ left: -20000, width: 1280 }}>
        {job.items.map(it => <ClassSlide key={it.sentenceId} g={it} showKo={job.showKo} forExport />)}
      </div>}
    </div>
  );
}

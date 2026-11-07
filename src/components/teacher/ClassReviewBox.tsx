import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Eye, EyeOff, Presentation, RotateCcw, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import type { HeldTeacher } from "@/lib/heldTeachers";
import { fetchClassReviewGroups, removeClassReview, setClassReviewStatus, type ClassReviewGroup } from "@/lib/classReview";

interface Props { isAdmin: boolean; viewerId: string | null; teachers: HeldTeacher[] }

const sourceLabel = (g: ClassReviewGroup) =>
  [g.seriesTitle, g.volumeNo != null ? `${g.volumeNo}과` : null, g.unitNo != null ? `${g.unitNo}번 유닛` : null, g.passageNo != null ? `${g.passageNo}번` : null]
    .filter(Boolean).join(" · ") || g.sentenceId;

export function ClassReviewBox({ isAdmin, viewerId, teachers }: Props) {
  const [status, setStatus] = useState<"open" | "done">("open");
  const [groups, setGroups] = useState<ClassReviewGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [teacherFilter, setTeacherFilter] = useState("mine");
  const [seriesFilter, setSeriesFilter] = useState("all");
  const [volumeFilter, setVolumeFilter] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [projecting, setProjecting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(false);
    try { setGroups(await fetchClassReviewGroups(status)); setSelected(new Set()); }
    catch { setError(true); toast({ title: "수업 자료함을 불러오지 못했어요", variant: "destructive" }); }
    finally { setLoading(false); }
  }, [status]);
  useEffect(() => { load(); }, [load]);

  const byTeacher = useMemo(() => {
    if (!isAdmin || teacherFilter === "all") return groups;
    const id = teacherFilter === "mine" ? viewerId : teacherFilter;
    return groups.filter(g => id && g.teacherIds.includes(id));
  }, [groups, isAdmin, teacherFilter, viewerId]);
  const seriesList = useMemo(() => [...new Set(byTeacher.map(g => g.seriesTitle ?? "기타"))], [byTeacher]);
  const volumeList = useMemo(() => [...new Set(byTeacher.filter(g => seriesFilter === "all" || (g.seriesTitle ?? "기타") === seriesFilter)
    .map(g => g.volumeNo).filter((v): v is number => v != null))].sort((a, b) => a - b), [byTeacher, seriesFilter]);
  const visible = useMemo(() => byTeacher.filter(g =>
    (seriesFilter === "all" || (g.seriesTitle ?? "기타") === seriesFilter) &&
    (volumeFilter === "all" || String(g.volumeNo) === volumeFilter)), [byTeacher, seriesFilter, volumeFilter]);

  const chosen = visible.filter(g => selected.has(g.sentenceId));
  const toggle = (id: string) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allChecked = visible.length > 0 && visible.every(g => selected.has(g.sentenceId));

  const act = async (fn: () => Promise<void>, ok: string) => {
    try { await fn(); toast({ title: ok }); await load(); }
    catch { toast({ title: "처리하지 못했어요", variant: "destructive" }); }
  };
  const ids = chosen.flatMap(g => g.itemIds);

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
          ? <Button size="sm" variant="outline" disabled={!chosen.length} onClick={() => act(() => setClassReviewStatus(ids, "done"), "수업 완료로 옮겼어요")}><CheckCircle2 className="size-4 mr-1" /> 수업 완료</Button>
          : <Button size="sm" variant="outline" disabled={!chosen.length} onClick={() => act(() => setClassReviewStatus(ids, "open"), "수업 예정으로 되돌렸어요")}><RotateCcw className="size-4 mr-1" /> 되돌리기</Button>}
        <Button size="sm" variant="ghost" disabled={!chosen.length} onClick={() => act(() => removeClassReview(ids), "자료함에서 뺐어요")}><Trash2 className="size-4 mr-1" /> 빼기</Button>
      </div>

      {loading && !groups.length && <Card className="p-8 text-center text-muted-foreground">불러오는 중...</Card>}
      {!loading && !visible.length && !error && <Card className="p-8 text-center text-muted-foreground">
        {status === "open" ? "담긴 문장이 없어요. 승인창의 [수업] 버튼으로 담을 수 있어요." : "수업 완료한 문장이 없어요."}</Card>}

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
    </div>
  );
}

function ClassReviewProjector({ items, onClose }: { items: ClassReviewGroup[]; onClose: () => void }) {
  const [i, setI] = useState(0);
  const [showKo, setShowKo] = useState(false);
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
  if (!g) return null;
  return (
    <div className="fixed inset-0 z-[100] bg-background flex flex-col">
      <div className="flex items-center gap-3 px-6 py-3 border-b border-border">
        <span className="text-muted-foreground">{sourceLabel(g)}</span>
        <span className="ml-auto text-muted-foreground">{i + 1} / {items.length}</span>
        <Button variant="outline" size="sm" onClick={() => setShowKo(v => !v)}>
          {showKo ? <EyeOff className="size-4 mr-1" /> : <Eye className="size-4 mr-1" />} 해석 {showKo ? "가리기" : "보기"}
        </Button>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="닫기"><X className="size-5" /></Button>
      </div>
      <div className="flex-1 overflow-auto flex flex-col justify-center gap-8 px-12 py-8">
        <p className="text-4xl md:text-5xl font-semibold leading-relaxed">{g.english}</p>
        {showKo && g.korean && <p className="text-2xl md:text-3xl text-muted-foreground leading-relaxed">{g.korean}</p>}
        {g.students.length > 0 && <div className="space-y-3 border-t border-border pt-6">
          {g.students.map(st => <div key={st.userId} className="text-2xl leading-relaxed">
            <span className="font-semibold text-primary mr-3">{st.name}</span>
            <span>{st.translation ?? "(제출한 해석 없음)"}</span>
          </div>)}
        </div>}
        {g.notes.length > 0 && <div className="space-y-1">{g.notes.map(n => <p key={n} className="text-2xl text-primary">· {n}</p>)}</div>}
      </div>
      <div className="flex justify-between px-6 py-4 border-t border-border">
        <Button variant="outline" size="lg" disabled={i === 0} onClick={() => { setI(i - 1); setShowKo(false); }}><ChevronLeft className="size-5 mr-1" /> 이전</Button>
        <Button variant="outline" size="lg" disabled={i === items.length - 1} onClick={() => { setI(i + 1); setShowKo(false); }}>다음 <ChevronRight className="size-5 ml-1" /></Button>
      </div>
    </div>
  );
}

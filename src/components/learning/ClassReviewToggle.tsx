import { useEffect, useState } from "react";
import { Presentation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { HeldTeacher } from "@/lib/heldTeachers";
import { addClassReview, fetchClassReviewForApproval, removeClassReview } from "@/lib/classReview";

const LAST_KEY = "gwjt_last_class_review_teacher_id";

interface Props { sentenceId: string; userId: string; approvalId?: string | null; teachers: HeldTeacher[] }

/** 승인창 "수업" 버튼 — 다음 수업 때 함께 볼 문장으로 담당 선생님 수업 자료함에 담는다. 승인·보류와 별개. */
export function ClassReviewToggle({ sentenceId, userId, approvalId, teachers }: Props) {
  const [items, setItems] = useState<{ id: string; teacher_id: string | null; note: string | null }[]>([]);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  const [open, setOpen] = useState(false);
  const [teacherId, setTeacherId] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    setError(false);
    fetchClassReviewForApproval(sentenceId, userId).then(d => { if (alive) setItems(d); })
      .catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, [sentenceId, userId, reload]);

  useEffect(() => {
    if (!open) return;
    supabase.auth.getUser().then(({ data }) => {
      const pref = localStorage.getItem(LAST_KEY) || data.user?.id || "";
      setTeacherId(teachers.some(t => t.id === pref) ? pref : teachers[0]?.id ?? "");
    });
  }, [open, teachers]);

  const marked = items.length > 0;
  const names = items.map(i => teachers.find(t => t.id === i.teacher_id)?.name ?? "선생님").join(", ");

  const save = async () => {
    if (!teacherId) return;
    setSaving(true);
    try {
      await addClassReview({ sentenceId, userId, approvalId, teacherId, note });
      localStorage.setItem(LAST_KEY, teacherId);
      toast({ title: `${teachers.find(t => t.id === teacherId)?.name ?? "선생님"} 수업 자료함에 담았어요` });
      setOpen(false); setNote(""); setReload(n => n + 1);
    } catch (e) {
      toast({ title: "수업 자료함에 담지 못했어요", description: String((e as Error)?.message ?? e), variant: "destructive" });
    } finally { setSaving(false); }
  };

  const unmark = async () => {
    setSaving(true);
    try { await removeClassReview(items.map(i => i.id)); setReload(n => n + 1); setOpen(false); }
    catch { toast({ title: "해제하지 못했어요", variant: "destructive" }); }
    finally { setSaving(false); }
  };

  if (error) return <div role="alert" className="flex items-center gap-1 text-xs text-destructive">수업 표시를 불러오지 못했어요
    <Button size="sm" variant="ghost" onClick={() => setReload(n => n + 1)}>다시 불러오기</Button></div>;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant={marked ? "secondary" : "outline"} aria-pressed={marked} title="다음 수업에서 함께 볼 문장으로 담기">
          <Presentation className="size-4 mr-1" /> 수업{marked && ` · ${names}`}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-2">
        <p className="text-sm font-semibold">수업 자료함에 담기</p>
        <Select value={teacherId} onValueChange={setTeacherId}>
          <SelectTrigger aria-label="담당 선생님"><SelectValue placeholder="담당 선생님" /></SelectTrigger>
          <SelectContent>{teachers.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
        </Select>
        <Input value={note} onChange={e => setNote(e.target.value)} placeholder="설명할 포인트 (선택)" maxLength={200} />
        <div className="flex gap-2 justify-end">
          {marked && <Button size="sm" variant="ghost" disabled={saving} onClick={unmark}>해제</Button>}
          <Button size="sm" disabled={saving || !teacherId} onClick={save}>담기</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

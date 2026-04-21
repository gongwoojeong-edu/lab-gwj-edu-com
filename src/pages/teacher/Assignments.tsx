import { TeacherLayout } from "@/components/teacher/TeacherLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, ClipboardList, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { fetchAllStudents, type StudentProfile } from "@/lib/studentProfile";

interface AssignmentRow {
  id: string;
  teacher_id: string;
  student_id: string | null;
  title: string;
  description: string | null;
  sentence_id: string | null;
  due_at: string;
  created_at: string;
}

const Assignments = () => {
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [rows, setRows] = useState<AssignmentRow[]>([]);
  const [title, setTitle] = useState("");
  const [studentId, setStudentId] = useState<string>("__all__");
  const [sentenceId, setSentenceId] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState<Date | undefined>();
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [studs, { data }] = await Promise.all([
      fetchAllStudents(),
      supabase.from("assignments").select("*").order("due_at", { ascending: true }),
    ]);
    setStudents(studs);
    setRows((data ?? []) as AssignmentRow[]);
  };

  useEffect(() => {
    void load();
  }, []);

  const handleCreate = async () => {
    if (!title.trim() || !dueDate) {
      toast({ title: "제목과 마감일은 필수입니다", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("로그인이 필요합니다");
      const { error } = await supabase.from("assignments").insert({
        teacher_id: u.user.id,
        student_id: studentId === "__all__" ? null : studentId,
        title: title.trim(),
        description: description.trim() || null,
        sentence_id: sentenceId.trim() || null,
        due_at: dueDate.toISOString(),
      });
      if (error) throw error;
      toast({ title: "✅ 과제가 생성되었습니다" });
      setTitle("");
      setDescription("");
      setSentenceId("");
      setStudentId("__all__");
      setDueDate(undefined);
      void load();
    } catch (e) {
      toast({ title: "저장 실패", description: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("assignments").delete().eq("id", id);
    if (error) {
      toast({ title: "삭제 실패", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "🗑️ 과제 삭제됨" });
    void load();
  };

  const studentName = (id: string | null) => {
    if (!id) return "전체 학생";
    return students.find((s) => s.user_id === id)?.display_name ?? id.slice(0, 6);
  };

  const remaining = (iso: string) => {
    const ms = new Date(iso).getTime() - Date.now();
    if (ms < 0) return { text: "마감", urgent: true };
    const days = Math.floor(ms / 86400000);
    const hours = Math.floor((ms % 86400000) / 3600000);
    return { text: days > 0 ? `${days}일 ${hours}시간 남음` : `${hours}시간 남음`, urgent: days < 1 };
  };

  return (
    <TeacherLayout>
      <div className="p-6 max-w-4xl mx-auto space-y-6 font-kr">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ClipboardList className="size-6 text-primary" /> 특별과제
        </h1>

        <Card className="p-5 space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-primary">새 과제 생성</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>제목 *</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: L05 Unit 3 마감 과제" />
            </div>
            <div className="space-y-1.5">
              <Label>대상 학생</Label>
              <Select value={studentId} onValueChange={setStudentId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">전체 학생</SelectItem>
                  {students.map((s) => (
                    <SelectItem key={s.user_id} value={s.user_id}>
                      {s.display_name ?? s.student_no} ({s.student_no})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>마감일 *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("justify-start text-left font-normal", !dueDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 size-4" />
                    {dueDate ? format(dueDate, "yyyy-MM-dd") : "마감일 선택"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dueDate} onSelect={setDueDate} initialFocus className={cn("p-3 pointer-events-auto")} />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1.5">
              <Label>연결 문장 ID (선택)</Label>
              <Input value={sentenceId} onChange={(e) => setSentenceId(e.target.value)} placeholder="예: s12" />
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <Label>설명 (선택)</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
            </div>
          </div>
          <Button onClick={handleCreate} disabled={saving}>{saving ? "저장 중…" : "과제 생성"}</Button>
        </Card>

        <Card className="p-5 space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-primary">과제 목록 ({rows.length})</h2>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">아직 과제가 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {rows.map((r) => {
                const rem = remaining(r.due_at);
                return (
                  <div key={r.id} className={cn("p-3 rounded-lg border-2 flex items-start justify-between gap-3", rem.urgent ? "border-destructive/40 bg-destructive/5" : "border-border")}>
                    <div className="space-y-1 min-w-0">
                      <div className="font-bold text-foreground">{r.title}</div>
                      <div className="text-xs text-muted-foreground flex flex-wrap gap-2">
                        <span>대상: {studentName(r.student_id)}</span>
                        <span>· 마감: {format(new Date(r.due_at), "yyyy-MM-dd")}</span>
                        <span className={cn("font-bold", rem.urgent ? "text-destructive" : "text-primary")}>· {rem.text}</span>
                        {r.sentence_id && <span>· 문장 {r.sentence_id}</span>}
                      </div>
                      {r.description && <p className="text-xs text-foreground/80 mt-1">{r.description}</p>}
                    </div>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleDelete(r.id)}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </TeacherLayout>
  );
};

export default Assignments;

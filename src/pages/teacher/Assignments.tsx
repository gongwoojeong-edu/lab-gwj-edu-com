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
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { CalendarIcon, ClipboardList, Trash2, BookOpen, Check, ChevronsUpDown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { fetchAllStudents, type StudentProfile } from "@/lib/studentProfile";
import {
  fetchAllTextbooks,
  fetchPassagesByTextbook,
  type Textbook,
  type Passage,
} from "@/lib/textbooks";

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
  const [textbooks, setTextbooks] = useState<Textbook[]>([]);
  const [passagesByTb, setPassagesByTb] = useState<Record<string, Passage[]>>({});
  const [title, setTitle] = useState("");
  const [studentId, setStudentId] = useState<string>("__all__");
  const [selectedTbId, setSelectedTbId] = useState<string>("");
  const [selectedPassageCode, setSelectedPassageCode] = useState<string>("");
  const [tbOpen, setTbOpen] = useState(false);
  const [pgOpen, setPgOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState<Date | undefined>();
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [studs, { data }, tbs] = await Promise.all([
      fetchAllStudents(),
      supabase.from("assignments").select("*").order("due_at", { ascending: true }),
      fetchAllTextbooks(),
    ]);
    setStudents(studs);
    setRows((data ?? []) as AssignmentRow[]);
    setTextbooks(tbs);
  };

  useEffect(() => {
    void load();
  }, []);

  // 교재 선택 시 지문 로드
  useEffect(() => {
    if (!selectedTbId) return;
    if (passagesByTb[selectedTbId]) return;
    void (async () => {
      try {
        const ps = await fetchPassagesByTextbook(selectedTbId);
        setPassagesByTb((m) => ({ ...m, [selectedTbId]: ps }));
      } catch (e) {
        console.error(e);
      }
    })();
  }, [selectedTbId, passagesByTb]);

  const selectedTb = useMemo(
    () => textbooks.find((t) => t.id === selectedTbId) ?? null,
    [textbooks, selectedTbId],
  );

  const tbLabel = (t: Textbook) => `[${t.level}] ${t.title} · Unit ${t.unit_no}`;

  // sentence_id(=passage code) → 사람이 읽는 라벨 매핑
  const codeLabelMap = useMemo(() => {
    const m = new Map<string, string>();
    Object.entries(passagesByTb).forEach(([tbId, ps]) => {
      const tb = textbooks.find((t) => t.id === tbId);
      if (!tb) return;
      ps.forEach((p) => {
        m.set(p.code, `[${tb.level}] ${tb.title} · #${String(p.passage_no).padStart(3, "0")}`);
      });
    });
    return m;
  }, [passagesByTb, textbooks]);

  // 목록에 보이는 sentence_id의 교재 자동 로드 (라벨용)
  useEffect(() => {
    const codes = Array.from(new Set(rows.map((r) => r.sentence_id).filter(Boolean) as string[]));
    const missing = codes.filter((c) => !codeLabelMap.has(c));
    if (missing.length === 0 || textbooks.length === 0) return;
    void (async () => {
      const { data } = await supabase
        .from("textbook_passages")
        .select("textbook_id")
        .in("code", missing);
      const tbIds = Array.from(new Set((data ?? []).map((d: any) => d.textbook_id as string)));
      for (const id of tbIds) {
        if (passagesByTb[id]) continue;
        try {
          const ps = await fetchPassagesByTextbook(id);
          setPassagesByTb((m) => ({ ...m, [id]: ps }));
        } catch (e) {
          console.error(e);
        }
      }
    })();
  }, [rows, codeLabelMap, textbooks, passagesByTb]);

  const handleCreate = async () => {
    if (!title.trim() || !dueDate) {
      toast({ title: "제목과 마감일은 필수입니다", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("로그인이 필요합니다");
      // 마감일을 그날 23:59:59.999로 보정 (자정 입력 시 즉시 만료 방지)
      const endOfDay = new Date(dueDate);
      endOfDay.setHours(23, 59, 59, 999);
      const { error } = await supabase.from("assignments").insert({
        teacher_id: u.user.id,
        student_id: studentId === "__all__" ? null : studentId,
        title: title.trim(),
        description: description.trim() || null,
        sentence_id: selectedPassageCode || null,
        due_at: endOfDay.toISOString(),
      });
      if (error) throw error;
      toast({ title: "✅ 과제가 생성되었습니다" });
      setTitle("");
      setDescription("");
      setSelectedTbId("");
      setSelectedPassageCode("");
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

  const currentPassages = selectedTbId ? passagesByTb[selectedTbId] ?? [] : [];
  const selectedPassage = currentPassages.find((p) => p.code === selectedPassageCode);

  const triggerLabel = () => {
    if (!selectedTb) return "교재 선택";
    const tbPart = tbLabel(selectedTb);
    if (!selectedPassage) return tbPart;
    const preview = selectedPassage.english.slice(0, 30);
    return `${tbPart} / #${String(selectedPassage.passage_no).padStart(3, "0")} ${preview}…`;
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
              <Label>연결 교재 (선택)</Label>
              <Popover open={tbOpen} onOpenChange={setTbOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className={cn("w-full justify-between text-left font-normal", !selectedTb && "text-muted-foreground")}
                  >
                    <span className="flex items-center gap-2 min-w-0 truncate">
                      <BookOpen className="size-4 shrink-0" />
                      <span className="truncate">{selectedTb ? tbLabel(selectedTb) : "교재 검색·선택"}</span>
                    </span>
                    <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0 bg-popover" align="start">
                  <Command>
                    <CommandInput placeholder="레벨/제목/Unit 검색…" />
                    <CommandList>
                      <CommandEmpty>일치하는 교재가 없습니다.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          value="__none__ 미지정"
                          onSelect={() => {
                            setSelectedTbId("");
                            setSelectedPassageCode("");
                            setTbOpen(false);
                          }}
                        >
                          <Check className={cn("mr-2 size-4", !selectedTbId ? "opacity-100" : "opacity-0")} />
                          교재 미지정
                        </CommandItem>
                        {textbooks.map((t) => (
                          <CommandItem
                            key={t.id}
                            value={`${t.level} ${t.title} unit ${t.unit_no} u${t.unit_no}`}
                            onSelect={() => {
                              setSelectedTbId(t.id);
                              setSelectedPassageCode("");
                              setTbOpen(false);
                            }}
                          >
                            <Check className={cn("mr-2 size-4", selectedTbId === t.id ? "opacity-100" : "opacity-0")} />
                            {tbLabel(t)}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1.5">
              <Label>연결 지문 (선택)</Label>
              <Popover open={pgOpen} onOpenChange={(o) => selectedTbId && setPgOpen(o)}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    disabled={!selectedTbId}
                    className={cn("w-full justify-between text-left font-normal", !selectedPassage && "text-muted-foreground")}
                  >
                    <span className="truncate min-w-0">
                      {selectedPassage
                        ? `#${String(selectedPassage.passage_no).padStart(3, "0")} ${selectedPassage.english.slice(0, 40)}…`
                        : selectedTbId
                          ? "지문 검색·선택"
                          : "교재를 먼저 선택하세요"}
                    </span>
                    <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0 bg-popover" align="start">
                  <Command>
                    <CommandInput placeholder="번호/본문 검색…" />
                    <CommandList>
                      <CommandEmpty>지문이 없습니다.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          value="__no_passage__ 미지정"
                          onSelect={() => {
                            setSelectedPassageCode("");
                            setPgOpen(false);
                          }}
                        >
                          <Check className={cn("mr-2 size-4", !selectedPassageCode ? "opacity-100" : "opacity-0")} />
                          지문 미지정 (교재 전체 안내용)
                        </CommandItem>
                        {currentPassages.map((p) => (
                          <CommandItem
                            key={p.id}
                            value={`#${p.passage_no} ${p.english}`}
                            onSelect={() => {
                              setSelectedPassageCode(p.code);
                              setPgOpen(false);
                            }}
                          >
                            <Check className={cn("mr-2 size-4", selectedPassageCode === p.code ? "opacity-100" : "opacity-0")} />
                            <span className="truncate">
                              <span className="font-mono text-xs text-muted-foreground mr-2">
                                #{String(p.passage_no).padStart(3, "0")}
                              </span>
                              {p.english.slice(0, 60)}
                              {p.english.length > 60 ? "…" : ""}
                            </span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <Label>설명 (선택)</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
            </div>
          </div>
          {(selectedTb || selectedPassage) && (
            <div className="text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
              선택됨: <span className="font-bold text-foreground">{triggerLabel()}</span>
            </div>
          )}
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
                const passageLabel = r.sentence_id ? codeLabelMap.get(r.sentence_id) ?? r.sentence_id : null;
                return (
                  <div key={r.id} className={cn("p-3 rounded-lg border-2 flex items-start justify-between gap-3", rem.urgent ? "border-destructive/40 bg-destructive/5" : "border-border")}>
                    <div className="space-y-1 min-w-0">
                      <div className="font-bold text-foreground">{r.title}</div>
                      <div className="text-xs text-muted-foreground flex flex-wrap gap-2">
                        <span>대상: {studentName(r.student_id)}</span>
                        <span>· 마감: {format(new Date(r.due_at), "yyyy-MM-dd HH:mm")}</span>
                        <span className={cn("font-bold", rem.urgent ? "text-destructive" : "text-primary")}>· {rem.text}</span>
                        {passageLabel && <span>· {passageLabel}</span>}
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

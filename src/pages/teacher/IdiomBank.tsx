// ============================================================
// IdiomBank — 학생별 관용어구 뱅크 관리 (선생님)
// 첨삭 중 메모된 관용어구가 학생별로 누적된다.
// 여기서 정리지/테스트지 출력, 앱 내 테스트 부여, 수정·삭제를 한다.
// ============================================================
import { useEffect, useMemo, useState } from "react";
import { TeacherLayout } from "@/components/teacher/TeacherLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, Printer, FileText, Pencil, Trash2, Check, X, ClipboardList } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { fetchActiveStudents, type StudentProfile } from "@/lib/studentProfile";
import {
  fetchIdiomBank,
  updateIdiomBankItem,
  deleteIdiomBankItem,
  assignIdiomTest,
  fetchIdiomTestHistory,
  type IdiomBankItem,
  type IdiomTestAssignment,
} from "@/lib/idiomBank";
import { launchPrintHtml } from "@/lib/printLauncher";
import { buildIdiomSheetHtml } from "@/lib/printTemplates";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const TEST_COUNTS = [20, 30, 40] as const;

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

const IdiomBankPage = () => {
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [studentId, setStudentId] = useState("");
  const [items, setItems] = useState<IdiomBankItem[]>([]);
  const [history, setHistory] = useState<IdiomTestAssignment[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [testCount, setTestCount] = useState<string>("20");
  const [assigning, setAssigning] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editExpr, setEditExpr] = useState("");
  const [editMeaning, setEditMeaning] = useState("");

  useEffect(() => {
    void fetchActiveStudents()
      .then(setStudents)
      .catch(() => toast({ title: "학생 명단을 불러오지 못했습니다.", variant: "destructive" }));
  }, []);

  const student = useMemo(
    () => students.find((s) => s.user_id === studentId) ?? null,
    [students, studentId],
  );

  const load = async (uid: string) => {
    setLoading(true);
    setLoadError(false);
    try {
      const [bank, hist] = await Promise.all([fetchIdiomBank(uid), fetchIdiomTestHistory(uid)]);
      setItems(bank);
      setHistory(hist);
    } catch {
      setLoadError(true);
      toast({ title: "관용어구 뱅크를 불러오지 못했습니다.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (studentId) void load(studentId);
    else {
      setItems([]);
      setHistory([]);
    }
  }, [studentId]);

  const startEdit = (it: IdiomBankItem) => {
    setEditId(it.id);
    setEditExpr(it.expression);
    setEditMeaning(it.meaning);
  };

  const saveEdit = async () => {
    if (!editId) return;
    try {
      await updateIdiomBankItem(editId, {
        expression: editExpr.trim(),
        meaning: editMeaning.trim(),
      });
      setItems((prev) =>
        prev.map((it) =>
          it.id === editId ? { ...it, expression: editExpr.trim(), meaning: editMeaning.trim() } : it,
        ),
      );
      setEditId(null);
      toast({ title: "수정했습니다." });
    } catch {
      toast({ title: "수정 실패", variant: "destructive" });
    }
  };

  const removeItem = async (id: string) => {
    try {
      await deleteIdiomBankItem(id);
      setItems((prev) => prev.filter((it) => it.id !== id));
      toast({ title: "삭제했습니다." });
    } catch {
      toast({ title: "삭제 실패", variant: "destructive" });
    }
  };

  const print = (mode: "study" | "test") => {
    if (!student || items.length === 0) return;
    const html = buildIdiomSheetHtml({
      studentName: student.display_name ?? student.student_no,
      studentNo: student.student_no,
      items: [...items].reverse().map((it) => ({ expression: it.expression, meaning: it.meaning })),
      mode,
    });
    void launchPrintHtml(html, { title: "관용어구 출력" });
  };

  const assign = async () => {
    if (!student) return;
    const n = testCount === "all" ? items.length : parseInt(testCount, 10);
    if (items.length === 0) {
      toast({ title: "누적된 관용어구가 없습니다.", variant: "destructive" });
      return;
    }
    setAssigning(true);
    try {
      const a = await assignIdiomTest(student.user_id, n);
      toast({
        title: `관용어구 테스트 ${a.total}문항을 부여했습니다`,
        description: `${student.display_name ?? student.student_no} 학생 홈에 배너가 뜹니다.`,
      });
      await load(student.user_id);
    } catch (e) {
      toast({
        title: "테스트 부여 실패",
        description: e instanceof Error ? e.message : "다시 시도해 주세요.",
        variant: "destructive",
      });
    } finally {
      setAssigning(false);
    }
  };

  return (
    <TeacherLayout>
      <div className="max-w-4xl mx-auto p-4 space-y-4">
        <div>
          <h1 className="text-xl font-bold">관용어구 뱅크</h1>
          <p className="text-sm text-muted-foreground">
            첨삭 중 메모해 둔 외워야 할 관용어구가 학생별로 쌓입니다. 정리지·테스트지로 출력하거나 앱 내 테스트를 부여하세요.
          </p>
        </div>

        <Card className="p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={studentId} onValueChange={setStudentId}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="학생 선택" />
              </SelectTrigger>
              <SelectContent>
                {students.map((s) => (
                  <SelectItem key={s.user_id} value={s.user_id}>
                    {s.display_name ?? s.student_no} ({s.student_no})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {student && (
              <>
                <Badge variant="secondary">누적 {items.length}개</Badge>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={items.length === 0}
                  onClick={() => print("study")}
                >
                  <FileText className="w-4 h-4 mr-1" /> 정리지 출력
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={items.length === 0}
                  onClick={() => print("test")}
                >
                  <Printer className="w-4 h-4 mr-1" /> 테스트지 출력
                </Button>
              </>
            )}
          </div>

          {student && (
            <div className="flex flex-wrap items-center gap-2 border-t pt-3">
              <ClipboardList className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-semibold">앱 내 테스트 부여</span>
              <Select value={testCount} onValueChange={setTestCount}>
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TEST_COUNTS.map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}문항
                    </SelectItem>
                  ))}
                  <SelectItem value="all">전체 ({items.length})</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" disabled={assigning || items.length === 0} onClick={() => void assign()}>
                {assigning ? <Loader2 className="w-4 h-4 animate-spin" /> : "테스트 부여"}
              </Button>
              <span className="text-xs text-muted-foreground">
                누적 항목 중 무작위로 출제되며 학생 홈에 배너가 뜹니다.
              </span>
            </div>
          )}
        </Card>

        {loading && (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {loadError && (
          <Card className="p-4 text-sm text-destructive flex items-center justify-between">
            불러오기에 실패했습니다.
            <Button size="sm" variant="outline" onClick={() => studentId && void load(studentId)}>
              다시 불러오기
            </Button>
          </Card>
        )}

        {student && !loading && !loadError && (
          <>
            <Card className="p-4">
              <div className="text-sm font-bold mb-2">누적 관용어구 ({items.length})</div>
              {items.length === 0 ? (
                <div className="text-sm text-muted-foreground py-6 text-center">
                  아직 누적된 관용어구가 없습니다. 첨삭 화면의 "관용어구 메모"에서 추가하세요.
                </div>
              ) : (
                <div className="divide-y">
                  {items.map((it) => (
                    <div key={it.id} className="py-2 flex items-center gap-2">
                      {editId === it.id ? (
                        <>
                          <Input
                            value={editExpr}
                            onChange={(e) => setEditExpr(e.target.value)}
                            className="h-8 text-sm flex-1"
                          />
                          <Input
                            value={editMeaning}
                            onChange={(e) => setEditMeaning(e.target.value)}
                            className="h-8 text-sm flex-1"
                          />
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => void saveEdit()}>
                            <Check className="w-4 h-4" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditId(null)}>
                            <X className="w-4 h-4" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <div className="flex-1 min-w-0">
                            <span className="font-semibold text-sm">{it.expression}</span>
                            <span className="mx-2 text-muted-foreground">—</span>
                            <span className="text-sm">{it.meaning}</span>
                          </div>
                          <div className="text-xs text-muted-foreground shrink-0">
                            {it.sentence_id ?? ""} · {fmtDate(it.created_at)}
                          </div>
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => startEdit(it)}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive"
                            onClick={() => void removeItem(it.id)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="p-4">
              <div className="text-sm font-bold mb-2">테스트 기록</div>
              {history.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4 text-center">아직 부여한 테스트가 없습니다.</div>
              ) : (
                <div className="divide-y">
                  {history.map((h) => (
                    <div key={h.id} className="py-2 flex items-center gap-3 text-sm">
                      <span className="text-muted-foreground">{fmtDate(h.assigned_at)}</span>
                      <span>{h.total}문항</span>
                      {h.completed_at ? (
                        <Badge variant="secondary">
                          완료 · {h.correct}/{h.total} ({h.score}%)
                        </Badge>
                      ) : (
                        <Badge variant="outline">미응시</Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </TeacherLayout>
  );
};

export default IdiomBankPage;

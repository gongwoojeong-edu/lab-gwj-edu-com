// ============================================================
// PendingApprovals — 선생님 화면: 한글해석 승인 대기 목록
// ============================================================
import { useCallback, useEffect, useMemo, useState } from "react";
import { TeacherLayout } from "@/components/teacher/TeacherLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Inbox, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchPendingApprovals,
  subscribeAllApprovals,
  type SentenceApproval,
} from "@/lib/sentenceApprovals";
import { TeacherApprovalDialog } from "@/components/learning/TeacherApprovalDialog";
import { toast } from "@/hooks/use-toast";
import { updatePassageKorean } from "@/lib/textbooks";
import { Textarea } from "@/components/ui/textarea";
import { Pencil, Save, X } from "lucide-react";

interface Row extends SentenceApproval {
  student_no?: string | null;
  display_name?: string | null;
  english?: string | null;
  korean?: string | null;
  translation?: string | null;
}

const PendingApprovals = () => {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<Row | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const startEdit = (row: Row) => {
    setEditingId(row.sentence_id);
    setDraft(row.korean ?? "");
  };
  const cancelEdit = () => {
    setEditingId(null);
    setDraft("");
  };
  const saveEdit = async (sentenceId: string) => {
    const val = draft.trim();
    if (!val) {
      toast({ title: "정답을 입력하세요", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await updatePassageKorean(sentenceId, val);
      setRows((prev) =>
        prev.map((r) => (r.sentence_id === sentenceId ? { ...r, korean: val } : r)),
      );
      toast({ title: "정답이 저장되었습니다" });
      cancelEdit();
    } catch (e: any) {
      toast({ title: "저장 실패", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchPendingApprovals();
      if (list.length === 0) {
        setRows([]);
        return;
      }
      const userIds = Array.from(new Set(list.map((r) => r.user_id)));
      const sentenceIds = Array.from(new Set(list.map((r) => r.sentence_id)));

      const [{ data: profiles }, { data: passages }, { data: translations }] =
        await Promise.all([
          supabase
            .from("student_profiles")
            .select("user_id, student_no, display_name")
            .in("user_id", userIds),
          supabase
            .from("textbook_passages")
            .select("code, english, korean")
            .in("code", sentenceIds),
          supabase
            .from("sentence_translations")
            .select("user_id, sentence_id, text")
            .in("user_id", userIds)
            .in("sentence_id", sentenceIds),
        ]);

      const pMap = new Map(
        (profiles ?? []).map((p: any) => [p.user_id, p]),
      );
      const sMap = new Map(
        (passages ?? []).map((p: any) => [p.code, p]),
      );
      const tMap = new Map(
        (translations ?? []).map((t: any) => [`${t.user_id}::${t.sentence_id}`, t.text as string]),
      );

      const merged: Row[] = list.map((r) => ({
        ...r,
        student_no: pMap.get(r.user_id)?.student_no ?? null,
        display_name: pMap.get(r.user_id)?.display_name ?? null,
        english: (sMap.get(r.sentence_id) as any)?.english ?? null,
        korean: (sMap.get(r.sentence_id) as any)?.korean ?? null,
        translation: tMap.get(`${r.user_id}::${r.sentence_id}`) ?? null,
      }));
      setRows(merged);
    } catch (e: any) {
      toast({
        title: "승인 대기 목록 불러오기 실패",
        description: e?.message ?? String(e),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const unsub = subscribeAllApprovals(() => load());
    return () => unsub();
  }, [load]);

  const countLabel = useMemo(() => `${rows.length}건 대기`, [rows.length]);

  return (
    <TeacherLayout>
      <div className="p-6 space-y-4 max-w-5xl mx-auto">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-bold">한글해석 승인 대기</h1>
            <Badge variant="secondary">{countLabel}</Badge>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={loading ? "w-4 h-4 mr-1 animate-spin" : "w-4 h-4 mr-1"} />
            새로고침
          </Button>
        </div>

        <p className="text-sm text-muted-foreground">
          학생이 제출한 한글해석을 확인하고 <b>매우잘함/잘함/보통/미흡/재학습</b> 중 하나로 평가하세요.
          승인 즉시 학생 화면이 자동으로 다음 단계로 진행됩니다.
        </p>

        {loading && rows.length === 0 && (
          <Card className="p-8 text-center text-muted-foreground">불러오는 중...</Card>
        )}

        {!loading && rows.length === 0 && (
          <Card className="p-10 text-center text-muted-foreground flex flex-col items-center gap-2">
            <Inbox className="w-8 h-8" />
            <div className="font-semibold">대기 중인 승인 요청이 없어요</div>
            <div className="text-xs">학생이 한글해석을 제출하면 이곳에 표시됩니다.</div>
          </Card>
        )}

        <div className="space-y-3">
          {rows.map((row) => (
            <Card key={row.id} className="p-4 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 text-sm">
                  <Badge>{row.student_no ?? "-"}</Badge>
                  <span className="font-semibold">{row.display_name ?? "이름 없음"}</span>
                  <span className="text-muted-foreground">·</span>
                  <span className="font-mono text-xs">{row.sentence_id}</span>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(row.requested_at).toLocaleString("ko-KR")}
                  </span>
                  {row.attempt_no > 1 && (
                    <Badge variant="outline" className="text-[10px]">
                      {row.attempt_no}회차
                    </Badge>
                  )}
                </div>
                <Button size="sm" onClick={() => setTarget(row)}>
                  <ShieldCheck className="w-4 h-4 mr-1" /> 승인하기
                </Button>
              </div>

              <div className="grid md:grid-cols-3 gap-3 text-sm">
                <div className="border rounded-md p-3 bg-muted/30">
                  <div className="text-[11px] text-muted-foreground mb-1">원문</div>
                  <div className="leading-snug">{row.english ?? "(원문을 불러올 수 없음)"}</div>
                </div>
                <div className="border rounded-md p-3 bg-primary/5 border-primary/30">
                  <div className="text-[11px] text-primary mb-1 font-semibold flex items-center justify-between gap-2">
                    <span>한글해석 정답</span>
                    {editingId !== row.sentence_id && row.korean?.trim() && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-[11px]"
                        onClick={() => startEdit(row)}
                      >
                        <Pencil className="w-3 h-3 mr-1" /> 수정
                      </Button>
                    )}
                  </div>
                  {editingId === row.sentence_id ? (
                    <div className="space-y-2">
                      <Textarea
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        rows={4}
                        placeholder="선생님 정답 (한글해석)을 입력하세요"
                        className="text-sm"
                      />
                      <div className="flex gap-2 justify-end">
                        <Button size="sm" variant="ghost" onClick={cancelEdit} disabled={saving}>
                          <X className="w-3 h-3 mr-1" /> 취소
                        </Button>
                        <Button size="sm" onClick={() => saveEdit(row.sentence_id)} disabled={saving}>
                          <Save className="w-3 h-3 mr-1" /> 저장
                        </Button>
                      </div>
                    </div>
                  ) : row.korean?.trim() ? (
                    <div className="whitespace-pre-wrap leading-relaxed">{row.korean}</div>
                  ) : (
                    <div className="space-y-2">
                      <div className="text-muted-foreground italic text-xs">(등록된 정답 없음)</div>
                      <Button size="sm" variant="outline" onClick={() => startEdit(row)} className="w-full">
                        <Pencil className="w-3 h-3 mr-1" /> 정답입력
                      </Button>
                    </div>
                  )}
                </div>
                <div className="border rounded-md p-3 bg-card">
                  <div className="text-[11px] text-muted-foreground mb-1">학생 한글해석</div>
                  <div className="whitespace-pre-wrap leading-relaxed">
                    {row.translation ?? "(제출된 해석을 찾을 수 없음)"}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {target && (
          <TeacherApprovalDialog
            open={!!target}
            onOpenChange={(o) => !o && setTarget(null)}
            approvalId={target.id}
            sentenceId={target.sentence_id}
            studentUserId={target.user_id}
            englishSentence={target.english ?? undefined}
            koreanAnswer={target.korean ?? undefined}
            studentTranslation={target.translation}
            skipPin
            onApproved={() => {
              setTarget(null);
              load();
            }}
          />
        )}
      </div>
    </TeacherLayout>
  );
};

export default PendingApprovals;

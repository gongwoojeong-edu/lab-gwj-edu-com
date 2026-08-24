// ============================================================
// PendingApprovals — 선생님 화면: 한글해석 승인 대기 목록
// ============================================================
import { useCallback, useEffect, useMemo, useState } from "react";
import { TeacherLayout } from "@/components/teacher/TeacherLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Inbox, RefreshCw, PauseCircle, Send, PenLine } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchApprovalsByStatus,
  subscribeAllApprovals,
  type SentenceApproval,
  type ApprovalStatus,
} from "@/lib/sentenceApprovals";
import { TeacherApprovalDialog } from "@/components/learning/TeacherApprovalDialog";
import { StructuredMemoView } from "@/components/learning/StructuredMemoView";
import { toast } from "@/hooks/use-toast";
import { syncPendingApprovalsCount } from "@/hooks/usePendingApprovalsCount";
import { updatePassageKorean, fetchPassageSource, type PassageSource } from "@/lib/textbooks";
import { Textarea } from "@/components/ui/textarea";
import { Pencil, Save, X, BookOpen } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";


interface Row extends SentenceApproval {
  student_no?: string | null;
  display_name?: string | null;
  english?: string | null;
  korean?: string | null;
  translation?: string | null;
  /** 해당 문장에 대해 학생이 해석을 제출한 총 횟수 */
  submit_count?: number;
  /** 선생님이 첨삭(메모/보류메모)을 남긴 총 횟수 */
  feedback_count?: number;
  /** 문장 출처(시리즈·권·유닛) */
  source?: PassageSource | null;
}



const PendingApprovals = () => {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<Row | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<ApprovalStatus>("pending");
  const [heldCount, setHeldCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);



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
      const [list, otherList] = await Promise.all([
        fetchApprovalsByStatus(tab),
        fetchApprovalsByStatus(tab === "pending" ? "held" : "pending"),
      ]);
      // update counters + 사이드바/헤더 배지와 즉시 동기화
      if (tab === "pending") {
        setPendingCount(list.length);
        setHeldCount(otherList.length);
        syncPendingApprovalsCount(list.length);
      } else {
        setHeldCount(list.length);
        setPendingCount(otherList.length);
        syncPendingApprovalsCount(otherList.length);
      }
      if (list.length === 0) {
        setRows([]);
        return;
      }
      const userIds: string[] = Array.from(new Set(list.map((r) => r.user_id)));
      const sentenceIds: string[] = Array.from(new Set(list.map((r) => r.sentence_id)));

      const [
        { data: profiles },
        { data: passages },
        { data: translations },
        { data: history },
        { data: units },
        { data: textbooks },
        { data: seriesList },
      ] = await Promise.all([
        supabase
          .from("student_profiles")
          .select("user_id, student_no, display_name")
          .in("user_id", userIds),
        supabase
          .from("textbook_passages")
          .select("code, english, korean, unit_id, passage_no")
          .in("code", sentenceIds),
        supabase
          .from("sentence_translations")
          .select("user_id, sentence_id, text")
          .in("user_id", userIds)
          .in("sentence_id", sentenceIds),
        // 제출/첨삭 횟수 집계용 이력
        supabase
          .from("sentence_approvals")
          .select("user_id, sentence_id, attempt_no, memo, held_memo")
          .in("user_id", userIds)
          .in("sentence_id", sentenceIds),
        supabase.from("textbook_units").select("id, textbook_id, unit_no, title"),
        supabase.from("textbooks").select("id, series_id, volume_no, title"),
        supabase.from("textbook_series").select("id, level, series_no, title"),
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
      const uMap = new Map((units ?? []).map((u: any) => [u.id, u]));
      const tbMap = new Map((textbooks ?? []).map((t: any) => [t.id, t]));
      const srMap = new Map((seriesList ?? []).map((s: any) => [s.id, s]));
      const sourceByCode = new Map<string, PassageSource | null>();
      (passages ?? []).forEach((p: any) => {
        const unit = uMap.get(p.unit_id);
        const textbook = unit ? tbMap.get(unit.textbook_id) : null;
        const series = textbook ? srMap.get(textbook.series_id) : null;
        sourceByCode.set(p.code, {
          level: series?.level ?? null,
          seriesTitle: series?.title ?? null,
          seriesNo: series?.series_no ?? null,
          textbookTitle: textbook?.title ?? null,
          volumeNo: textbook?.volume_no ?? null,
          unitTitle: unit?.title ?? null,
          unitNo: unit?.unit_no ?? null,
          passageNo: p.passage_no ?? null,
          code: p.code,
        });
      });
      // key -> { submits, feedbacks }

      const cMap = new Map<string, { submits: number; feedbacks: number }>();
      (history ?? []).forEach((h: any) => {
        const key = `${h.user_id}::${h.sentence_id}`;
        const cur = cMap.get(key) ?? { submits: 0, feedbacks: 0 };
        cur.submits = Math.max(cur.submits + 1, Number(h.attempt_no) || 1);
        if ((h.memo ?? "").trim() || (h.held_memo ?? "").trim()) cur.feedbacks += 1;
        cMap.set(key, cur);
      });

      const merged: Row[] = list.map((r) => ({
        ...r,
        student_no: pMap.get(r.user_id)?.student_no ?? null,
        display_name: pMap.get(r.user_id)?.display_name ?? null,
        english: (sMap.get(r.sentence_id) as any)?.english ?? null,
        korean: (sMap.get(r.sentence_id) as any)?.korean ?? null,
        translation: tMap.get(`${r.user_id}::${r.sentence_id}`) ?? null,
        submit_count: cMap.get(`${r.user_id}::${r.sentence_id}`)?.submits ?? r.attempt_no ?? 1,
        feedback_count: cMap.get(`${r.user_id}::${r.sentence_id}`)?.feedbacks ?? 0,
        source: sourceByCode.get(r.sentence_id) ?? null,
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
  }, [tab]);

  useEffect(() => {
    load();
    const unsub = subscribeAllApprovals(() => load());
    return () => unsub();
  }, [load]);

  const countLabel = useMemo(
    () => `${rows.length}건 ${tab === "held" ? "보류" : "대기"}`,
    [rows.length, tab],
  );

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

        <Tabs value={tab} onValueChange={(v) => setTab(v as ApprovalStatus)}>
          <TabsList>
            <TabsTrigger value="pending" className="gap-2">
              대기
              <Badge variant="secondary" className="h-5 px-1.5">{pendingCount}</Badge>
            </TabsTrigger>
            <TabsTrigger value="held" className="gap-2">
              <PauseCircle className="w-3.5 h-3.5" /> 보류
              <Badge variant="secondary" className="h-5 px-1.5">{heldCount}</Badge>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <p className="text-sm text-muted-foreground">
          {tab === "held"
            ? "지금 판정하지 않고 보류해둔 문장입니다. 카드의 [승인하기]를 눌러 상세한 첨삭 메모와 함께 최종 평가를 남기세요."
            : (<>학생이 제출한 한글해석을 확인하고 <b>매우잘함/잘함/보통/미흡/재학습</b> 중 하나로 평가하거나, 지금 판정하기 어렵다면 <b>보류</b>로 넘겨두세요.</>)}
        </p>

        {loading && rows.length === 0 && (
          <Card className="p-8 text-center text-muted-foreground">불러오는 중...</Card>
        )}

        {!loading && rows.length === 0 && (
          <Card className="p-10 text-center text-muted-foreground flex flex-col items-center gap-2">
            <Inbox className="w-8 h-8" />
            <div className="font-semibold">
              {tab === "held" ? "보류된 문장이 없어요" : "대기 중인 승인 요청이 없어요"}
            </div>
            <div className="text-xs">
              {tab === "held"
                ? "승인 팝업에서 [보류] 버튼을 누르면 이곳에 모입니다."
                : "학생이 한글해석을 제출하면 이곳에 표시됩니다."}
            </div>
          </Card>
        )}

        <div className="space-y-3">
          {rows.map((row) => (
            <Card key={row.id} className="p-4 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 text-sm flex-wrap">
                  <Badge>{row.student_no ?? "-"}</Badge>
                  <span className="font-semibold">{row.display_name ?? "이름 없음"}</span>
                  <span className="text-muted-foreground">·</span>
                  <span className="font-mono text-xs">{row.sentence_id}</span>
                  {row.source && (
                    <span
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded"
                      title="문장 출처"
                    >
                      <BookOpen className="w-3 h-3" />
                      {[
                        row.source.level,
                        row.source.seriesTitle,
                        row.source.textbookTitle,
                        row.source.volumeNo ? `${row.source.volumeNo}권` : null,
                        row.source.unitTitle,
                        row.source.unitNo ? `유닛 ${row.source.unitNo}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  )}
                  <span className="text-muted-foreground">·</span>
                  <span className="text-xs text-muted-foreground">

                    {new Date(row.requested_at).toLocaleString("ko-KR")}
                  </span>
                  {row.attempt_no > 1 && (
                    <Badge variant="outline" className="text-[10px]">
                      {row.attempt_no}회차
                    </Badge>
                  )}
                  <Badge
                    variant="outline"
                    className="text-[10px] border-sky-500/50 text-sky-700 dark:text-sky-300"
                    title="학생이 이 문장의 해석을 제출한 횟수"
                  >
                    <Send className="w-3 h-3 mr-0.5" />제출 {row.submit_count ?? 1}회
                  </Badge>
                  <Badge
                    variant="outline"
                    className="text-[10px] border-violet-500/50 text-violet-700 dark:text-violet-300"
                    title="선생님이 첨삭 메모를 남긴 횟수"
                  >
                    <PenLine className="w-3 h-3 mr-0.5" />첨삭 {row.feedback_count ?? 0}회
                  </Badge>

                  {row.status === "held" && (
                    <Badge className="bg-amber-500 text-white border-amber-600 text-[10px]">
                      <PauseCircle className="w-3 h-3 mr-0.5" />보류중
                      {row.held_at && (
                        <span className="ml-1 opacity-90">· {new Date(row.held_at).toLocaleString("ko-KR")}</span>
                      )}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => startEdit(row)}
                    disabled={editingId === row.sentence_id}
                  >
                    <Pencil className="w-4 h-4 mr-1" /> {row.korean?.trim() ? "정답 수정" : "정답입력"}
                  </Button>
                  <Button size="sm" onClick={() => setTarget(row)}>
                    <ShieldCheck className="w-4 h-4 mr-1" /> {row.status === "held" ? "첨삭·최종승인" : "승인하기"}
                  </Button>
                </div>
              </div>

              {row.status === "held" && row.held_memo && (
                <div className="text-xs text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-md px-3 py-2">
                  <div className="font-semibold mb-1">임시 메모</div>
                  <StructuredMemoView memo={row.held_memo} />
                </div>
              )}

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
            studentName={target.display_name}
            studentNo={target.student_no}
            englishSentence={target.english ?? undefined}
            koreanAnswer={target.korean ?? undefined}
            studentTranslation={target.translation}
            initialMemo={target.held_memo ?? undefined}
            mode={target.status === "held" || tab === "held" ? "held" : "pending"}
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

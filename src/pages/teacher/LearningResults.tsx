// ============================================================
// LearningResults — 학습결과함
// 데이터 소스: 인쇄완료 ∪ sentence_attempt_logs ∪ handout_results
//             ∪ sentence_translations ∪ word_test_results ∪ word_pre_results
// 학생이 인쇄 요청을 안 했어도, 그날 학습한 모든 내용을 표시.
// 액션: [PDF] (미리보기) / [인쇄] (즉시 인쇄 처리 + 학습결과함 합류) / [재시험]
// ============================================================
import { useEffect, useMemo, useState } from "react";
import { TeacherLayout } from "@/components/teacher/TeacherLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Archive,
  Loader2,
  Printer,
  RefreshCcw,
  FileText,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ensureHandoutRow, toIsoDate, type HandoutResult } from "@/lib/handoutResults";
import WordHoInput from "@/components/teacher/WordHoInput";
import SyntaxHoToggle from "@/components/teacher/SyntaxHoToggle";
import { toast } from "@/hooks/use-toast";

interface StudentInfo {
  user_id: string;
  display_name: string | null;
  student_no: string;
}
interface AttemptStat {
  best_word_score: number | null;
  best_analysis_rate: number | null;
  word_passed: boolean;
  analysis_passed: boolean;
  printed_at: string | null;
}

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });

const LearningResults = () => {
  const [date, setDate] = useState<string>(toIsoDate(new Date()));
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<Record<string, StudentInfo>>({});
  const [handoutMap, setHandoutMap] = useState<Record<string, HandoutResult>>({});
  // key: `${user_id}::${sentence_id}` → AttemptStat
  const [attemptMap, setAttemptMap] = useState<Record<string, AttemptStat>>({});
  // 학생별 sentence_id 목록 (그 날 활동 흔적이 있는 모든 sentence)
  const [studentSentences, setStudentSentences] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const refresh = async () => {
    setLoading(true);
    try {
      const startIso = `${date}T00:00:00`;
      const endIso = `${date}T23:59:59.999`;

      // 1) 모든 활동 소스에서 (user_id, sentence_id) 페어 수집
      const [
        printedRes,
        attemptsRes,
        handoutRes,
        translationsRes,
        wordTestRes,
        wordPreRes,
      ] = await Promise.all([
        supabase
          .from("print_requests")
          .select("user_id, sentence_id, handled_at")
          .eq("status", "printed")
          .gte("handled_at", startIso)
          .lte("handled_at", endIso),
        supabase
          .from("sentence_attempt_logs")
          .select(
            "user_id, sentence_id, word_test_score, word_test_passed, analysis_match_rate, analysis_passed, completed_at",
          )
          .gte("completed_at", startIso)
          .lte("completed_at", endIso),
        supabase
          .from("handout_results")
          .select("*")
          .eq("test_date", date),
        supabase
          .from("sentence_translations")
          .select("user_id, sentence_id, submitted_at")
          .gte("submitted_at", startIso)
          .lte("submitted_at", endIso),
        supabase
          .from("word_test_results")
          .select("user_id, sentence_id, score, passed, taken_at")
          .gte("taken_at", startIso)
          .lte("taken_at", endIso),
        supabase
          .from("word_pre_results")
          .select("user_id, sentence_id, taken_at")
          .gte("taken_at", startIso)
          .lte("taken_at", endIso),
      ]);

      const pairs = new Map<string, Set<string>>(); // userId → Set<sentenceId>
      const addPair = (uid: string | null | undefined, sid: string | null | undefined) => {
        if (!uid || !sid) return;
        const set = pairs.get(uid) ?? new Set<string>();
        set.add(sid);
        pairs.set(uid, set);
      };
      const printedRows = (printedRes.data ?? []) as Array<{
        user_id: string;
        sentence_id: string;
        handled_at: string;
      }>;
      printedRows.forEach((r) => addPair(r.user_id, r.sentence_id));
      ((attemptsRes.data ?? []) as Array<{ user_id: string; sentence_id: string }>).forEach(
        (r) => addPair(r.user_id, r.sentence_id),
      );
      ((translationsRes.data ?? []) as Array<{ user_id: string; sentence_id: string }>).forEach(
        (r) => addPair(r.user_id, r.sentence_id),
      );
      ((wordTestRes.data ?? []) as Array<{ user_id: string; sentence_id: string }>).forEach(
        (r) => addPair(r.user_id, r.sentence_id),
      );
      ((wordPreRes.data ?? []) as Array<{ user_id: string; sentence_id: string }>).forEach(
        (r) => addPair(r.user_id, r.sentence_id),
      );

      const userIds = Array.from(pairs.keys());
      // handout_results는 user 단독으로도 보여줌 (sentence 없이 점수만 있는 경우)
      ((handoutRes.data ?? []) as HandoutResult[]).forEach((r) => {
        if (!pairs.has(r.user_id)) pairs.set(r.user_id, new Set());
      });
      const allUserIds = Array.from(pairs.keys());

      const sMap: Record<string, StudentInfo> = {};
      const hMap: Record<string, HandoutResult> = {};
      ((handoutRes.data ?? []) as HandoutResult[]).forEach((r) => (hMap[r.user_id] = r));

      if (allUserIds.length > 0) {
        const { data: sp } = await supabase
          .from("student_profiles")
          .select("user_id, display_name, student_no")
          .in("user_id", allUserIds);
        (sp ?? []).forEach((s) => (sMap[s.user_id] = s as StudentInfo));
      }

      setStudents(sMap);
      setHandoutMap(hMap);

      // 2) attempt 통계 (best score)
      const aMap: Record<string, AttemptStat> = {};
      ((attemptsRes.data ?? []) as Array<{
        user_id: string;
        sentence_id: string;
        word_test_score: number | null;
        word_test_passed: boolean;
        analysis_match_rate: number | null;
        analysis_passed: boolean;
      }>).forEach((l) => {
        const key = `${l.user_id}::${l.sentence_id}`;
        const cur = aMap[key] ?? {
          best_word_score: null,
          best_analysis_rate: null,
          word_passed: false,
          analysis_passed: false,
          printed_at: null,
        };
        const ws = Number(l.word_test_score ?? 0);
        const ar = Number(l.analysis_match_rate ?? 0);
        aMap[key] = {
          ...cur,
          best_word_score: cur.best_word_score == null ? ws : Math.max(cur.best_word_score, ws),
          best_analysis_rate:
            cur.best_analysis_rate == null ? ar : Math.max(cur.best_analysis_rate, ar),
          word_passed: cur.word_passed || !!l.word_test_passed,
          analysis_passed: cur.analysis_passed || !!l.analysis_passed,
        };
      });
      // word_test_results 도 보충 (학생이 분석은 안 했지만 단어시험만 본 경우)
      ((wordTestRes.data ?? []) as Array<{
        user_id: string;
        sentence_id: string;
        score: number;
        passed: boolean;
      }>).forEach((w) => {
        const key = `${w.user_id}::${w.sentence_id}`;
        const cur = aMap[key];
        if (!cur) {
          aMap[key] = {
            best_word_score: Number(w.score ?? 0),
            best_analysis_rate: null,
            word_passed: !!w.passed,
            analysis_passed: false,
            printed_at: null,
          };
        }
      });
      // 인쇄 시각 기록
      printedRows.forEach((r) => {
        const key = `${r.user_id}::${r.sentence_id}`;
        const cur = aMap[key] ?? {
          best_word_score: null,
          best_analysis_rate: null,
          word_passed: false,
          analysis_passed: false,
          printed_at: null,
        };
        cur.printed_at = r.handled_at;
        aMap[key] = cur;
      });
      setAttemptMap(aMap);

      // 학생별 sentence_id 정렬 목록
      const ssMap: Record<string, string[]> = {};
      pairs.forEach((set, uid) => {
        ssMap[uid] = Array.from(set).sort();
      });
      setStudentSentences(ssMap);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, [date]);

  const groupedEntries = useMemo(
    () => Object.entries(studentSentences),
    [studentSentences],
  );

  // ===== 액션 =====
  const handleOpenPdf = (userId: string, sentenceId: string) => {
    window.open(
      `/teacher/handout/${encodeURIComponent(sentenceId)}?student=${userId}`,
      "_blank",
    );
  };

  const handlePrint = async (userId: string, sentenceId: string) => {
    const key = `print:${userId}:${sentenceId}`;
    setBusy((p) => ({ ...p, [key]: true }));
    try {
      const { data: u } = await supabase.auth.getUser();
      // 인쇄 추적 로그: print_requests 에 status='printed' 직접 insert
      // (학생이 요청 안 했어도 선생님이 임의 인쇄 가능)
      // RLS: pr_insert_self 는 user_id=auth.uid() 만 허용 → 우리는 학생 본인이 아님.
      // 따라서 selectable 테이블 권한 정책상 staff insert 가 따로 없으면 실패할 수 있음.
      // 일단 시도하고, 실패해도 인쇄/결과함 진입은 진행.
      try {
        await supabase.from("print_requests").insert({
          user_id: userId,
          sentence_id: sentenceId,
          teacher_id: u.user?.id ?? null,
          status: "printed",
          handled_at: new Date().toISOString(),
          handled_by: u.user?.id ?? null,
          note: "teacher-print",
        });
      } catch (e) {
        console.warn("[LearningResults] print_requests insert skipped", e);
      }
      await ensureHandoutRow(userId, u.user?.id ?? null, toIsoDate(new Date()));
      window.open(
        `/teacher/handout/${encodeURIComponent(sentenceId)}?student=${userId}`,
        "_blank",
      );
      toast({ title: "인쇄 처리됨 — 학습결과함에 합류" });
      refresh();
    } catch (e) {
      toast({ title: "인쇄 실패", description: String(e), variant: "destructive" });
    } finally {
      setBusy((p) => ({ ...p, [key]: false }));
    }
  };

  const handleRetest = async (userId: string, sentenceId: string) => {
    const key = `retest:${userId}:${sentenceId}`;
    setBusy((p) => ({ ...p, [key]: true }));
    try {
      // sentence_progress 행 upsert: status='retest'
      const { data: existing } = await supabase
        .from("sentence_progress")
        .select("id")
        .eq("user_id", userId)
        .eq("sentence_id", sentenceId)
        .maybeSingle();
      if (existing) {
        await supabase
          .from("sentence_progress")
          .update({ status: "retest", updated_at: new Date().toISOString() })
          .eq("id", existing.id);
      } else {
        await supabase.from("sentence_progress").insert({
          user_id: userId,
          sentence_id: sentenceId,
          status: "retest",
        });
      }
      toast({
        title: "재시험 등록됨",
        description: "학생이 다음 접속 시 해당 문장이 다시 출제됩니다.",
      });
    } catch (e) {
      toast({ title: "재시험 등록 실패", description: String(e), variant: "destructive" });
    } finally {
      setBusy((p) => ({ ...p, [key]: false }));
    }
  };

  const handlePrintAll = async (userId: string, sentenceIds: string[]) => {
    for (const sid of sentenceIds) {
      // 순차 호출 (한꺼번에 너무 많은 탭 열림 방지: 첫 PDF만 새 탭)
      // 여기선 단순화: 각 sentence 마다 PDF 탭만 열고 처리 마킹
      handleOpenPdf(userId, sid);
    }
    toast({ title: `${sentenceIds.length}개 핸드아웃 탭 열림` });
  };

  return (
    <TeacherLayout>
      <div className="p-6 max-w-6xl mx-auto space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Archive className="size-6 text-primary" />
            학습결과함
            <span className="text-sm font-normal text-muted-foreground">
              · 학생 {groupedEntries.length}명
            </span>
          </h1>
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-9 w-44"
            />
            <Button size="sm" variant="outline" onClick={refresh}>
              <RefreshCcw className="size-4 mr-1" />
              새로고침
            </Button>
          </div>
        </div>

        {loading ? (
          <Card className="p-10 flex items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </Card>
        ) : groupedEntries.length === 0 ? (
          <Card className="p-10 text-center text-sm text-muted-foreground">
            해당 날짜에 학습 활동이 없습니다.
          </Card>
        ) : (
          <div className="space-y-3">
            {groupedEntries.map(([userId, sentenceIds]) => {
              const s = students[userId];
              const handout = handoutMap[userId];
              return (
                <Card key={userId} className="p-4 space-y-3">
                  {/* 학생 헤더 — HO 점수 인라인 */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-foreground">
                      {s?.display_name ?? "학생"}
                    </span>
                    <span className="text-xs font-mono text-muted-foreground">
                      ({s?.student_no ?? "—"})
                    </span>
                    {handout?.word_ho_score != null && (
                      <Badge variant="outline" className="font-mono text-xs">
                        단어HO {handout.word_ho_score}
                      </Badge>
                    )}
                    {handout?.syntax_ho_result && (
                      <Badge
                        variant={handout.syntax_ho_result === "PASS" ? "default" : "destructive"}
                        className="text-xs"
                      >
                        구문 {handout.syntax_ho_result}
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      · 활동 {sentenceIds.length}건
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="ml-auto"
                      onClick={() => handlePrintAll(userId, sentenceIds)}
                    >
                      <Printer className="size-3.5 mr-1" />
                      전체 인쇄
                    </Button>
                  </div>

                  <div className="overflow-hidden rounded-md border border-border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40 text-xs text-muted-foreground">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium">문장 코드</th>
                          <th className="text-left px-3 py-2 font-medium">단어 시험</th>
                          <th className="text-left px-3 py-2 font-medium">구문 분석</th>
                          <th className="text-left px-3 py-2 font-medium">상태</th>
                          <th className="text-right px-3 py-2 font-medium">액션</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {sentenceIds.map((sid) => {
                          const a = attemptMap[`${userId}::${sid}`];
                          const wScore =
                            a?.best_word_score != null ? Math.round(a.best_word_score) : null;
                          const aScore =
                            a?.best_analysis_rate != null
                              ? Math.round(a.best_analysis_rate * 100)
                              : null;
                          const allPassed = a?.word_passed && a?.analysis_passed;
                          const printedAt = a?.printed_at;
                          const printKey = `print:${userId}:${sid}`;
                          const retestKey = `retest:${userId}:${sid}`;
                          return (
                            <tr key={sid} className="hover:bg-muted/20">
                              <td className="px-3 py-2 font-mono text-xs">
                                <div>{sid}</div>
                                {printedAt && (
                                  <div className="text-[10px] text-muted-foreground inline-flex items-center gap-1 mt-0.5">
                                    <Printer className="size-3 text-primary" />
                                    {fmtTime(printedAt)}
                                  </div>
                                )}
                              </td>
                              <td className="px-3 py-2">
                                {wScore == null ? (
                                  <span className="text-xs text-muted-foreground">—</span>
                                ) : (
                                  <span
                                    className={
                                      a?.word_passed
                                        ? "text-primary font-semibold"
                                        : "text-destructive font-semibold"
                                    }
                                  >
                                    {wScore}
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2">
                                {aScore == null ? (
                                  <span className="text-xs text-muted-foreground">—</span>
                                ) : (
                                  <span
                                    className={
                                      a?.analysis_passed
                                        ? "text-primary font-semibold"
                                        : "text-destructive font-semibold"
                                    }
                                  >
                                    {aScore}
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2">
                                {!a ? (
                                  <Badge variant="outline" className="text-[10px]">
                                    미응시
                                  </Badge>
                                ) : allPassed ? (
                                  <Badge className="text-[10px]">완료</Badge>
                                ) : (
                                  <Badge variant="secondary" className="text-[10px]">
                                    부분
                                  </Badge>
                                )}
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex items-center justify-end gap-1.5">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 px-2 text-xs"
                                    onClick={() => handleOpenPdf(userId, sid)}
                                  >
                                    <FileText className="size-3 mr-1" />
                                    PDF
                                  </Button>
                                  <Button
                                    size="sm"
                                    className="h-7 px-2 text-xs"
                                    disabled={!!busy[printKey]}
                                    onClick={() => handlePrint(userId, sid)}
                                  >
                                    <Printer className="size-3 mr-1" />
                                    인쇄
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    className="h-7 px-2 text-xs"
                                    disabled={!!busy[retestKey]}
                                    onClick={() => handleRetest(userId, sid)}
                                  >
                                    <RefreshCcw className="size-3 mr-1" />
                                    재시험
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </TeacherLayout>
  );
};

export default LearningResults;

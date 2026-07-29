import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Loader2, LogOut, Play, Trophy, Sparkles, Flame, Gem, ClipboardList, Clock, Bell, Printer, Eye, Hourglass, CheckCircle2, XCircle, FileText, RotateCcw, AlertCircle, BookOpen, Lock } from "lucide-react";
import { Link } from "react-router-dom";
import RetestBanner, { useRetestAlertsCount } from "@/components/student/RetestBanner";
import DailyTestSummary from "@/components/teacher/DailyTestSummary";
import { resolveNextSentence } from "@/lib/nextSentence";
import { signOut, useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { SENTENCES, type Sentence } from "@/data/sentences";
import { LEVEL_LABEL } from "@/lib/levels";
import { useLevelLabels } from "@/hooks/useLevelLabels";
import { fetchStudentRewards, type StudentRewards } from "@/lib/rewards";
import type { StudentProfile } from "@/lib/studentProfile";
import { useViewMode } from "@/hooks/useViewMode";
import { cn } from "@/lib/utils";
import {
  cancelMyPrintRequest,
  createPrintRequest,
  createAnalysisPrintRequest,
  fetchMyPendingPrintRequests,
  type PrintRequest,
} from "@/lib/printRequests";
import {
  cancelReviewRequest,
  createReviewRequest,
  fetchOpenRequest,
  fetchOpenRequestsForSentences,
  type AnalysisReviewRequest,
} from "@/lib/analysisReview";
import { gradeAnalysis } from "@/lib/analysisGrading";
import { getAnalysisPdfSignedUrl } from "@/lib/textbooks";
import { openSignedStorageFile } from "@/lib/openSignedStorageFile";
import { toast } from "@/hooks/use-toast";
import { GWJ_SYNTAX_LOGO_ALT, GWJ_SYNTAX_PRODUCT_NAME } from "@/lib/gwj-brand";
import gwjSymbolAsset from "@/assets/gwj-symbol-purple.png.asset.json";
import NotificationBell from "@/components/student/NotificationBell";
import AssignmentStepBadges from "@/components/teacher/AssignmentStepBadges";
import {
  fetchUnitWorkflowsForUser,
  requestUnitPrint,
  submitUnitWorkbook,
  canAccessUnit,
  UNIT_WORKFLOW_LABELS,
  type UnitWorkflowRow,
} from "@/lib/unitWorkflow";
import {
  fetchMyMaterialViewRequests,
  requestMaterialView,
  cancelMaterialViewRequest,
  type MaterialViewRequest,
} from "@/lib/materialViewRequests";
import { fetchTaskModeForSentence } from "@/lib/fetchTaskMode";
import { fetchSentenceProgress } from "@/integrations/supabase/storage";
import { resolveContinueSentenceId } from "@/lib/sentenceApprovals";
import {
  learnPathForSentence,
  startButtonLabel,
  taskModeIncludesMemorize,
  type TaskMode,
} from "@/lib/taskMode";
import {
  compareAssignmentDue,
  formatAssignmentRemaining,
} from "@/lib/assignmentDue";
import {
  assignmentSequenceKey,
  comparePassageOrder,
  fetchPassageOrderMeta,
} from "@/lib/assignmentSequence";
import { classifyAssignmentTrack } from "@/lib/assignmentTrack";

interface RecentItem {
  sentence: Sentence;
  status: "pass" | "fail" | "hold" | "pending";
  updated_at: string;
}

interface AssignmentRow {
  id: string;
  title: string;
  description: string | null;
  sentence_id: string | null;
  due_at: string | null;
  created_at: string;
  include_pre: boolean;
  include_analysis: boolean;
  include_translation: boolean;
  include_wordtest: boolean;
  task_mode: TaskMode | null;
  round_no?: number | null;
}

interface AssignmentGroup {
  key: string;
  title: string;
  description: string | null;
  due_at: string | null;
  unit_prefix: string | null;
  include_pre: boolean;
  include_analysis: boolean;
  include_translation: boolean;
  include_wordtest: boolean;
  task_mode: TaskMode | null;
  rows: AssignmentRow[];
  totalCount: number;
  doneCount: number;
  inProgressCount: number;
  nextSentenceId: string | null;
  nextAssignmentId: string | null;
  nextStarted: boolean;
  nextPosition: number | null;
  unitId: string | null;
  /** 카드 내 유닛별 진척 (책 단위 과제에서도 유닛별로 인쇄/워크북 처리) */
  unitBreakdown: {
    unitId: string;
    unit_no: number;
    totalCount: number;
    doneCount: number;
  }[];
  round_no: number | null;
  /** Path A: 내신처럼 보이는 시퀀스 vs 진짜 특별과제 */
  track: "naeshin" | "special";
}

/** sentence_id에서 유닛 prefix 추출. 'L08-U260338-001' → 'L08-U260338'. 매칭 안 되면 null. */
const extractUnitPrefix = (sentenceId: string | null): string | null => {
  if (!sentenceId) return null;
  const m = sentenceId.match(/^(.*)-\d{3}$/);
  return m ? m[1] : null;
};

const StudentHome = () => {
  const navigate = useNavigate();
  const { user, roles } = useAuth();
  const { setMode } = useViewMode();
  const { displayStudent: levelDisplay } = useLevelLabels();
  const retestCount = useRetestAlertsCount(user?.id);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [rewards, setRewards] = useState<StudentRewards | null>(null);
  const [next, setNext] = useState<Sentence | null>(null);
  const [done, setDone] = useState(false);
  const [noContent, setNoContent] = useState(false);
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [assignmentGroups, setAssignmentGroups] = useState<AssignmentGroup[]>([]);
  const [assignmentProgress, setAssignmentProgress] = useState<
    Map<string, { pre: boolean; wt: boolean; an: boolean; tr: boolean; mem: boolean }>
  >(new Map());
  const [resumeTarget, setResumeTarget] = useState<{
    sentenceId: string;
    title: string;
    taskMode: TaskMode | null;
    assignmentId: string | null;
  } | null>(null);
  const [printReqs, setPrintReqs] = useState<Record<string, PrintRequest>>({});
  const [analysisPrintReqs, setAnalysisPrintReqs] = useState<Record<string, PrintRequest>>({});
  const [reviewReqs, setReviewReqs] = useState<Record<string, AnalysisReviewRequest>>({});
  const [handoutDoneSet, setHandoutDoneSet] = useState<Set<string>>(new Set());
  const [analysisPdfMap, setAnalysisPdfMap] = useState<
    Record<string, { storagePath: string; name: string | null }>
  >({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [unitWorkflows, setUnitWorkflows] = useState<Record<string, UnitWorkflowRow>>({});
  const [materialViews, setMaterialViews] = useState<Record<string, MaterialViewRequest>>({});
  const [unitAccess, setUnitAccess] = useState<Record<string, boolean>>({});
  const [nextTaskMode, setNextTaskMode] = useState<TaskMode>("analysis_and_memorize");
  const [nextAnalysisPassed, setNextAnalysisPassed] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      const [r, rw] = await Promise.all([resolveNextSentence(), fetchStudentRewards()]);
      if (!mounted) return;
      setProfile(r.profile);
      setNext(r.sentence);
      setDone(r.done);
      setNoContent(!!r.noContent);
      if (r.sentence) {
        const [ctx, prog] = await Promise.all([
          fetchTaskModeForSentence(r.sentence.id),
          fetchSentenceProgress(r.sentence.id),
        ]);
        if (mounted) {
          setNextTaskMode(ctx.taskMode);
          setNextAnalysisPassed(prog?.status === "pass");
        }
      }
      setRewards(rw);

      if (user) {
        const [{ data: progressData }, { data: myAssignData }, { data: sharedAssignData }] =
          await Promise.all([
          supabase
            .from("sentence_progress")
            .select("sentence_id, status, updated_at, passed_at")
            .eq("user_id", user.id)
            .in("status", ["pass", "fail", "hold", "pending"])
            .order("updated_at", { ascending: false }),
          supabase
            .from("assignments")
            .select("id, title, description, sentence_id, due_at, created_at, include_pre, include_analysis, include_translation, include_wordtest, task_mode, round_no")
            .eq("student_id", user.id)
            .order("created_at", { ascending: false }),
          supabase
            .from("assignments")
            .select("id, title, description, sentence_id, due_at, created_at, include_pre, include_analysis, include_translation, include_wordtest, task_mode, round_no")
            .is("student_id", null)
            .order("created_at", { ascending: false })
            .limit(100),
        ]);
        const rows = (progressData ?? []) as { sentence_id: string; status: "pass" | "fail" | "hold" | "pending"; updated_at: string; passed_at: string | null }[];
        // 본인 과제 우선 · 공용(student_id null)은 보조. limit(200) 혼합 조회 시 본인 과제가  Truncate 되던 문제 방지
        const assignById = new Map<string, AssignmentRow>();
        [...((myAssignData ?? []) as AssignmentRow[]), ...((sharedAssignData ?? []) as AssignmentRow[])].forEach(
          (a) => {
            if (!assignById.has(a.id)) assignById.set(a.id, a);
          },
        );
        const allAssignments = Array.from(assignById.values());

        // 정적 SENTENCES에 없는 코드(textbook_passages 기반)는 DB에서 fallback 조회
        const missingIds = rows
          .map((r) => r.sentence_id)
          .filter((id) => !SENTENCES.find((x) => x.id === id));
        const passageMap = new Map<string, { english: string; korean: string | null }>();
        if (missingIds.length > 0) {
          const { data: passages } = await supabase
            .from("textbook_passages")
            .select("code, english, korean")
            .in("code", missingIds);
          (passages ?? []).forEach((p: { code: string; english: string; korean: string | null }) => {
            passageMap.set(p.code, { english: p.english, korean: p.korean });
          });
        }

        const enriched: RecentItem[] = rows
          .map((row) => {
            const s = SENTENCES.find((x) => x.id === row.sentence_id);
            if (s) {
              return { sentence: s, status: row.status, updated_at: row.passed_at ?? row.updated_at };
            }
            const p = passageMap.get(row.sentence_id);
            if (p) {
              const fakeSentence = {
                id: row.sentence_id,
                english: p.english,
                korean: p.korean ?? "",
                tokens: [],
              } as unknown as Sentence;
              return { sentence: fakeSentence, status: row.status, updated_at: row.passed_at ?? row.updated_at };
            }
            return null;
          })
          .filter(Boolean) as RecentItem[];

        // 완료된 특별과제(해당 sentence가 PASS) 카드는 숨김
        const assignSentenceIds = allAssignments
          .map((a) => a.sentence_id)
          .filter(Boolean) as string[];
        // 회독별로 진행상태를 분리하려면 (assignment_id, sentence_id) 로 매칭해야 한다.
        // 레거시(assignment_id=null)는 round_no in (null,1) 인 과제에만 fallback 허용.
        type PF = { pre: boolean; wt: boolean; an: boolean; tr: boolean; mem: boolean; status: string };
        const progressByAssign = new Map<string, PF>(); // key: `${assignmentId}::${sentenceId}`
        const progressByNullAssign = new Map<string, PF>(); // key: sentenceId
        if (assignSentenceIds.length > 0) {
          const { data: progRows } = await supabase
            .from("sentence_progress")
            .select("sentence_id, assignment_id, status, pre_done, word_test_done, analysis_done, translation_done, mem_passed_at")
            .eq("user_id", user.id)
            .in("sentence_id", assignSentenceIds);
          ((progRows ?? []) as Array<{
            sentence_id: string;
            assignment_id: string | null;
            status: string;
            pre_done: boolean | null;
            word_test_done: boolean | null;
            analysis_done: boolean | null;
            translation_done: boolean | null;
            mem_passed_at: string | null;
          }>).forEach((r) => {
            const pf: PF = {
              pre: !!r.pre_done,
              wt: !!r.word_test_done,
              an: !!r.analysis_done,
              tr: !!r.translation_done,
              mem: !!r.mem_passed_at,
              status: r.status ?? "pending",
            };
            if (r.assignment_id) {
              progressByAssign.set(`${r.assignment_id}::${r.sentence_id}`, pf);
            } else {
              progressByNullAssign.set(r.sentence_id, pf);
            }
          });
        }
        const getPF = (a: AssignmentRow): PF | undefined => {
          if (!a.sentence_id) return undefined;
          const hit = progressByAssign.get(`${a.id}::${a.sentence_id}`);
          if (hit) return hit;
          if (a.round_no == null || a.round_no <= 1) {
            return progressByNullAssign.get(a.sentence_id);
          }
          return undefined;
        };
        const isSentenceDone = (a: AssignmentRow): boolean => {
          if (!a.sentence_id) return false;
          const pf = getPF(a);
          if (!pf) return false;
          // 선생님 승인(pass)이면 단계 플래그와 무관하게 완료 — 이어하기가 같은 문장에 고정되는 것 방지
          if (pf.status === "pass") return true;
          const mode = a.task_mode ?? "analysis_only";
          const needsMem = taskModeIncludesMemorize(mode);
          const needsAnalysis = mode !== "memorize_only";
          if (needsAnalysis) {
            const preOk = !a.include_pre || pf.pre;
            const wtOk = !a.include_wordtest || pf.wt;
            const anOk = !a.include_analysis || pf.an;
            const trOk = !a.include_translation || pf.tr;
            if (!(preOk && wtOk && anOk && trOk)) return false;
            // 한글해석 포함 과제는 선생님 승인(status=pass)까지 완료로 봄
            if (a.include_translation && pf.status !== "pass") return false;
          }
          if (needsMem && !pf.mem) return false;
          return true;
        };
        const isSentenceStarted = (a: AssignmentRow): boolean => {
          if (!a.sentence_id) return false;
          const pf = getPF(a);
          return !!pf && (pf.pre || pf.wt || pf.an || pf.tr || pf.mem);
        };
        // 하위 호환: 다른 UI가 참조하는 sentence_id 키 맵
        const progressFlags = new Map<string, PF>();
        allAssignments.forEach((a) => {
          const pf = getPF(a);
          if (a.sentence_id && pf) progressFlags.set(a.sentence_id, pf);
        });

        // 제목·마감·교재(권) 기준으로 묶음 → 1과-1~4처럼 유닛이 달라도 한 시퀀스
        const orderMeta = await fetchPassageOrderMeta(assignSentenceIds);

        const groupMap = new Map<string, AssignmentRow[]>();
        allAssignments.forEach((a) => {
          const tb = a.sentence_id
            ? orderMeta.get(a.sentence_id)?.textbook_id ?? null
            : null;
          const key = assignmentSequenceKey({
            title: a.title,
            due_at: a.due_at,
            textbookId: tb,
          });
          if (!groupMap.has(key)) groupMap.set(key, []);
          groupMap.get(key)!.push(a);
        });

        const groups: AssignmentGroup[] = Array.from(groupMap.entries())
          .map(([key, rows]) => {
            const sorted = rows
              .slice()
              .sort((x, y) =>
                comparePassageOrder(x.sentence_id, y.sentence_id, orderMeta),
              );
            const head = sorted[0];
            const doneList = sorted.filter(isSentenceDone);
            const startedList = sorted.filter(
              (a) => !isSentenceDone(a) && isSentenceStarted(a),
            );
            const nextRow = sorted.find((a) => !isSentenceDone(a));
            const nextPosition = nextRow ? sorted.findIndex((a) => a === nextRow) + 1 : null;
            const nextUnitId = nextRow?.sentence_id
              ? orderMeta.get(nextRow.sentence_id)?.unit_id ?? null
              : null;
            const headUnitId = head.sentence_id
              ? orderMeta.get(head.sentence_id)?.unit_id ?? null
              : null;
            const nextPF = nextRow ? getPF(nextRow) : undefined;
            const nextStarted = !!nextPF && (nextPF.pre || nextPF.wt || nextPF.an || nextPF.tr || nextPF.mem);
            // 유닛별 진척 집계 (책 단위 과제라도 유닛별로 인쇄/워크북 진행)
            const unitAgg = new Map<
              string,
              { unit_no: number; totalCount: number; doneCount: number }
            >();
            sorted.forEach((r) => {
              const meta = r.sentence_id ? orderMeta.get(r.sentence_id) : undefined;
              const uid = meta?.unit_id ?? null;
              if (!uid) return;
              const cur = unitAgg.get(uid) ?? {
                unit_no: meta?.unit_no ?? 9999,
                totalCount: 0,
                doneCount: 0,
              };
              cur.totalCount += 1;
              if (isSentenceDone(r)) cur.doneCount += 1;
              unitAgg.set(uid, cur);
            });
            const unitBreakdown = Array.from(unitAgg.entries())
              .map(([unitId, v]) => ({ unitId, ...v }))
              .sort((a, b) => a.unit_no - b.unit_no);
            return {
              key,
              title: head.title,
              description: head.description,
              due_at: head.due_at,
              unit_prefix: extractUnitPrefix(head.sentence_id),
              include_pre: head.include_pre,
              include_analysis: head.include_analysis,
              include_translation: head.include_translation,
              include_wordtest: head.include_wordtest,
              task_mode: head.task_mode,
              rows: sorted,
              totalCount: sorted.length,
              doneCount: doneList.length,
              inProgressCount: startedList.length,
              nextSentenceId: nextRow?.sentence_id ?? null,
              nextAssignmentId: nextRow?.id ?? null,
              nextStarted,
              nextPosition,
              unitId: nextUnitId ?? headUnitId,
              unitBreakdown,
              round_no: sorted.reduce<number | null>((m, r) => {
                const rn = r.round_no ?? null;
                if (rn == null) return m;
                return m == null ? rn : Math.max(m, rn);
              }, null),
              track: classifyAssignmentTrack({
                title: head.title,
                groupSize: sorted.length,
              }),
            } as AssignmentGroup;
          })
          // 마감일 가까운 순 (무기한은 뒤)
          .sort((a, b) => compareAssignmentDue(a.due_at, b.due_at));

        if (mounted) {
          setRecent(enriched);
          setAssignmentGroups(groups);
          setAssignmentProgress(progressFlags);
        }

        if (user && mounted) {
          const [wfMap, mvMap] = await Promise.all([
            fetchUnitWorkflowsForUser(user.id),
            fetchMyMaterialViewRequests(user.id),
          ]);
          const unitIds = [
            ...new Set(
              groups.flatMap((g) => [
                ...(g.unitId ? [g.unitId] : []),
                ...g.unitBreakdown.map((u) => u.unitId),
              ]),
            ),
          ];
          const accessEntries = await Promise.all(
            unitIds.map(async (uid) => [uid, await canAccessUnit(user.id, uid)] as const),
          );
          if (mounted) {
            setUnitWorkflows(wfMap);
            setMaterialViews(mvMap);
            setUnitAccess(Object.fromEntries(accessEntries));
          }
        }

        // 본인의 pending 시험지/분석자료 요청 + 각 sentence별 정답대조 요청 상태 로드
        const sentenceIds = enriched.map((e) => e.sentence.id);
        const pendingPrints = await fetchMyPendingPrintRequests();
        const printMap: Record<string, PrintRequest> = {};
        const analysisPrintMap: Record<string, PrintRequest> = {};
        pendingPrints.forEach((p) => {
          if (!sentenceIds.includes(p.sentence_id)) return;
          if (p.kind === "analysis") analysisPrintMap[p.sentence_id] = p;
          else printMap[p.sentence_id] = p;
        });
        const reviewMap = await fetchOpenRequestsForSentences(sentenceIds, 1);

        // Hand out 학습 완료 여부 (handout_results 행 존재)
        let handoutSet = new Set<string>();
        if (sentenceIds.length > 0) {
          const { data: hoRows } = await supabase
            .from("handout_results")
            .select("sentence_id")
            .eq("user_id", user.id)
            .in("sentence_id", sentenceIds);
          handoutSet = new Set(
            ((hoRows ?? []) as { sentence_id: string | null }[])
              .map((r) => r.sentence_id)
              .filter((x): x is string => !!x),
          );
        }

        // 분석자료 PDF 메타 — 지문(code=sentence id) → 유닛(unit_id) → PDF
        const pdfMap: Record<string, { storagePath: string; name: string | null }> = {};
        if (sentenceIds.length > 0) {
          const { data: pgRows } = await supabase
            .from("textbook_passages")
            .select("code, unit_id")
            .in("code", sentenceIds);
          const codeToUnit = new Map<string, string>();
          ((pgRows ?? []) as { code: string; unit_id: string }[]).forEach((r) => {
            if (r.unit_id) codeToUnit.set(r.code, r.unit_id);
          });
          const unitIds = Array.from(new Set(codeToUnit.values()));
          if (unitIds.length > 0) {
            const { data: unitRows } = await supabase
              .from("textbook_units")
              .select("id, analysis_pdf_url, analysis_pdf_name")
              .in("id", unitIds);
            const unitPdf = new Map<
              string,
              { storagePath: string; name: string | null }
            >();
            ((unitRows ?? []) as {
              id: string;
              analysis_pdf_url: string | null;
              analysis_pdf_name: string | null;
            }[]).forEach((u) => {
              if (u.analysis_pdf_url) {
                unitPdf.set(u.id, {
                  storagePath: u.analysis_pdf_url,
                  name: u.analysis_pdf_name,
                });
              }
            });
            codeToUnit.forEach((unitId, code) => {
              const meta = unitPdf.get(unitId);
              if (meta) pdfMap[code] = meta;
            });
          }
        }

        if (mounted) {
          setPrintReqs(printMap);
          setAnalysisPrintReqs(analysisPrintMap);
          setReviewReqs(reviewMap);
          setHandoutDoneSet(handoutSet);
          setAnalysisPdfMap(pdfMap);
        }
      }
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [user?.id]);

  const setBusyFor = (id: string, v: boolean) =>
    setBusy((prev) => ({ ...prev, [id]: v }));

  const handleRequestPrint = async (sentenceId: string) => {
    setBusyFor(`print:${sentenceId}`, true);
    try {
      const row = await createPrintRequest({ sentence_id: sentenceId });
      setPrintReqs((prev) => ({ ...prev, [sentenceId]: row }));
      toast({ title: "선생님께 시험지 요청을 보냈어요" });
    } catch (e) {
      const msg = String(e);
      toast({
        title: "요청 실패",
        description: msg.includes("print_requests_pending_unique")
          ? "이미 요청 중입니다."
          : msg,
        variant: "destructive",
      });
    } finally {
      setBusyFor(`print:${sentenceId}`, false);
    }
  };

  const handleCancelPrint = async (sentenceId: string) => {
    const cur = printReqs[sentenceId];
    if (!cur) return;
    setBusyFor(`print:${sentenceId}`, true);
    try {
      await cancelMyPrintRequest(cur.id);
      setPrintReqs((prev) => {
        const next = { ...prev };
        delete next[sentenceId];
        return next;
      });
      toast({ title: "요청을 취소했어요" });
    } finally {
      setBusyFor(`print:${sentenceId}`, false);
    }
  };

  const handleViewAnalysisPdf = async (sentenceId: string) => {
    const meta = analysisPdfMap[sentenceId];
    if (!meta) return;
    setBusyFor(`analysis:${sentenceId}`, true);
    try {
      const url = await getAnalysisPdfSignedUrl(meta.storagePath);
      if (!url) {
        toast({ title: "분석자료 열람 실패", variant: "destructive" });
        return;
      }
      await openSignedStorageFile(url, meta.storagePath, {
        fileName: meta.name,
      });
    } finally {
      setBusyFor(`analysis:${sentenceId}`, false);
    }
  };

  const handleRequestAnalysisPrint = async (sentenceId: string) => {
    const meta = analysisPdfMap[sentenceId];
    if (!meta) return;
    setBusyFor(`analysis-print:${sentenceId}`, true);
    try {
      const row = await createAnalysisPrintRequest(sentenceId, meta.storagePath);
      setAnalysisPrintReqs((prev) => ({ ...prev, [sentenceId]: row }));
      toast({ title: "분석자료 인쇄 요청을 보냈어요" });
    } catch (e) {
      toast({ title: "요청 실패", description: String(e), variant: "destructive" });
    } finally {
      setBusyFor(`analysis-print:${sentenceId}`, false);
    }
  };

  const handleCancelAnalysisPrint = async (sentenceId: string) => {
    const cur = analysisPrintReqs[sentenceId];
    if (!cur) return;
    setBusyFor(`analysis-print:${sentenceId}`, true);
    try {
      await cancelMyPrintRequest(cur.id);
      setAnalysisPrintReqs((prev) => {
        const next = { ...prev };
        delete next[sentenceId];
        return next;
      });
      toast({ title: "요청을 취소했어요" });
    } finally {
      setBusyFor(`analysis-print:${sentenceId}`, false);
    }
  };

  const handleRequestReview = async (sentenceId: string) => {
    setBusyFor(`review:${sentenceId}`, true);
    try {
      const grade = await gradeAnalysis(sentenceId);
      if (grade.rate < 0.3) {
        toast({
          title: `${grade.hasMaster ? "정답률" : "분석률"}이 부족해요`,
          description: `현재 ${Math.round(grade.rate * 100)}% — 30% 이상 분석 후 요청 가능`,
          variant: "destructive",
        });
        return;
      }
      const cur = recent.find((r) => r.sentence.id === sentenceId);
      const isPass = cur?.status === "pass";
      const isFail = cur?.status === "fail";
      // 마스터 없음(hold 또는 hasMaster=false): 30% 이상이면 normal 트랙으로 허용
      const track: "normal" | "fail_assist" | null =
        grade.rate >= 0.3 && grade.requiredOwnersFilled
          ? "normal"
          : !grade.hasMaster && grade.rate >= 0.3
            ? "normal"
            : isFail && grade.rate >= 0.5
              ? "fail_assist"
              : null;
      if (!track) {
        toast({
          title: "요청 조건 미충족",
          description: "분석률 30% 이상이면 요청할 수 있어요.",
          variant: "destructive",
        });
        return;
      }
      const row = await createReviewRequest({
        sentence_id: sentenceId,
        attempt_no: 1,
        analysis_rate: grade.rate,
        required_filled: grade.requiredOwnersFilled,
        track,
      });
      if (row) setReviewReqs((prev) => ({ ...prev, [sentenceId]: row }));
      toast({ title: "선생님분석본보기 요청을 보냈어요" });
    } catch (e) {
      const msg = String(e);
      toast({
        title: "요청 실패",
        description: msg.includes("uq_arr_open_per_attempt") ? "이미 진행 중인 요청이 있어요." : msg,
        variant: "destructive",
      });
    } finally {
      setBusyFor(`review:${sentenceId}`, false);
    }
  };

  const handleCancelReview = async (sentenceId: string) => {
    const cur = reviewReqs[sentenceId];
    if (!cur) return;
    setBusyFor(`review:${sentenceId}`, true);
    try {
      await cancelReviewRequest(cur.id);
      setReviewReqs((prev) => {
        const next = { ...prev };
        delete next[sentenceId];
        return next;
      });
      toast({ title: "요청을 취소했어요" });
    } finally {
      setBusyFor(`review:${sentenceId}`, false);
    }
  };

  const handleUnitPrintRequest = async (unitId: string) => {
    if (!user) return;
    setBusyFor(`unit-print:${unitId}`, true);
    try {
      const row = await requestUnitPrint(user.id, unitId);
      setUnitWorkflows((p) => ({ ...p, [unitId]: row }));
      toast({ title: "유닛 인쇄를 요청했어요", description: "선생님 승인·인쇄를 기다려 주세요." });
    } catch (e) {
      toast({ title: "요청 실패", description: String(e), variant: "destructive" });
    } finally {
      setBusyFor(`unit-print:${unitId}`, false);
    }
  };

  const handleWorkbookComplete = async (unitId: string) => {
    if (!user) return;
    setBusyFor(`unit-wb:${unitId}`, true);
    try {
      const row = await submitUnitWorkbook(user.id, unitId);
      setUnitWorkflows((p) => ({ ...p, [unitId]: row }));
      toast({ title: "워크북 활동 완료", description: "선생님 검수·승인을 기다려 주세요." });
    } catch (e) {
      toast({ title: "완료 처리 실패", description: String(e), variant: "destructive" });
    } finally {
      setBusyFor(`unit-wb:${unitId}`, false);
    }
  };

  const handleMaterialViewRequest = async (unitId: string) => {
    if (!user) return;
    setBusyFor(`unit-mv:${unitId}`, true);
    try {
      const row = await requestMaterialView(user.id, unitId);
      setMaterialViews((p) => ({ ...p, [unitId]: row }));
      toast({ title: "자료열람 요청을 보냈어요" });
    } catch (e) {
      toast({ title: "요청 실패", description: String(e), variant: "destructive" });
    } finally {
      setBusyFor(`unit-mv:${unitId}`, false);
    }
  };

  const handleCancelMaterialView = async (unitId: string) => {
    const cur = materialViews[unitId];
    if (!cur || cur.status !== "pending") return;
    setBusyFor(`unit-mv:${unitId}`, true);
    try {
      await cancelMaterialViewRequest(cur.id);
      setMaterialViews((prev) => {
        const next = { ...prev };
        delete next[unitId];
        return next;
      });
      toast({ title: "요청을 취소했어요" });
    } finally {
      setBusyFor(`unit-mv:${unitId}`, false);
    }
  };

  const goLearn = async (sentenceId: string, assignmentId?: string | null) => {
    // 승인만 되고 pass 반영이 안 된 경우 → 동기화 후 진짜 다음 문장으로
    const cont = await resolveContinueSentenceId(sentenceId, assignmentId ?? null);
    const [ctx, prog] = await Promise.all([
      fetchTaskModeForSentence(cont.sentenceId),
      fetchSentenceProgress(cont.sentenceId, cont.assignmentId),
    ]);
    navigate(
      learnPathForSentence(
        cont.sentenceId,
        ctx.taskMode,
        prog?.status === "pass",
        cont.assignmentId,
      ),
    );
  };

  const handleStart = () => {
    if (!next) return;
    navigate(
      learnPathForSentence(next.id, nextTaskMode, nextAnalysisPassed),
    );
  };

  const startLabel = next
    ? `${next.id} ${startButtonLabel(nextTaskMode, nextAnalysisPassed)}`
    : "다음 Passage 없음";

  const visibleAssignmentGroups = useMemo(
    () =>
      assignmentGroups.filter((g) => {
        if (g.doneCount < g.totalCount) return true;
        // 배정 문장을 다 끝낸 뒤에도 유닛 워크플로(인쇄·HO)가 남으면 카드 유지
        if (!g.unitId) return g.doneCount > 0; // unit 메타 없으면 완료 카드라도 잠시 유지
        const wf = unitWorkflows[g.unitId];
        return !wf || wf.status !== "completed";
      }),
    [assignmentGroups, unitWorkflows],
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-secondary/40">
      {/* Header */}
      <header className="sticky top-0 z-30 backdrop-blur-md bg-background/70 border-b border-border">
        <div className="max-w-5xl mx-auto px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img
              src={gwjSymbolAsset.url}
              alt={GWJ_SYNTAX_LOGO_ALT}
              width={52}
              height={52}
              loading="lazy"
              className="w-13 h-13 object-contain"
            />
            <div>
              <div className="text-sm font-bold text-foreground leading-none">{GWJ_SYNTAX_PRODUCT_NAME}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                {profile?.student_no ?? "—"} · {profile?.display_name ?? ""}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            {user && retestCount > 0 && (
              <a
                href="#retest-banner"
                className="relative inline-flex items-center justify-center w-8 h-8 rounded-full hover:bg-muted transition-colors"
                aria-label={`재시 알림 ${retestCount}건`}
              >
                <Bell className="w-4 h-4 text-amber-600" />
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {retestCount}
                </span>
              </a>
            )}
            {rewards && (
              <>
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-streak/15 text-streak text-xs font-bold">
                  <Flame className="w-3.5 h-3.5" />
                  {rewards.current_streak}
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-primary/15 text-primary text-xs font-bold">
                  <Gem className="w-3.5 h-3.5" />
                  {rewards.points}
                </span>
              </>
            )}
            {(roles.includes("teacher") || roles.includes("admin")) && (
              <button
                type="button"
                onClick={() => {
                  setMode("teacher");
                  navigate("/teacher");
                }}
                className="text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
              >
                선생님 화면으로 이동
              </button>
            )}
            <Button variant="ghost" size="sm" asChild>
              <Link to="/learn/library">
                <BookOpen className="w-4 h-4 mr-1" /> 라이브러리
              </Link>
            </Button>
            <NotificationBell />
            <Button variant="ghost" size="sm" onClick={() => signOut()}>
              <LogOut className="w-4 h-4 mr-1" /> 로그아웃
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-10 space-y-8">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {user && (
              <div id="retest-banner">
                <RetestBanner userId={user.id} />
              </div>
            )}

            {/* 과제 트랙 — 내신(시퀀스) / 특별과제. Path A */}
            {visibleAssignmentGroups.length > 0 && (
            <Card className="p-5 sm:p-6 space-y-4 border-amber-500/40 bg-gradient-to-br from-amber-500/5 to-transparent">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <ClipboardList className="w-4 h-4 text-amber-600" />
                  <h2 className="text-sm font-bold text-foreground/80 uppercase tracking-wider">
                    학습 과제
                  </h2>
                  <span className="px-2 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-extrabold">
                    {visibleAssignmentGroups.length}
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground -mt-2">
                내신 진도(여러 지문 시퀀스)와 특별과제가 여기에 보여요. 같은 과제 안에서는 순서대로만 이어가요.
              </p>
              <ul className="space-y-3">
                {visibleAssignmentGroups.map((g) => {
                  const rem = formatAssignmentRemaining(g.due_at);
                  const urgent = rem.urgent;
                  const remainText = rem.text;
                  const isInProgress = g.inProgressCount > 0 || g.doneCount > 0;
                  const progressPct = g.totalCount > 0 ? Math.round((g.doneCount / g.totalCount) * 100) : 0;
                  return (
                    <li
                      key={g.key}
                      className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 rounded-lg border border-amber-500/30 bg-card"
                    >
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={cn(
                              "inline-flex items-center text-[10px] font-extrabold px-1.5 py-0.5 rounded",
                              g.track === "naeshin"
                                ? "bg-sky-500/15 text-sky-800 dark:text-sky-300"
                                : "bg-amber-500/15 text-amber-800 dark:text-amber-300",
                            )}
                          >
                            {g.track === "naeshin" ? "내신" : "특별"}
                          </span>
                          <span className="text-sm font-bold truncate">{g.title}</span>
                          {g.round_no != null && g.round_no > 1 && (
                            <span className="inline-flex items-center text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-700 dark:text-violet-300">
                              {g.round_no}회독
                            </span>
                          )}
                          {g.totalCount > 1 && (
                            <span className="inline-flex items-center text-[11px] font-bold px-1.5 py-0.5 rounded bg-primary/15 text-primary">
                              완료 {g.doneCount}/{g.totalCount}
                            </span>
                          )}
                          {isInProgress && g.doneCount < g.totalCount && (
                            <span className="inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300">
                              진행중
                            </span>
                          )}
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 text-[11px] font-bold px-1.5 py-0.5 rounded",
                              urgent
                                ? "bg-destructive/15 text-destructive"
                                : "bg-muted text-muted-foreground",
                            )}
                          >
                            <Clock className="w-3 h-3" />
                            {remainText}
                          </span>
                        </div>
                        {g.totalCount > 1 && (
                          <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary transition-all"
                              style={{ width: `${progressPct}%` }}
                            />
                          </div>
                        )}
                        <AssignmentStepBadges
                          includePre={g.include_pre}
                          includeAnalysis={g.include_analysis}
                          includeTranslation={g.include_translation}
                          includeWordtest={g.include_wordtest}
                          includeMemorize={taskModeIncludesMemorize(g.task_mode)}
                        />
                        {g.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {g.description}
                          </p>
                        )}
                        {(() => {
                          // 유닛별 워크북 흐름: 책 단위 과제라도 유닛마다 인쇄 요청 노출
                          const units = g.unitBreakdown.length > 0
                            ? g.unitBreakdown
                            : g.unitId
                              ? [{
                                  unitId: g.unitId,
                                  unit_no: 0,
                                  totalCount: g.totalCount,
                                  doneCount: g.doneCount,
                                }]
                              : [];
                          const multi = units.length > 1;
                          return units.map((u) => {
                            const wf = unitWorkflows[u.unitId];
                            const mv = materialViews[u.unitId];
                            const allDone = u.doneCount >= u.totalCount && u.totalCount > 0;
                            const status = wf?.status ?? "learning";
                            // 유닛이 아직 학습중이고 어떤 워크플로우도 없다면 숨김
                            if (!allDone && status === "learning") return null;
                            return (
                              <div
                                key={u.unitId}
                                className="flex flex-wrap items-center gap-1.5 pt-1"
                              >
                                {multi && (
                                  <span className="text-[11px] font-bold text-muted-foreground shrink-0">
                                    유닛 {u.unit_no}
                                    <span className="ml-1 text-[10px] font-normal">
                                      ({u.doneCount}/{u.totalCount})
                                    </span>
                                  </span>
                                )}
                                {allDone && (
                                  <Badge variant="secondary" className="text-[10px]">
                                    {UNIT_WORKFLOW_LABELS[status]}
                                  </Badge>
                                )}
                                {allDone && status === "learning" && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-[11px]"
                                    disabled={!!busy[`unit-print:${u.unitId}`]}
                                    onClick={() => handleUnitPrintRequest(u.unitId)}
                                  >
                                    <Printer className="w-3 h-3 mr-1" />
                                    인쇄 요청
                                  </Button>
                                )}
                                {status === "print_pending" && (
                                  <span className="text-[11px] text-amber-700 dark:text-amber-300 inline-flex items-center gap-1">
                                    <Hourglass className="w-3 h-3 animate-pulse" /> 인쇄 승인 대기
                                  </span>
                                )}
                                {status === "printed" && (
                                  <>
                                    <Button
                                      size="sm"
                                      className="h-7 text-[11px]"
                                      disabled={!!busy[`unit-wb:${u.unitId}`]}
                                      onClick={() => handleWorkbookComplete(u.unitId)}
                                    >
                                      <CheckCircle2 className="w-3 h-3 mr-1" />
                                      워크북 완료
                                    </Button>
                                    {mv?.status === "approved" ? (
                                      <Button size="sm" variant="outline" className="h-7 text-[11px]" asChild>
                                        <Link to="/learn/library">
                                          <BookOpen className="w-3 h-3 mr-1" /> 라이브러리
                                        </Link>
                                      </Button>
                                    ) : mv?.status === "pending" ? (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 text-[11px]"
                                        onClick={() => handleCancelMaterialView(u.unitId)}
                                      >
                                        자료열람 대기중
                                      </Button>
                                    ) : (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 text-[11px]"
                                        disabled={!!busy[`unit-mv:${u.unitId}`]}
                                        onClick={() => handleMaterialViewRequest(u.unitId)}
                                      >
                                        <Eye className="w-3 h-3 mr-1" /> 자료열람 요청
                                      </Button>
                                    )}
                                  </>
                                )}
                                {status === "workbook_submitted" && (
                                  <span className="text-[11px] text-sky-700 dark:text-sky-300 inline-flex items-center gap-1">
                                    <Hourglass className="w-3 h-3 animate-pulse" /> 선생님 승인 대기
                                  </span>
                                )}
                                {status === "completed" && wf?.teacher_grade && (
                                  <Badge className="text-[10px]">평가 {wf.teacher_grade}</Badge>
                                )}
                              </div>
                            );
                          });
                        })()}
                      </div>
                      {g.nextSentenceId && g.doneCount < g.totalCount && (() => {
                        const nextSid = g.nextSentenceId;
                        const nextAid = g.nextAssignmentId;
                        // 회독별 진행상태로 판단 (다른 회독 완료가 새 라운드로 새어들지 않게)
                        if (g.nextStarted) {
                          return (
                            <Button
                              size="sm"
                              onClick={() =>
                                setResumeTarget({
                                  sentenceId: nextSid,
                                  title: g.title,
                                  taskMode: g.task_mode,
                                  assignmentId: nextAid,
                                })
                              }
                              className="shrink-0"
                            >
                              <Play className="w-3 h-3 mr-1" />
                              {g.totalCount > 1 && g.nextPosition
                                ? `이어하기 (${g.nextPosition}/${g.totalCount})`
                                : "이어하기"}
                            </Button>
                          );
                        }
                        return (
                          <Button
                            size="sm"
                            onClick={() => void goLearn(nextSid, nextAid)}
                            className="shrink-0 bg-amber-600 hover:bg-amber-700 text-white"
                          >
                            <Play className="w-3 h-3 mr-1" />
                            {g.nextPosition && g.totalCount > 1
                              ? `다음 학습 (${g.nextPosition}/${g.totalCount})`
                              : "학습 시작"}
                          </Button>
                        );
                      })()}
                    </li>
                  );
                })}
              </ul>
            </Card>
            )}

            {noContent ? (
              <Card className="p-10 text-center space-y-4 bg-gradient-to-br from-amber-50 to-orange-50 border-amber-300 dark:from-amber-950/30 dark:to-orange-950/30">
                <AlertCircle className="w-16 h-16 mx-auto text-amber-600" />
                <h1 className="text-2xl font-extrabold text-amber-700 dark:text-amber-400">학습 자료 준비 중</h1>
                <p className="text-muted-foreground">
                  현재 지정된 레벨의 학습 지문이 아직 등록되지 않았습니다.<br/>
                  선생님께 문의해 주세요.
                </p>
              </Card>
            ) : done ? (
              <Card className="p-10 text-center space-y-4 bg-gradient-to-br from-primary/10 to-accent/10 border-primary/30">
                <Trophy className="w-16 h-16 mx-auto text-primary" />
                <h1 className="text-3xl font-extrabold text-primary">학습 완료! 🎓</h1>
                <p className="text-muted-foreground">
                  모든 레벨을 통과했어요. 정말 수고 많았습니다.
                </p>
              </Card>
            ) : (
              <>
                {user && (
                  <Card className="p-5 sm:p-6 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h2 className="text-sm font-bold text-foreground/80 uppercase tracking-wider">
                          종합점수
                        </h2>
                        <p className="text-xs text-muted-foreground mt-1">
                          최근 온라인·오프라인 합산 기록입니다.
                        </p>
                      </div>
                      <ClipboardList className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <DailyTestSummary userId={user.id} days={7} />
                  </Card>
                )}




            {/* Hero start card */}
            <Card className="relative overflow-hidden p-8 sm:p-10 bg-gradient-to-br from-primary to-accent text-primary-foreground border-0 shadow-2xl">
              <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-white/10 blur-2xl" />
              <div className="absolute -bottom-16 -left-10 w-56 h-56 rounded-full bg-white/5 blur-3xl" />
              <div className="relative space-y-6">
                <div className="space-y-1">
                  <div className="text-xs uppercase tracking-widest opacity-80">오늘의 학습</div>
                  <h1 className="text-3xl sm:text-4xl font-extrabold">
                    {next ? levelDisplay(next.level) : "—"}
                  </h1>
                  <div className="text-sm opacity-90">
                    {next ? `${next.id} · Passage ${next.no}` : "다음 Passage가 없습니다"}
                  </div>
                </div>
                {next && (
                  <p className="text-base sm:text-lg leading-relaxed font-medium opacity-95 line-clamp-3">
                    {next.english}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    size="lg"
                    onClick={handleStart}
                    disabled={!next}
                    className="bg-white text-primary hover:bg-white/90 font-bold text-base h-12 px-8 shadow-lg"
                  >
                    <Play className="w-5 h-5 mr-2 fill-primary" />
                    {startLabel}
                  </Button>
                  <span className="text-xs opacity-80">
                    1단어 학습 → 2구문 분석 + 해석 → 3단어 테스트
                  </span>
                </div>
              </div>
            </Card>

            {/* Recent */}
            <section className="space-y-3">
              <h2 className="text-sm font-bold text-foreground/80 uppercase tracking-wider">
                내 학습 카드 ({recent.length})
              </h2>
              {recent.length === 0 ? (
                <Card className="p-6 text-center text-sm text-muted-foreground">
                  아직 학습한 Passage가 없어요. 위 버튼을 눌러 시작하세요.
                </Card>
              ) : (
                <div className="grid gap-3 sm:grid-cols-3">
                  {recent.map(({ sentence, status, updated_at }) => {
                    const isFail = status === "fail";
                    const isHold = status === "hold";
                    const isPending = status === "pending";
                    return (
                      <Card
                        key={sentence.id}
                        className={cn(
                          "p-4 space-y-2 transition-colors",
                          isPending
                            ? "border-sky-500/40 hover:border-sky-500/60"
                            : isHold
                              ? "border-muted hover:border-muted-foreground/40"
                              : isFail
                                ? "border-amber-500/40 hover:border-amber-500/60"
                                : "border-primary/20 hover:border-primary/40",
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className="text-[10px] font-mono text-muted-foreground/60 truncate min-w-0 flex-1"
                            title={sentence.id}
                          >
                            {sentence.id}
                          </span>
                          <span
                            className={cn(
                              "shrink-0 px-2 py-0.5 rounded-full text-[10px] font-extrabold whitespace-nowrap",
                              isPending
                                ? "bg-sky-500 text-white"
                                : isHold
                                  ? "bg-muted text-muted-foreground"
                                  : isFail
                                    ? "bg-amber-500 text-white"
                                    : "bg-emerald-500 text-white",
                            )}
                          >
                            {isPending ? "채점전" : isHold ? "보류" : isFail ? "미통" : "PASS"}
                          </span>
                        </div>
                        <p className="text-xs text-foreground/80 line-clamp-2 min-h-[2.5em]">
                          {sentence.english}
                        </p>
                        <div className="flex flex-col gap-2">
                          <div className="text-[10px] text-muted-foreground">
                            {new Date(updated_at).toLocaleString("ko-KR", {
                              month: "2-digit",
                              day: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {/* 지문별 인쇄 요청 → 유닛 단위 정책으로 특별과제 카드에서 처리 */}
                            {/* 정답보기 요청 */}
                            {reviewReqs[sentence.id]?.status === "approved" ? (
                              <Button
                                size="sm"
                                className="h-7 text-[11px] px-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                                onClick={() =>
                                  navigate(`/learn/sentence/${encodeURIComponent(sentence.id)}/review`)
                                }
                              >
                                <CheckCircle2 className="w-3 h-3 mr-1" />
                                정답보기
                              </Button>
                            ) : reviewReqs[sentence.id]?.status === "pending" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-[11px] px-2 border-amber-500/50 text-amber-700 dark:text-amber-300"
                                onClick={() => handleCancelReview(sentence.id)}
                                disabled={!!busy[`review:${sentence.id}`]}
                                title="요청 취소"
                              >
                                <Hourglass className="w-3 h-3 mr-1 animate-pulse" />
                                정답보기 대기중
                              </Button>
                            ) : reviewReqs[sentence.id]?.status === "rejected" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-[11px] px-2"
                                onClick={() => handleRequestReview(sentence.id)}
                                disabled={!!busy[`review:${sentence.id}`]}
                                title="다시 요청"
                              >
                                <XCircle className="w-3 h-3 mr-1 text-destructive" />
                                재요청
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-[11px] px-2"
                                onClick={() => handleRequestReview(sentence.id)}
                                disabled={!!busy[`review:${sentence.id}`]}
                                title="선생님 정답과 대조 요청"
                              >
                                <Eye className="w-3 h-3 mr-1" />
                                정답보기 요청
                              </Button>
                            )}

                            {/* [분석자료 보기] / [분석 인쇄 요청] 버튼은 학생 화면에서
                                동작하지 않아 사용자 요청으로 제거됨 */}

                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-[11px] px-2"
                              onClick={() =>
                                navigate(`/learn/sentence/${encodeURIComponent(sentence.id)}?restart=1`)
                              }
                              title="1단계부터 다시 학습"
                            >
                              <RotateCcw className="w-3 h-3 mr-1" />
                              {isFail ? "다시 도전" : "다시 하기"}
                            </Button>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </section>
              </>
            )}
          </>
        )}
      </main>


      <AlertDialog open={!!resumeTarget} onOpenChange={(o) => !o && setResumeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>학습을 이어서 할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              {resumeTarget?.title} — 진행 중인 단계가 있어요. 이어서 하면 마지막 단계부터,
              처음부터 다시하면 1단계부터 시작합니다. (이전 작성 내용은 유지됩니다)
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel>취소</AlertDialogCancel>
            <Button
              variant="outline"
              onClick={async () => {
                if (!resumeTarget) return;
                const aid = resumeTarget.assignmentId ?? null;
                const prog = await fetchSentenceProgress(resumeTarget.sentenceId, aid);
                const mode = resumeTarget.taskMode ?? "analysis_only";
                const analysisPassed = prog?.status === "pass";
                const path = learnPathForSentence(resumeTarget.sentenceId, mode, analysisPassed, aid);
                const sep = path.includes("?") ? "&" : "?";
                navigate(`${path}${sep}restart=1`);
                setResumeTarget(null);
              }}
            >
              처음부터 다시
            </Button>
            <AlertDialogAction
              onClick={async () => {
                if (!resumeTarget) return;
                const aid = resumeTarget.assignmentId ?? null;
                const cont = await resolveContinueSentenceId(
                  resumeTarget.sentenceId,
                  aid,
                );
                const prog = await fetchSentenceProgress(
                  cont.sentenceId,
                  cont.assignmentId,
                );
                const mode = resumeTarget.taskMode ?? "analysis_only";
                navigate(
                  learnPathForSentence(
                    cont.sentenceId,
                    mode,
                    prog?.status === "pass",
                    cont.assignmentId,
                  ),
                );
                setResumeTarget(null);
              }}
            >
              이어하기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default StudentHome;

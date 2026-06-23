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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  Archive,
  Loader2,
  Printer,
  RefreshCcw,
  FileText,
  Eye,
  BookOpen,
  ChevronDown,
} from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentUserId } from "@/lib/authState";
import { ensureHandoutRow, toIsoDate, type HandoutResult } from "@/lib/handoutResults";
import WordHoInput from "@/components/teacher/WordHoInput";
import SyntaxHoToggle from "@/components/teacher/SyntaxHoToggle";
import { subscribeToPrintRequests } from "@/lib/printRequests";
import { launchPrintHtml, launchPrintHtmlMany, prewarmPrintDocument } from "@/lib/printLauncher";
import {
  buildHandoutPrintHtmlFor,
  buildWordPrintHtmlFor,
  buildAnalysisPrintHtmlFor,
  printStageMessage,
  PrintPreloadError,
} from "@/lib/printPreload";
import { errMsg } from "@/lib/errMsg";
import { buildUnitWorkbookHtmlFor } from "@/lib/unitWorkbook";
import { ensureLogoDataUri } from "@/lib/printTemplates";
import { toast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  completeUnitLearning,
  UNIT_WORKFLOW_LABELS,
  type UnitWorkflowRow,
  type TeacherGrade,
} from "@/lib/unitWorkflow";

const compareLearningCode = (a: string, b: string): number =>
  a.localeCompare(b, "ko", { numeric: true, sensitivity: "base" });

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
  // key: `${user_id}::${sentence_id}` → HandoutResult (문장별 분리)
  const [handoutMap, setHandoutMap] = useState<Record<string, HandoutResult>>({});
  // key: `${user_id}::${sentence_id}` → AttemptStat
  const [attemptMap, setAttemptMap] = useState<Record<string, AttemptStat>>({});
  // 학생별 sentence_id 목록 (그 날 활동 흔적이 있는 모든 sentence)
  const [studentSentences, setStudentSentences] = useState<Record<string, string[]>>({});
  // userId → 학생의 마지막 활동 ISO timestamp (학생 카드 정렬용)
  const [studentLastActivity, setStudentLastActivity] = useState<Record<string, string>>({});
  // sentence_id → unit_id 매핑 (그룹핑용)
  const [codeToUnit, setCodeToUnit] = useState<Record<string, string>>({});
  // unit_id → 라벨 ("[Lxx] 교재 · Uxx 유닛")
  const [unitLabel, setUnitLabel] = useState<Record<string, string>>({});
  // 펼침 상태: `${userId}::${unitKey}` → boolean (기본: 닫힘)
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  // 한글해석 제출 여부: `${userId}::${sentenceId}` → true
  const [translationSet, setTranslationSet] = useState<Record<string, boolean>>({});
  // 한글해석 본문 캐시 (hover 시 fetch): `${userId}::${sentenceId}` → text | null(미제출) | undefined(미조회)
  const [translationTextCache, setTranslationTextCache] = useState<
    Record<string, string | null>
  >({});
  // 단어시험 오답복습(remediation) 시도 횟수: `${userId}::${parentSid}` → count
  const [remediationCountMap, setRemediationCountMap] = useState<
    Record<string, number>
  >({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [teacherId, setTeacherId] = useState<string | null>(null);
  // 낙관적 인쇄완료 표기: `${userId}::${sentenceId}` → ISO timestamp
  const [printedSet, setPrintedSet] = useState<Record<string, string>>({});
  const [wordPaperSize, setWordPaperSize] = useState<"A4" | "B5">(() => {
    if (typeof window === "undefined") return "B5";
    const v = window.localStorage.getItem("gwjt.print.wordPaperSize");
    return v === "A4" ? "A4" : "B5";
  });
  useEffect(() => {
    try { window.localStorage.setItem("gwjt.print.wordPaperSize", wordPaperSize); } catch { /* ignore */ }
  }, [wordPaperSize]);
  const [answerKeyMode, setAnswerKeyMode] = useState(false);
  // 한글해석 / 단어시험 보기 다이얼로그
  const [viewDialog, setViewDialog] = useState<{
    kind: "translation" | "wordTest";
    title: string;
    body: React.ReactNode;
  } | null>(null);
  const [unitWorkflowMap, setUnitWorkflowMap] = useState<Record<string, UnitWorkflowRow>>({});
  const [unitGradeDraft, setUnitGradeDraft] = useState<Record<string, TeacherGrade>>({});
  const [unitMemoDraft, setUnitMemoDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    getCurrentUserId().then((userId) => {
      if (!cancelled) setTeacherId(userId);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // 인쇄대기열에서 인쇄 완료된 행도 실시간 반영
  useEffect(() => {
    const unsub = subscribeToPrintRequests((evt, row) => {
      if (!row) return;
      if (
        (evt === "UPDATE" || evt === "INSERT") &&
        row.status === "printed" &&
        row.handled_at
      ) {
        const key = `${row.user_id}::${row.sentence_id}`;
        setPrintedSet((p) => ({ ...p, [key]: row.handled_at as string }));
      }
    });
    return unsub;
  }, []);

  // HO 점수 입력 후 handoutMap 갱신 (sentence 별 키)
  const handleHandoutSaved = (row: HandoutResult) => {
    const key = `${row.user_id}::${row.sentence_id ?? ""}`;
    setHandoutMap((prev) => ({ ...prev, [key]: row }));
  };

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
        progressRes,
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
        // sentence_progress fallback — attempt_log 누락/0점 케이스 보정용
        // last_activity_at이 오늘인 모든 progress 행을 가져와 화면 집계의 신뢰도를 올린다.
        supabase
          .from("sentence_progress")
          .select(
            "user_id, sentence_id, analysis_done, analysis_match_rate, translation_done, word_test_done, last_activity_at, updated_at",
          )
          .gte("last_activity_at", startIso)
          .lte("last_activity_at", endIso),
      ]);

      const pairs = new Map<string, Set<string>>(); // userId → Set<sentenceId>
      // (userId::sentenceId) → 가장 최근 활동 timestamp (ms)
      const pairLastActivity = new Map<string, number>();
      // userId → 가장 최근 활동 timestamp (ms)
      const userLastActivity = new Map<string, number>();
      const noteActivity = (
        uid: string | null | undefined,
        sid: string | null | undefined,
        ts: string | null | undefined,
      ) => {
        if (!uid || !sid || !ts) return;
        const ms = new Date(ts).getTime();
        if (!Number.isFinite(ms)) return;
        const k = `${uid}::${sid}`;
        const cur = pairLastActivity.get(k);
        if (cur == null || ms > cur) pairLastActivity.set(k, ms);
        const uCur = userLastActivity.get(uid);
        if (uCur == null || ms > uCur) userLastActivity.set(uid, ms);
      };
      // 단어시험 오답복습 sid 패턴: "<원래코드>__remediation_<숫자>"
      const REMEDIATION_RE = /__remediation_\d+$/;
      const isRemediationSid = (sid: string | null | undefined): boolean =>
        !!sid && REMEDIATION_RE.test(sid);
      const parentOfRemediation = (sid: string): string =>
        sid.replace(REMEDIATION_RE, "");
      // (userId, parentSid) → Set<remediation_attempt_no> (distinct 카운트용)
      const remediationAttempts = new Map<string, Set<string>>();
      const noteRemediation = (uid: string | null | undefined, sid: string | null | undefined) => {
        if (!uid || !sid) return;
        if (!isRemediationSid(sid)) return;
        const parent = parentOfRemediation(sid);
        const suffix = sid.slice(parent.length); // "__remediation_3"
        const k = `${uid}::${parent}`;
        const set = remediationAttempts.get(k) ?? new Set<string>();
        set.add(suffix);
        remediationAttempts.set(k, set);
      };
      const addPair = (
        uid: string | null | undefined,
        sid: string | null | undefined,
        ts?: string | null,
      ) => {
        if (!uid || !sid) return;
        // 합성 remediation sid 는 별도 카드로 띄우지 않고 카운트만 잡는다
        if (isRemediationSid(sid)) {
          noteRemediation(uid, sid);
          // remediation 활동도 부모 sid의 최신 활동으로 반영
          if (ts) noteActivity(uid, parentOfRemediation(sid), ts);
          return;
        }
        const set = pairs.get(uid) ?? new Set<string>();
        set.add(sid);
        pairs.set(uid, set);
        if (ts) noteActivity(uid, sid, ts);
      };
      const printedRows = (printedRes.data ?? []) as Array<{
        user_id: string;
        sentence_id: string;
        handled_at: string;
      }>;
      printedRows.forEach((r) => addPair(r.user_id, r.sentence_id, r.handled_at));
      ((attemptsRes.data ?? []) as Array<{
        user_id: string;
        sentence_id: string;
        completed_at: string | null;
      }>).forEach((r) => addPair(r.user_id, r.sentence_id, r.completed_at));
      const tSet: Record<string, boolean> = {};
      ((translationsRes.data ?? []) as Array<{
        user_id: string;
        sentence_id: string;
        submitted_at: string | null;
      }>).forEach((r) => {
        addPair(r.user_id, r.sentence_id, r.submitted_at);
        if (!isRemediationSid(r.sentence_id)) {
          tSet[`${r.user_id}::${r.sentence_id}`] = true;
        }
      });
      ((wordTestRes.data ?? []) as Array<{
        user_id: string;
        sentence_id: string;
        taken_at: string | null;
      }>).forEach((r) => addPair(r.user_id, r.sentence_id, r.taken_at));
      ((wordPreRes.data ?? []) as Array<{
        user_id: string;
        sentence_id: string;
        taken_at: string | null;
      }>).forEach((r) => addPair(r.user_id, r.sentence_id, r.taken_at));
      // sentence_progress 도 짝 추가 — attempt_log 미생성 케이스(예: 분석만 끝나고 단어시험 전)도 표에 노출
      const progressRows = (progressRes.data ?? []) as Array<{
        user_id: string;
        sentence_id: string;
        analysis_done: boolean;
        analysis_match_rate: number | null;
        translation_done: boolean;
        word_test_done: boolean;
        last_activity_at: string | null;
        updated_at: string | null;
      }>;
      progressRows.forEach((r) => {
        addPair(r.user_id, r.sentence_id, r.last_activity_at ?? r.updated_at);
        if (r.translation_done && !isRemediationSid(r.sentence_id)) {
          tSet[`${r.user_id}::${r.sentence_id}`] = true;
        }
      });

      // 오답복습 카운트 맵 — 부모 sid 가 실제 카드로 등장하는 경우만 노출
      const rcMap: Record<string, number> = {};
      remediationAttempts.forEach((set, k) => {
        rcMap[k] = set.size;
      });
      setRemediationCountMap(rcMap);


      const userIds = Array.from(pairs.keys());
      // handout_results는 user 단독으로도 보여줌 (sentence 없이 점수만 있는 경우)
      ((handoutRes.data ?? []) as HandoutResult[]).forEach((r) => {
        if (!pairs.has(r.user_id)) pairs.set(r.user_id, new Set());
      });
      const allUserIds = Array.from(pairs.keys());

      const sMap: Record<string, StudentInfo> = {};
      const hMap: Record<string, HandoutResult> = {};
      ((handoutRes.data ?? []) as HandoutResult[]).forEach((r) => {
        const key = `${r.user_id}::${r.sentence_id ?? ""}`;
        hMap[key] = r;
      });

      if (allUserIds.length > 0) {
        const { data: sp } = await supabase
          .from("student_profiles")
          .select("user_id, display_name, student_no")
          .in("user_id", allUserIds);
        (sp ?? []).forEach((s) => {
          const row = s as { user_id: string; display_name: string | null; student_no: string };
          sMap[row.user_id] = {
            user_id: row.user_id,
            display_name: row.display_name,
            student_no: row.student_no,
          };
        });

        const { data: uwRows } = await (supabase as unknown as {
          from: (table: string) => {
            select: (columns: string) => {
              in: (column: string, values: string[]) => Promise<{ data: unknown[] | null }>;
            };
          };
        })
          .from("unit_workflows")
          .select("*")
          .in("user_id", allUserIds);
        const uwMap: Record<string, UnitWorkflowRow> = {};
        ((uwRows ?? []) as unknown as UnitWorkflowRow[]).forEach((r) => {
          uwMap[`${r.user_id}::${r.unit_id}`] = r;
        });
        setUnitWorkflowMap(uwMap);
      } else {
        setUnitWorkflowMap({});
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
      // word_test_results — 항상 best_word_score와 비교 후 max
      ((wordTestRes.data ?? []) as Array<{
        user_id: string;
        sentence_id: string;
        score: number;
        passed: boolean;
      }>).forEach((w) => {
        const key = `${w.user_id}::${w.sentence_id}`;
        const cur = aMap[key];
        const sc = Number(w.score ?? 0);
        if (!cur) {
          aMap[key] = {
            best_word_score: sc,
            best_analysis_rate: null,
            word_passed: !!w.passed,
            analysis_passed: false,
            printed_at: null,
          };
        } else {
          aMap[key] = {
            ...cur,
            best_word_score:
              cur.best_word_score == null ? sc : Math.max(cur.best_word_score, sc),
            word_passed: cur.word_passed || !!w.passed,
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
      // sentence_progress fallback —
      //  · attempt_log이 0/F이거나 누락된 경우, 학생이 즉시 저장한 분석 결과로 보정.
      //  · 화면 집계가 실제 학습량보다 적게 보이는 사고를 막는다.
      progressRows.forEach((p) => {
        const key = `${p.user_id}::${p.sentence_id}`;
        const cur = aMap[key] ?? {
          best_word_score: null,
          best_analysis_rate: null,
          word_passed: false,
          analysis_passed: false,
          printed_at: null,
        };
        // 분석률 보정: progress의 match_rate가 attempt_log보다 크면 우세
        if (p.analysis_match_rate != null) {
          const ar = Number(p.analysis_match_rate);
          if (
            cur.best_analysis_rate == null ||
            ar > cur.best_analysis_rate
          ) {
            cur.best_analysis_rate = ar;
          }
        }
        // 통과 여부 보정: progress가 done이고 임계 0.8 이상이면 PASS로 표시
        if (
          p.analysis_done &&
          (cur.best_analysis_rate ?? 0) >= 0.8 &&
          !cur.analysis_passed
        ) {
          cur.analysis_passed = true;
        }
        // 단어시험 통과 보정
        if (p.word_test_done) cur.word_passed = cur.word_passed || true;
        aMap[key] = cur;
      });
      setAttemptMap(aMap);

      // 학생별 sentence_id 목록 — 교재/유닛 학습순서 기준
      const ssMap: Record<string, string[]> = {};
      pairs.forEach((set, uid) => {
        ssMap[uid] = Array.from(set).sort(compareLearningCode);
      });
      setStudentSentences(ssMap);
      const ulaObj: Record<string, string> = {};
      userLastActivity.forEach((ms, uid) => {
        ulaObj[uid] = new Date(ms).toISOString();
      });
      setStudentLastActivity(ulaObj);
      setTranslationSet(tSet);

      // 4) sentence_id → unit_id, unit_id → 라벨 로드
      const allSids = Array.from(new Set(Object.values(ssMap).flat()));
      if (allSids.length > 0) {
        const { data: pgRows } = await supabase
          .from("textbook_passages")
          .select("code, unit_id, textbook_id")
          .in("code", allSids);
        const c2u: Record<string, string> = {};
        const unitIds = new Set<string>();
        const tbIds = new Set<string>();
        ((pgRows ?? []) as { code: string; unit_id: string; textbook_id: string }[]).forEach(
          (p) => {
            if (p.unit_id) {
              c2u[p.code] = p.unit_id;
              unitIds.add(p.unit_id);
              if (p.textbook_id) tbIds.add(p.textbook_id);
            }
          },
        );
        setCodeToUnit(c2u);

        // 라벨 (textbook level/title + unit_no/title)
        if (unitIds.size > 0) {
          const { data: uRows } = await supabase
            .from("textbook_units")
            .select("id, unit_no, title, textbook_id")
            .in("id", Array.from(unitIds));
          let tbMap = new Map<string, { level: string; title: string }>();
          if (tbIds.size > 0) {
            const { data: tbRows } = await supabase
              .from("textbooks")
              .select("id, level, title")
              .in("id", Array.from(tbIds));
            ((tbRows ?? []) as { id: string; level: string; title: string }[]).forEach(
              (t) => tbMap.set(t.id, { level: t.level, title: t.title }),
            );
          }
          const lblMap: Record<string, string> = {};
          ((uRows ?? []) as {
            id: string; unit_no: number; title: string; textbook_id: string;
          }[]).forEach((u) => {
            const tb = tbMap.get(u.textbook_id);
            const tbPrefix = tb ? `[${tb.level}] ${tb.title}` : "";
            lblMap[u.id] = `${tbPrefix} · U${u.unit_no} ${u.title}`.trim();
          });
          setUnitLabel(lblMap);
        }
      }

      // === pre-warm: 풀 iframe 만 살려둠 (HTML 직주입 방식이라 별도 prefetch 불필요) ===
      prewarmPrintDocument();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, [date]);

  const groupedEntries = useMemo(
    () =>
      Object.entries(studentSentences).sort(([a], [b]) => {
        const ta = studentLastActivity[a] ? new Date(studentLastActivity[a]).getTime() : 0;
        const tb = studentLastActivity[b] ? new Date(studentLastActivity[b]).getTime() : 0;
        if (tb !== ta) return tb - ta; // 최근 활동한 학생이 위
        // tie-breaker: 학번 오름차순
        const sa = students[a]?.student_no ?? "";
        const sb = students[b]?.student_no ?? "";
        return sa.localeCompare(sb);
      }),
    [studentSentences, studentLastActivity, students],
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
    // 1) 데이터 사전 적재 → HTML 생성 → hidden iframe 직주입 인쇄
    let html: string;
    try {
      html = await buildHandoutPrintHtmlFor({ sentenceId, studentId: userId });
    } catch (e) {
      const msg = e instanceof PrintPreloadError ? printStageMessage(e.stage) : errMsg(e);
      toast({ title: "인쇄 준비 실패", description: msg, variant: "destructive" });
      setBusy((p) => ({ ...p, [key]: false }));
      return;
    }
    launchPrintHtml(html, { jobKey: key }).catch((e) => {
      toast({
        title: "인쇄창 호출 실패",
        description: errMsg(e),
        variant: "destructive",
      });
    });
    // 2) 낙관적 마킹 — HO 입력란 즉시 활성화
    const nowIso = new Date().toISOString();
    const stateKey = `${userId}::${sentenceId}`;
    setPrintedSet((p) => ({ ...p, [stateKey]: nowIso }));
    // 3) 백그라운드 처리: print_requests 로깅 + handout 행 보장
    try {
      const currentTeacherId = await getCurrentUserId();
      supabase
        .from("print_requests")
        .insert({
          user_id: userId,
          sentence_id: sentenceId,
          teacher_id: currentTeacherId,
          status: "printed",
          handled_at: nowIso,
          handled_by: currentTeacherId,
          note: "teacher-print",
        })
        .then(({ error }) => {
          if (error) console.warn("[LearningResults] print_requests insert skipped", error);
        });
      const row = await ensureHandoutRow(
        userId,
        currentTeacherId,
        toIsoDate(new Date()),
        sentenceId,
      );
      setHandoutMap((prev) => ({ ...prev, [`${userId}::${sentenceId}`]: row }));
    } catch (e) {
      // 인쇄 자체는 성공이므로 사용자 토스트는 굳이 띄우지 않음
      console.warn("[LearningResults] handout row ensure failed", e);
    } finally {
      setBusy((p) => ({ ...p, [key]: false }));
    }
  };

  const handleRetest = async (userId: string, sentenceId: string) => {
    const key = `retest:${userId}:${sentenceId}`;
    setBusy((p) => ({ ...p, [key]: true }));
    try {
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
      const currentTeacherId = await getCurrentUserId();
      if (currentTeacherId) {
        const due = new Date();
        due.setDate(due.getDate() + 1);
        await supabase.from("assignments").insert({
          teacher_id: currentTeacherId,
          student_id: userId,
          sentence_id: sentenceId,
          title: `[재시험] ${sentenceId}`,
          description: "이전 학습 결과 기반 재시험",
          due_at: due.toISOString(),
          include_pre: true,
          include_analysis: true,
          include_translation: true,
          include_wordtest: true,
        });
      }
      toast({
        title: "재시험 등록됨",
        description: "학생 홈에 [재시험] 특별과제로 표시됩니다.",
      });
    } catch (e) {
      toast({ title: "재시험 등록 실패", description: errMsg(e), variant: "destructive" });
    } finally {
      setBusy((p) => ({ ...p, [key]: false }));
    }
  };

  const handleCompleteUnit = async (userId: string, unitId: string) => {
    const draftKey = `${userId}::${unitId}`;
    const grade = unitGradeDraft[draftKey];
    if (!grade) {
      toast({ title: "A~E 등급을 선택하세요", variant: "destructive" });
      return;
    }
    const memo = unitMemoDraft[draftKey] ?? "";
    const busyKey = `unit-complete:${draftKey}`;
    setBusy((p) => ({ ...p, [busyKey]: true }));
    try {
      const row = await completeUnitLearning(userId, unitId, grade, memo);
      setUnitWorkflowMap((prev) => ({ ...prev, [draftKey]: row }));
      toast({ title: "유닛 학습완료 처리", description: `평가 ${grade}` });
    } catch (e) {
      toast({ title: "처리 실패", description: errMsg(e), variant: "destructive" });
    } finally {
      setBusy((p) => ({ ...p, [busyKey]: false }));
    }
  };

  const handlePrintAll = async (
    userId: string,
    sentenceIds: string[],
    mode: "syntax_unit" | "word_unit" = "syntax_unit",
    paperSize: "A4" | "B5" = wordPaperSize,
    answerKey: boolean = answerKeyMode,
  ) => {
    // sentence_id → unit_id 로 그룹핑 후 유닛별 통합 워크북 1장씩 인쇄
    try {
      // 로고 base64 준비 (about:blank iframe에서도 표시되도록)
      await ensureLogoDataUri();
      const groups = new Map<string, string[]>();
      sentenceIds.forEach((sid) => {
        const uid = codeToUnit[sid];
        if (!uid) return; // unit 매핑이 없는 문장은 스킵 (사용자 문장 등)
        if (!groups.has(uid)) groups.set(uid, []);
        groups.get(uid)!.push(sid);
      });
      if (groups.size === 0) {
        toast({ title: "유닛에 속한 완료 지문이 없어요", variant: "destructive" });
        return;
      }
      const htmls: string[] = [];

      // 단어 모드: 학생이 활동한 본문이 속한 "교재 전체 본문"을 모두 포함
      // (구문 모드는 활동한 유닛만 — 분량이 너무 커지므로)
      let queueUnitIds: string[] = Array.from(groups.keys());
      const unitLabelLocal: Record<string, string> = { ...unitLabel };
      if (mode === "word_unit") {
        try {
          const touchedUnitIds = Array.from(groups.keys());
          const { data: tuRows } = await supabase
            .from("textbook_units")
            .select("textbook_id")
            .in("id", touchedUnitIds);
          const tbIds = Array.from(
            new Set(((tuRows ?? []) as { textbook_id: string }[])
              .map((r) => r.textbook_id)
              .filter(Boolean)),
          );
          if (tbIds.length > 0) {
            const { data: allUnits } = await supabase
              .from("textbook_units")
              .select("id, unit_no, title, textbook_id")
              .in("textbook_id", tbIds);
            const { data: tbRows } = await supabase
              .from("textbooks")
              .select("id, level, title")
              .in("id", tbIds);
            const tbMap = new Map<string, { level: string; title: string }>();
            ((tbRows ?? []) as { id: string; level: string; title: string }[]).forEach(
              (t) => tbMap.set(t.id, { level: t.level, title: t.title }),
            );
            const expanded: string[] = [];
            ((allUnits ?? []) as {
              id: string; unit_no: number; title: string; textbook_id: string;
            }[]).forEach((u) => {
              expanded.push(u.id);
              if (!unitLabelLocal[u.id]) {
                const tb = tbMap.get(u.textbook_id);
                const tbPrefix = tb ? `[${tb.level}] ${tb.title}` : "";
                unitLabelLocal[u.id] = `${tbPrefix} · U${u.unit_no} ${u.title}`.trim();
              }
            });
            if (expanded.length > 0) queueUnitIds = expanded;
          }
        } catch (e) {
          console.warn("[LearningResults] textbook expansion failed", e);
        }
      }

      // 라벨 기준 오름차순 정렬 (본문1 → 본문2 → 본문3)
      const sortedUnitIds = queueUnitIds.sort((a, b) => {
        const la = unitLabelLocal[a] ?? a;
        const lb = unitLabelLocal[b] ?? b;
        return la.localeCompare(lb, "ko", { numeric: true, sensitivity: "base" });
      });
      for (let i = 0; i < sortedUnitIds.length; i++) {
        const unitId = sortedUnitIds[i];
        const label = unitLabelLocal[unitId] ?? "Unit";
        try {
          const { html } = await buildUnitWorkbookHtmlFor({
            unitId,
            unitTitle: label,
            unitCode: label,
            studentId: userId,
            mode,
            paperSize,
            answerKey,
            // 단어 통합 인쇄: 첫 페이지에만 학생명/로고 표시
            showStudentHeader: mode === "word_unit" ? i === 0 : true,
          });
          htmls.push(html);
        } catch (e) {
          console.warn("[LearningResults] unit workbook build failed", unitId, e);
        }
      }
      if (htmls.length === 0) {
        toast({ title: "인쇄할 워크북 생성에 실패했어요", variant: "destructive" });
        return;
      }
      // 여러 유닛이 섞여 있어도 인쇄 작업은 하나로 합쳐서 1번만 띄운다
      // (각 유닛의 body 만 추출해 한 문서에 이어붙임)
      const combinedHtml = htmls.length === 1
        ? htmls[0]
        : (() => {
            const first = htmls[0];
            const headEnd = first.search(/<\/head>/i);
            const headPart = headEnd >= 0 ? first.slice(0, headEnd + 7) : "<!DOCTYPE html><html><head></head>";
            const bodies = htmls
              .map((h) => {
                const m = h.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
                return m ? m[1] : h;
              })
              .join("\n");
            return `${headPart}<body>${bodies}<script>try{window.__LOVABLE_PRINT_READY=true;}catch(e){}</script></body></html>`;
          })();
      launchPrintHtml(combinedHtml, { jobKey: `printAll:${userId}:${mode}${answerKey ? ":ans" : ""}` }).catch((e) =>
        console.warn("[LearningResults] launchPrintHtml failed", e),
      );
      const isWord = mode === "word_unit";
      toast({
        title: `${isWord ? "단어" : "구문"} 유닛 통합 ${answerKey ? "답지 " : ""}워크북 ${htmls.length}건 인쇄 시작`,
        description: answerKey
          ? "정답이 채워진 답지 버전입니다"
          : (isWord ? "유닛 전체 단어 시험지" : "앞면=영문+해석, 뒷면=구조도"),
      });
    } catch (e) {
      const msg = e instanceof PrintPreloadError ? printStageMessage(e.stage) : errMsg(e);
      toast({ title: "인쇄 준비 실패", description: msg, variant: "destructive" });
    }
  };

  // 단어 HO 인쇄 (오답만 / 전체 × 한글/스펠/혼합)
  const handlePrintWord = async (
    userId: string,
    sentenceId: string,
    scope: "wrong" | "all",
    mode: "ko" | "en" | "mix" = "ko",
  ) => {
    const key = `wordPrint:${userId}:${sentenceId}:${scope}:${mode}`;
    let html: string;
    try {
      html = await buildWordPrintHtmlFor({ sentenceId, studentId: userId, scope, mode });
    } catch (e) {
      const msg = e instanceof PrintPreloadError ? printStageMessage(e.stage) : errMsg(e);
      toast({ title: "단어 HO 준비 실패", description: msg, variant: "destructive" });
      return;
    }
    launchPrintHtml(html, { jobKey: key }).catch((e) =>
      console.warn("[LearningResults] word launchPrintHtml failed", e),
    );
    const nowIso = new Date().toISOString();
    setPrintedSet((p) => ({ ...p, [`${userId}::${sentenceId}`]: nowIso }));
    try {
      const currentTeacherId = await getCurrentUserId();
      // print_requests insert 실패는 사용자에게 노출하지 않음 (인쇄 자체는 성공)
      supabase
        .from("print_requests")
        .insert({
          user_id: userId,
          sentence_id: sentenceId,
          teacher_id: currentTeacherId,
          status: "printed",
          handled_at: nowIso,
          handled_by: currentTeacherId,
          note: `teacher-print-word-${scope}`,
        })
        .then(({ error }) => {
          if (error) console.warn("[LearningResults] word print_requests insert skipped", error);
        });
      const row = await ensureHandoutRow(
        userId,
        currentTeacherId,
        toIsoDate(new Date()),
        sentenceId,
      );
      setHandoutMap((prev) => ({ ...prev, [`${userId}::${sentenceId}`]: row }));
    } catch (e) {
      console.warn("[LearningResults] word print log failed", e);
    }
  };

  // hover 시 한글해석 본문 프리페치 (1회 캐시)
  const prefetchTranslation = async (userId: string, sentenceId: string) => {
    const key = `${userId}::${sentenceId}`;
    if (key in translationTextCache) return;
    const { data } = await supabase
      .from("sentence_translations")
      .select("text")
      .eq("user_id", userId)
      .eq("sentence_id", sentenceId)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setTranslationTextCache((p) => ({ ...p, [key]: data?.text ?? null }));
  };

  // 학생이 제출한 한글해석 보기
  const handleViewTranslation = async (userId: string, sentenceId: string) => {
    const { data } = await supabase
      .from("sentence_translations")
      .select("text, submitted_at")
      .eq("user_id", userId)
      .eq("sentence_id", sentenceId)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setViewDialog({
      kind: "translation",
      title: `한글해석 — ${sentenceId}`,
      body: data?.text ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            제출:{" "}
            {new Date(data.submitted_at).toLocaleString("ko-KR")}
          </p>
          <p className="whitespace-pre-wrap leading-relaxed text-sm bg-muted/30 p-3 rounded">
            {data.text}
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">제출된 해석이 없습니다.</p>
      ),
    });
  };

  // 학생 단어시험 결과 보기
  const handleViewWordTest = async (userId: string, sentenceId: string) => {
    const { data } = await supabase
      .from("word_test_results")
      .select("score, passed, items, wrong_words, taken_at, attempt_no")
      .eq("user_id", userId)
      .eq("sentence_id", sentenceId)
      .order("taken_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) {
      setViewDialog({
        kind: "wordTest",
        title: `단어시험 — ${sentenceId}`,
        body: <p className="text-sm text-muted-foreground">결과가 없습니다.</p>,
      });
      return;
    }
    const items = (data.items ?? []) as Array<{
      word: string;
      expected: string;
      given: string;
      correct: boolean;
    }>;
    setViewDialog({
      kind: "wordTest",
      title: `단어시험 — ${sentenceId} · ${data.passed ? "통과" : "재시도"} (${Math.round(Number(data.score) * 100)}점)`,
      body: (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            응시: {new Date(data.taken_at).toLocaleString("ko-KR")} · {data.attempt_no}회차
          </p>
          <div className="overflow-hidden rounded border border-border max-h-[60vh] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 sticky top-0">
                <tr>
                  <th className="text-left px-2 py-1">단어</th>
                  <th className="text-left px-2 py-1">정답</th>
                  <th className="text-left px-2 py-1">학생 답</th>
                  <th className="text-center px-2 py-1 w-12">결과</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((it, i) => (
                  <tr key={i} className={it.correct ? "" : "bg-destructive/5"}>
                    <td className="px-2 py-1 font-mono">{it.word}</td>
                    <td className="px-2 py-1">{it.expected}</td>
                    <td
                      className={
                        it.correct
                          ? "px-2 py-1 text-primary"
                          : "px-2 py-1 text-destructive"
                      }
                    >
                      {it.given || "—"}
                    </td>
                    <td className="px-2 py-1 text-center">
                      {it.correct ? "✓" : "✗"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ),
    });
  };


  return (
    <TeacherLayout>
      <div className="p-6 max-w-6xl mx-auto space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Archive className="size-6 text-primary" />
            학습결과
            <span className="text-sm font-normal text-muted-foreground">
              · 학생 {groupedEntries.length}명
            </span>
          </h1>
          <div className="flex items-center gap-2">
            <label
              className={`text-xs flex items-center gap-1.5 px-2.5 h-9 rounded-md border cursor-pointer transition-colors ${
                answerKeyMode
                  ? "border-destructive bg-destructive/10 text-destructive font-bold"
                  : "border-input bg-background text-muted-foreground hover:bg-muted/40"
              }`}
              title="켜면 모든 인쇄가 정답 채워진 답지 버전으로 출력됩니다"
            >
              <input
                type="checkbox"
                checked={answerKeyMode}
                onChange={(e) => setAnswerKeyMode(e.target.checked)}
                className="size-3.5 accent-destructive"
              />
              답지 모드
            </label>
            <label className="text-xs text-muted-foreground flex items-center gap-1">
              단어 인쇄 용지
              <select
                value={wordPaperSize}
                onChange={(e) => setWordPaperSize(e.target.value === "A4" ? "A4" : "B5")}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="B5">B5 (권장)</option>
                <option value="A4">A4</option>
              </select>
            </label>
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
              return (
                <Card key={userId} className="p-4 space-y-3">
                  {/* 학생 헤더 */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-foreground">
                      {s?.display_name ?? "학생"}
                    </span>
                    <span className="text-xs font-mono text-muted-foreground">
                      ({s?.student_no ?? "—"})
                    </span>
                    <span className="text-xs text-muted-foreground ml-1">
                      · 활동 {sentenceIds.length}건
                    </span>
                    {/* 학생별 워크북 모드 토글 제거됨 — 인쇄 시 모달에서 직접 선택 */}
                    <div className="ml-auto flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handlePrintAll(userId, sentenceIds, "syntax_unit")}
                        title={answerKeyMode ? "구문 · 유닛 통합 답지 (정답 채워짐)" : "구문 · 유닛 통합 워크북 (영어분석+해석)"}
                        className={answerKeyMode ? "border-destructive text-destructive" : ""}
                      >
                        <Printer className="size-3.5 mr-1" />
                        구문 전체{answerKeyMode ? " 답지" : ""}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handlePrintAll(userId, sentenceIds, "word_unit")}
                        title={answerKeyMode ? "단어 · 유닛 통합 답지 (정답 채워짐)" : "단어 · 유닛 통합 시험지"}
                        className={answerKeyMode ? "border-destructive text-destructive" : ""}
                      >
                        <Printer className="size-3.5 mr-1" />
                        단어 전체{answerKeyMode ? " 답지" : ""}
                      </Button>
                    </div>
                  </div>

                  {/* 유닛별 그룹핑: 같은 unit_id의 sentence들을 한 카드(접이식)로 묶음 */}
                  {(() => {
                    // 학생의 sentence들을 unit으로 그룹핑 (교재/유닛 학습순서 기준)
                    const groups = new Map<string, string[]>();
                    sentenceIds.forEach((sid) => {
                      const uid = codeToUnit[sid];
                      const groupKey = uid ?? `__nounit__${sid}`;
                      if (!groups.has(groupKey)) groups.set(groupKey, []);
                      groups.get(groupKey)!.push(sid);
                    });
                    const groupArr = Array.from(groups.entries())
                      .map(([k, sids]) => ({
                        key: k,
                        unitId: k.startsWith("__nounit__") ? null : k,
                        sids: sids.slice().sort(compareLearningCode),
                        label: k.startsWith("__nounit__")
                          ? sids[0]
                          : unitLabel[k] ?? "유닛 정보 로딩…",
                      }))
                      .sort((g1, g2) => g1.label.localeCompare(g2.label, "ko", { numeric: true, sensitivity: "base" }));

                    return (
                      <div className="space-y-2">
                        {groupArr.map((g) => {
                          const groupExpandKey = `${userId}::${g.key}`;
                          // 기본값: 펼쳐진 상태 (이전 UI처럼 온라인 학습기록/HO 입력란이 바로 보이도록)
                          const isOpen = expandedGroups[groupExpandKey] ?? true;
                          // 그룹 요약: 인쇄 완료 / 분석 통과 / 단어 통과 카운트
                          let printedCnt = 0, analysisPassCnt = 0, wordPassCnt = 0;
                          g.sids.forEach((sid) => {
                            const a = attemptMap[`${userId}::${sid}`];
                            const stateKey = `${userId}::${sid}`;
                            if (printedSet[stateKey] || a?.printed_at) printedCnt++;
                            if (a?.analysis_passed) analysisPassCnt++;
                            if (a?.word_passed) wordPassCnt++;
                          });
                          return (
                            <div
                              key={g.key}
                              className="rounded-md border border-border overflow-hidden"
                            >
                              {/* 유닛 헤더 (클릭으로 펼치기/접기) */}
                              <button
                                type="button"
                                className="w-full flex items-center gap-2 px-3 py-2 bg-muted/30 hover:bg-muted/60 text-left transition-colors"
                                onClick={() =>
                                  setExpandedGroups((p) => ({
                                    ...p,
                                    [groupExpandKey]: !isOpen,
                                  }))
                                }
                              >
                                <ChevronDown
                                  className={`size-4 text-muted-foreground transition-transform ${isOpen ? "" : "-rotate-90"}`}
                                />
                                <span className="text-sm font-bold text-foreground">
                                  {g.label}
                                </span>
                                <span className="text-[11px] text-muted-foreground">
                                  · 지문 {g.sids.length}개
                                </span>
                                <div className="ml-auto flex items-center gap-1.5 text-[11px]">
                                  <Badge variant="outline" className="h-5 px-1.5">
                                    🖨 {printedCnt}/{g.sids.length}
                                  </Badge>
                                  <Badge variant="outline" className="h-5 px-1.5 text-primary">
                                    분석 {analysisPassCnt}/{g.sids.length}
                                  </Badge>
                                  <Badge variant="outline" className="h-5 px-1.5 text-primary">
                                    단어 {wordPassCnt}/{g.sids.length}
                                  </Badge>
                                </div>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 px-2 ml-1"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handlePrintAll(userId, g.sids, "syntax_unit");
                                  }}
                                  title="이 유닛 구문 전체 인쇄"
                                >
                                  <Printer className="size-3.5" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 px-2"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handlePrintAll(userId, g.sids, "word_unit");
                                  }}
                                  title="이 유닛 단어 전체 인쇄"
                                >
                                  <Printer className="size-3.5" />
                                  <span className="text-[10px] ml-0.5">단어</span>
                                </Button>
                              </button>
                              {g.unitId && (() => {
                                const wfKey = `${userId}::${g.unitId}`;
                                const wf = unitWorkflowMap[wfKey];
                                if (!wf) return null;
                                return (
                                  <div className="px-3 py-2 border-t border-border bg-muted/10 space-y-2">
                                    <div className="flex items-center gap-2 text-xs">
                                      <Badge variant="secondary">
                                        {UNIT_WORKFLOW_LABELS[wf.status]}
                                      </Badge>
                                      {wf.teacher_grade && (
                                        <span className="font-bold">평가 {wf.teacher_grade}</span>
                                      )}
                                    </div>
                                    {wf.status === "workbook_submitted" && (
                                      <div className="flex flex-wrap items-end gap-2">
                                        <div>
                                          <Label className="text-[10px]">등급</Label>
                                          <div className="flex gap-1 mt-0.5">
                                            {(["A", "B", "C", "D", "E"] as TeacherGrade[]).map(
                                              (g) => (
                                                <Button
                                                  key={g}
                                                  type="button"
                                                  size="sm"
                                                  variant={
                                                    unitGradeDraft[wfKey] === g
                                                      ? "default"
                                                      : "outline"
                                                  }
                                                  className="h-7 w-7 p-0"
                                                  onClick={() =>
                                                    setUnitGradeDraft((p) => ({
                                                      ...p,
                                                      [wfKey]: g,
                                                    }))
                                                  }
                                                >
                                                  {g}
                                                </Button>
                                              ),
                                            )}
                                          </div>
                                        </div>
                                        <div className="flex-1 min-w-[160px]">
                                          <Label className="text-[10px]">메모</Label>
                                          <Textarea
                                            className="mt-0.5 min-h-[52px] text-xs"
                                            placeholder="한글해석 첨삭과 같이 메모"
                                            value={unitMemoDraft[wfKey] ?? ""}
                                            onChange={(e) =>
                                              setUnitMemoDraft((p) => ({
                                                ...p,
                                                [wfKey]: e.target.value,
                                              }))
                                            }
                                          />
                                        </div>
                                        <Button
                                          size="sm"
                                          disabled={!!busy[`unit-complete:${wfKey}`]}
                                          onClick={() =>
                                            handleCompleteUnit(userId, g.unitId!)
                                          }
                                        >
                                          학습완료
                                        </Button>
                                      </div>
                                    )}
                                    {wf.status === "completed" && wf.teacher_memo && (
                                      <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                                        {wf.teacher_memo}
                                      </p>
                                    )}
                                  </div>
                                );
                              })()}

                              {/* 펼침 본문: 기존 테이블 그대로 */}
                              {isOpen && (
                                <table className="w-full text-sm">
                                  <thead className="bg-muted/20 text-[11px] text-muted-foreground">
                                    <tr>
                                      <th className="text-left px-3 py-2 font-medium">문장 코드</th>
                                      <th className="text-left px-3 py-2 font-medium">온라인 · 분석+해석</th>
                                      <th className="text-left px-3 py-2 font-medium">온라인 · 단어시험</th>
                                      <th className="text-left px-3 py-2 font-medium">단어 HO</th>
                                      <th className="text-left px-3 py-2 font-medium">구문 HO</th>
                                      <th className="text-right px-3 py-2 font-medium">재시험</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-border">
                                    {g.sids.map((sid) => {
                                      const a = attemptMap[`${userId}::${sid}`];
                                      const wScore =
                                        a?.best_word_score != null
                                          ? Math.round(a.best_word_score * 100)
                                          : null;
                                      const aScore =
                                        a?.best_analysis_rate != null
                                          ? Math.round(a.best_analysis_rate * 100)
                                          : null;
                                      const stateKey = `${userId}::${sid}`;
                                      const printedAt = printedSet[stateKey] ?? a?.printed_at ?? null;
                                      const isPrinted = !!printedAt;
                                      const printKey = `print:${userId}:${sid}`;
                                      const retestKey = `retest:${userId}:${sid}`;
                                      const cachedTrans = translationTextCache[stateKey];
                                      return (
                                        <tr key={sid} className="hover:bg-muted/20 align-middle">
                                          <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">
                                            <div className="flex items-center gap-2">
                                              <span>{sid}</span>
                                              {isPrinted && (
                                                <span className="text-[10px] text-primary inline-flex items-center gap-0.5">
                                                  <Printer className="size-3" />
                                                  {fmtTime(printedAt!)}
                                                </span>
                                              )}
                                            </div>
                                          </td>
                                          {/* 분석+해석 셀 */}
                                          <td className="px-3 py-2 whitespace-nowrap">
                                            {aScore == null && !translationSet[stateKey] ? (
                                              <span className="text-xs text-muted-foreground">—</span>
                                            ) : (
                                              <div className="inline-flex items-center gap-1.5">
                                                <HoverCard openDelay={150} closeDelay={80}>
                                                  <HoverCardTrigger asChild>
                                                    <Link
                                                      to={`/teacher/compare/${encodeURIComponent(sid)}/${userId}`}
                                                      target="_blank"
                                                      title="클릭: 분석 비교 / Hover: 해석 미리보기"
                                                      onMouseEnter={() => prefetchTranslation(userId, sid)}
                                                      onFocus={() => prefetchTranslation(userId, sid)}
                                                      className="inline-flex items-center gap-1 text-xs hover:underline"
                                                    >
                                                      {aScore != null && (
                                                        <>
                                                          <Badge
                                                            className={
                                                              a?.analysis_passed
                                                                ? "h-5 px-1.5 text-[10px] bg-primary text-primary-foreground"
                                                                : "h-5 px-1.5 text-[10px] bg-destructive text-destructive-foreground"
                                                            }
                                                          >
                                                            {a?.analysis_passed ? "P" : "F"}
                                                          </Badge>
                                                          <span className="text-muted-foreground tabular-nums">
                                                            {aScore}%
                                                          </span>
                                                        </>
                                                      )}
                                                      <span className="text-muted-foreground">·</span>
                                                      {translationSet[stateKey] ? (
                                                        <span className="text-primary font-medium">해석✓</span>
                                                      ) : (
                                                        <span className="text-muted-foreground">해석✗</span>
                                                      )}
                                                    </Link>
                                                  </HoverCardTrigger>
                                                  <HoverCardContent
                                                    side="top"
                                                    align="start"
                                                    className="w-80 max-h-72 overflow-y-auto"
                                                  >
                                                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                                                      학생 한글해석
                                                    </p>
                                                    {cachedTrans === undefined ? (
                                                      <p className="text-xs text-muted-foreground">
                                                        불러오는 중…
                                                      </p>
                                                    ) : cachedTrans === null || !cachedTrans.trim() ? (
                                                      <p className="text-xs text-muted-foreground">
                                                        제출된 해석이 없습니다.
                                                      </p>
                                                    ) : (
                                                      <p className="text-sm leading-relaxed whitespace-pre-wrap">
                                                        {cachedTrans}
                                                      </p>
                                                    )}
                                                  </HoverCardContent>
                                                </HoverCard>
                                                <Button
                                                  size="sm"
                                                  variant={isPrinted ? "secondary" : "default"}
                                                  className="h-6 px-1.5"
                                                  disabled={!!busy[printKey]}
                                                  onClick={() => handlePrint(userId, sid)}
                                                  title={isPrinted ? "재인쇄 (분석+해석)" : "인쇄 (분석+해석)"}
                                                >
                                                  <Printer className="size-3" />
                                                </Button>
                                                <Button
                                                  size="sm"
                                                  variant="outline"
                                                  className="h-6 px-1.5"
                                                  title="학생 분석본 인쇄 (채점본)"
                                                  onClick={async () => {
                                                    try {
                                                      const html = await buildAnalysisPrintHtmlFor({
                                                        sentenceId: sid,
                                                        studentId: userId,
                                                        mode: "marked",
                                                      });
                                                      launchPrintHtml(html, {
                                                        jobKey: `lr-analysis:${sid}:${userId}`,
                                                      });
                                                    } catch (e) {
                                                      const msg =
                                                        e instanceof PrintPreloadError
                                                          ? printStageMessage(e.stage)
                                                          : errMsg(e);
                                                      toast({
                                                        title: "분석본 준비 실패",
                                                        description: msg,
                                                        variant: "destructive",
                                                      });
                                                    }
                                                  }}
                                                >
                                                  <FileText className="size-3" />
                                                </Button>
                                              </div>
                                            )}
                                          </td>
                                          {/* 단어시험 셀 */}
                                          <td className="px-3 py-2 whitespace-nowrap">
                                            <div className="inline-flex items-center gap-1.5">
                                              {wScore == null ? (
                                                <span className="text-xs text-muted-foreground">—</span>
                                              ) : (
                                                <span
                                                  className={
                                                    a?.word_passed
                                                      ? "text-primary font-semibold tabular-nums"
                                                      : "text-destructive font-semibold tabular-nums"
                                                  }
                                                >
                                                  {wScore}
                                                </span>
                                              )}
                                              {(() => {
                                                const rc = remediationCountMap[stateKey] ?? 0;
                                                if (rc <= 0) return null;
                                                return (
                                                  <span
                                                    title={`단어시험 오답 4단계 복습 누적 ${rc}회`}
                                                    className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[10px] font-bold px-1.5 py-0.5 leading-none"
                                                  >
                                                    ↻{rc}
                                                  </span>
                                                );
                                              })()}
                                              <button
                                                type="button"
                                                title="단어시험 결과 보기"
                                                className="text-muted-foreground hover:text-primary"
                                                onClick={() => handleViewWordTest(userId, sid)}
                                              >
                                                <Eye className="size-3.5" />
                                              </button>
                                              <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                  <Button
                                                    size="sm"
                                                    variant={isPrinted ? "secondary" : "outline"}
                                                    className="h-6 px-1.5"
                                                    title="단어 핸드아웃 인쇄"
                                                  >
                                                    <Printer className="size-3" />
                                                    <ChevronDown className="size-3 ml-0.5" />
                                                  </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="start">
                                                  <DropdownMenuItem onClick={() => handlePrintWord(userId, sid, "wrong", "ko")}>
                                                    오답 · 한글 채우기
                                                  </DropdownMenuItem>
                                                  <DropdownMenuItem onClick={() => handlePrintWord(userId, sid, "wrong", "en")}>
                                                    오답 · 스펠 채우기
                                                  </DropdownMenuItem>
                                                  <DropdownMenuItem onClick={() => handlePrintWord(userId, sid, "wrong", "mix")}>
                                                    오답 · 혼합
                                                  </DropdownMenuItem>
                                                  <DropdownMenuItem onClick={() => handlePrintWord(userId, sid, "all", "ko")}>
                                                    전체 · 한글 채우기
                                                  </DropdownMenuItem>
                                                  <DropdownMenuItem onClick={() => handlePrintWord(userId, sid, "all", "en")}>
                                                    전체 · 스펠 채우기
                                                  </DropdownMenuItem>
                                                  <DropdownMenuItem onClick={() => handlePrintWord(userId, sid, "all", "mix")}>
                                                    전체 · 혼합
                                                  </DropdownMenuItem>
                                                </DropdownMenuContent>
                                              </DropdownMenu>
                                            </div>
                                          </td>
                                          <td className="px-3 py-2">
                                            <WordHoInput
                                              userId={userId}
                                              teacherId={teacherId}
                                              testDate={date}
                                              sentenceId={sid}
                                              current={handoutMap[`${userId}::${sid}`] ?? null}
                                              onSaved={handleHandoutSaved}
                                              disabled={!isPrinted}
                                            />
                                          </td>
                                          <td className="px-3 py-2">
                                            <SyntaxHoToggle
                                              userId={userId}
                                              teacherId={teacherId}
                                              testDate={date}
                                              sentenceId={sid}
                                              current={handoutMap[`${userId}::${sid}`] ?? null}
                                              onSaved={handleHandoutSaved}
                                              disabled={!isPrinted}
                                            />
                                          </td>
                                          <td className="px-3 py-2">
                                            <div className="flex items-center justify-end gap-1.5">
                                              <Button
                                                size="sm"
                                                variant="secondary"
                                                className="h-7 px-2 text-xs"
                                                disabled={!!busy[retestKey]}
                                                onClick={() => handleRetest(userId, sid)}
                                                title="재시험 등록"
                                              >
                                                <RefreshCcw className="size-3" />
                                              </Button>
                                            </div>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* 보기 다이얼로그 (한글해석 / 단어시험) */}
      <Dialog open={!!viewDialog} onOpenChange={(o) => !o && setViewDialog(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{viewDialog?.title}</DialogTitle>
          </DialogHeader>
          {viewDialog?.body}
        </DialogContent>
      </Dialog>
    </TeacherLayout>
  );
};

export default LearningResults;

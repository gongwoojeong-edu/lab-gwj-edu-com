import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Loader2,
  LogOut,
  Lock,
  Sparkles,
  Check,
  AlertTriangle,
  History,
  RotateCcw,
} from "lucide-react";
import Index from "@/pages/Index";
import { SENTENCES, type Sentence } from "@/data/sentences";
import { signOut, useAuth } from "@/hooks/useAuth";
import { LEVEL_LABEL, type LevelCode } from "@/lib/levels";
import { useLevelLabels } from "@/hooks/useLevelLabels";
import {
  fetchOwnerProgressForSentence,
  fetchSentenceProgress,
  upsertSentenceProgress,
  insertAttemptLog,
  fetchAttemptLogs,
  fetchAttemptCount,
  type AttemptLogRow,
} from "@/integrations/supabase/storage";
import { buildWordTest, type WordTestEntry } from "@/lib/wordTestBuilder";
import { fetchExtraction, extractedToEntries } from "@/lib/wordExtraction";
import { WordPreStep } from "@/components/learning/WordPreStep";
import { TranslationStep } from "@/components/learning/TranslationStep";
import { WordTestStep } from "@/components/learning/WordTestStep";
import { hydrateSentencesFromDb, loadSentenceByCode } from "@/lib/sentenceSource";
import { cn } from "@/lib/utils";
import { useViewMode } from "@/hooks/useViewMode";
import { gradeAnalysis, rateLabel, type OwnerDiffEntry } from "@/lib/analysisGrading";
import { fetchMyProfile, type StudentProfile } from "@/lib/studentProfile";
import { fetchMyOverrideForSentence } from "@/lib/studentPassageOverrides";
import { resolveNextAfterPass } from "@/lib/nextSentence";
import { TeacherAnalysisOverride } from "@/components/learning/TeacherAnalysisOverride";
import { AnalysisSubmitConfirmDialog } from "@/components/learning/AnalysisSubmitConfirmDialog";
import {
  decideTrack,
  fetchOpenRequest,
  createReviewRequest,
  cancelReviewRequest,
  subscribeMyRequest,
  type AnalysisReviewRequest,
} from "@/lib/analysisReview";
import {
  createApprovalRequest,
  fetchLatestApproval,
  subscribeMyApproval,
  applyApprovalToMyProgress,
  type SentenceApproval,
} from "@/lib/sentenceApprovals";
import { ApprovalWaitingPanel } from "@/components/learning/ApprovalWaitingPanel";
import { Eye, Hourglass, ShieldCheck, HelpCircle } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { activeAssignmentDueOrFilter } from "@/lib/assignmentDue";
import { toast } from "@/hooks/use-toast";
import { getCurrentUserId, waitForAuthReady } from "@/lib/authState";

type Step = "pre" | "wordtest" | "analysis" | "translation";

const STEP_LABELS: Record<Step, string> = {
  pre: "1. 단어 학습",
  wordtest: "2. 단어 테스트",
  analysis: "3. 구문 분석",
  translation: "4. 한글 해석",
};

const STEP_ORDER: Step[] = ["pre", "wordtest", "analysis", "translation"];

const SentenceLearn = () => {
  const { sentenceId } = useParams<{ sentenceId: string }>();
  const navigate = useNavigate();
  const { roles } = useAuth();
  const { setMode } = useViewMode();
  const { displayStudent: levelDisplay } = useLevelLabels();
  const isStaff = roles.includes("teacher") || roles.includes("admin");
  const [sentence, setSentence] = useState<Sentence | null>(null);
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<WordTestEntry[]>([]);
  const [preDone, setPreDone] = useState(false);
  const [analysisDone, setAnalysisDone] = useState(false);
  const [translationDone, setTranslationDone] = useState(false);
  const [wordtestDone, setWordtestDone] = useState(false);
  const [wordTestResult, setWordTestResult] = useState<{ passed: boolean; score: number } | null>(null);
  const [step, setStep] = useState<Step>("pre");
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [previousStatus, setPreviousStatus] = useState<"pending" | "pass" | "fail" | "hold">("pending");
  const [showFailIntro, setShowFailIntro] = useState(false);
  const [attemptLogs, setAttemptLogs] = useState<AttemptLogRow[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [hintWrongOwnerIds, setHintWrongOwnerIds] = useState<Set<string>>(new Set());
  const [sessionStartedAt] = useState<string>(() => new Date().toISOString());
  const [translationText, setTranslationText] = useState<string>("");
  const [analysisGrade, setAnalysisGrade] = useState<{ rate: number; passed: boolean; diffs: OwnerDiffEntry[]; hasMaster: boolean } | null>(null);
  const [analysisRate, setAnalysisRate] = useState(0);
  const [analysisHasMaster, setAnalysisHasMaster] = useState(false);
  const [analysisMasterLoaded, setAnalysisMasterLoaded] = useState(false);
  // C — 클라우드 hydrate 실패 시 학생에게 노출할 상태 (무음 실패 방지).
  const [hydrationError, setHydrationError] = useState<string | null>(null);
  const [hydrationReloadNonce, setHydrationReloadNonce] = useState(0);
  /** onAnalysisProgress 콜백 도착 횟수 — Index.tsx의 fetchMasterAnswers 비동기 race를 닫기 위한 카운터.
   * Index.tsx의 progress effect는 masterOwnerIds를 dep으로 가지므로 fetch 완료 후 반드시 한 번 더 호출됨.
   * 따라서 callback ≥ 2회이거나 hasMaster=true가 한 번이라도 관측되면 마스터 정보가 안정된 것으로 간주. */
  const masterCallbackCountRef = useRef(0);
  const [analysisCounts, setAnalysisCounts] = useState<{ filled: number; total: number }>({ filled: 0, total: 0 });
  const [analysisAnalyzableTotal, setAnalysisAnalyzableTotal] = useState(0);
  const [analysisAnalyzedFilled, setAnalysisAnalyzedFilled] = useState(0);
  const [analysisRequiredFilled, setAnalysisRequiredFilled] = useState(false);
  const [skipFlags, setSkipFlags] = useState<{ pre: boolean; analysis: boolean; translation: boolean; wordtest: boolean }>({
    pre: true,
    analysis: true,
    translation: true,
    wordtest: true,
  });
  const ANALYSIS_GATE = 0.6;
  // 학생 프로필 임계값 우선 — 없으면 기본 60%
  const analysisGate = profile?.analysis_pass_threshold ?? ANALYSIS_GATE;
  const canAdvanceToTranslation =
    analysisMasterLoaded && (analysisDone || analysisRate >= analysisGate);
  const testWordResultForFinalSubmit = () => ({
    passed: !skipFlags.wordtest || wordtestDone || wordTestResult?.passed === true,
    score: !skipFlags.wordtest || wordtestDone ? 1 : (wordTestResult?.score ?? 0),
  });

  // 분석 제출 확인 다이얼로그
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);

  // 자기 첨삭 요청 상태
  const [openRequest, setOpenRequest] = useState<AnalysisReviewRequest | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [currentAttemptNo, setCurrentAttemptNo] = useState(1);

  // 한글해석 제출 후 선생님 승인 게이트
  const [pendingApproval, setPendingApproval] = useState<SentenceApproval | null>(null);
  const [submittedTranslation, setSubmittedTranslation] = useState<string>("");

  // 추가학습 요청 (선생님이 redo 등급으로 승인) — 기존 통과 기록은 유지하되 한 번 더 제출
  const [redoRequestedAt, setRedoRequestedAt] = useState<string | null>(null);
  const [redoMemo, setRedoMemo] = useState<string | null>(null);


  // sentence 변경 시 마스터 로드 게이트 리셋 + 800ms 안전망(외부 fetch가 어떤 이유로 늦거나 실패해도 진행 가능)
  useEffect(() => {
    setAnalysisMasterLoaded(false);
    masterCallbackCountRef.current = 0;
    if (!sentenceId) return;
    const t = window.setTimeout(() => setAnalysisMasterLoaded(true), 800);
    return () => window.clearTimeout(t);
  }, [sentenceId]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      // 1) 학생 본인 level만 hydrate (tokens 제외, 가벼운 메타만)
      const prof0 = await fetchMyProfile().catch(() => null);
      const myLevel = (prof0?.current_level ?? prof0?.start_level) as
        | LevelCode
        | undefined;
      await hydrateSentencesFromDb(false, myLevel ? { levels: [myLevel] } : undefined);

      // 2) 현재 sentence 1건은 tokens 포함해 직접 fetch (hydrate 결과를 덮어씀)
      let found = SENTENCES.find((s) => s.id === sentenceId) ?? null;
      if (sentenceId) {
        const one = await loadSentenceByCode(sentenceId).catch(() => null);
        if (one) {
          const idx = SENTENCES.findIndex((s) => s.id === one.id);
          if (idx >= 0) SENTENCES[idx] = { ...SENTENCES[idx], ...one };
          else SENTENCES.push(one);
          found = SENTENCES.find((s) => s.id === sentenceId) ?? one;
        }
      }
      if (!mounted) return;
      setSentence(found);

      if (!found) {
        setLoading(false);
        return;
      }

      // restart=1 쿼리: 진행 플래그 리셋 후 처음부터 시작 (작성 데이터/시도 로그는 보존)
      const restartParam = new URLSearchParams(window.location.search).get("restart") === "1";
      if (restartParam) {
        try {
          await upsertSentenceProgress(found.id, {
            pre_done: false,
            word_test_done: false,
            analysis_done: false,
            translation_done: false,
            status: "pending",
          });
        } catch (e) {
          console.warn("restart reset failed", e);
        }
        // URL에서 restart 제거
        const url = new URL(window.location.href);
        url.searchParams.delete("restart");
        window.history.replaceState({}, "", url.toString());
      }

      const currentUserId = await getCurrentUserId();
      const [prog, extraction, owners, prof, logs, attemptCnt, assignRes, overrideRes] = await Promise.all([
        fetchSentenceProgress(found.id),
        fetchExtraction(found.id),
        fetchOwnerProgressForSentence(found.id),
        fetchMyProfile(),
        fetchAttemptLogs(found.id),
        fetchAttemptCount(found.id),
        // 활성 특별과제 lookup (해당 sentence + 마감 미경과 + 본인 또는 전체 대상) — 가장 임박 1건
        (async () => {
          if (!currentUserId) return null;
          const { data } = await supabase
            .from("assignments")
            .select("include_pre, include_analysis, include_translation, include_wordtest")
            .eq("sentence_id", found.id)
            .or(`student_id.eq.${currentUserId},student_id.is.null`)
            .or(activeAssignmentDueOrFilter(new Date().toISOString()))
            .order("due_at", { ascending: true, nullsFirst: false })
            .limit(1)
            .maybeSingle();
          return data;
        })(),
        // 학생×지문 단위 학습 옵션 오버라이드 (단어학습 스킵 등)
        fetchMyOverrideForSentence(found.id),
      ]);
      if (!mounted) return;
      const nextAttemptNo = attemptCnt + 1;
      setCurrentAttemptNo(nextAttemptNo);
      // 현재 attempt에 대한 미해결 요청(있으면 표시)
      const openReq = await fetchOpenRequest(found.id, nextAttemptNo);
      if (mounted) setOpenRequest(openReq);

      // 한글해석 제출 후 선생님 승인 대기 행 hydrate (pass 전 sentence_progress.status는 pending)
      const latestApproval = await fetchLatestApproval(found.id, currentUserId ?? undefined);
      const progStatus = (prog?.status ?? "pending") as "pending" | "pass" | "fail" | "hold";
      if (mounted && latestApproval?.status === "pending") {
        setPendingApproval(latestApproval);
      } else if (
        mounted &&
        latestApproval?.status === "approved" &&
        latestApproval.grade &&
        latestApproval.grade !== "redo"
      ) {
        // 승인 완료 — progress 동기화 후 다음 문장으로 (pass인데 같은 URL에 머문 경우 포함)
        if (progStatus !== "pass") {
          await applyApprovalToMyProgress(latestApproval);
        }
        const r = await resolveNextAfterPass(found.id);
        if (r.sentence && r.sentence.id !== found.id) {
          navigate(`/learn/sentence/${encodeURIComponent(r.sentence.id)}`);
        } else if (!r.sentence) {
          navigate("/learn");
        }
      }

      // 특별과제의 단계 포함 여부 — 없으면 기본(모두 true)
      // 학생×지문 override (skip_pre)가 켜져 있으면 단어학습(pre)을 OFF로 강제
      const overrideSkipPre = !!overrideRes?.skip_pre;
      const flags = {
        pre: overrideSkipPre ? false : (assignRes ? !!assignRes.include_pre : true),
        analysis: assignRes ? !!assignRes.include_analysis : true,
        translation: assignRes ? !!assignRes.include_translation : true,
        wordtest: assignRes ? !!assignRes.include_wordtest : true,
      };
      setSkipFlags(flags);

      // OFF 단계는 자동으로 done 처리 (DB에도 upsert)
      let preDoneEff = !!prog?.pre_done;
      let analysisDoneEff = !!prog?.analysis_done;
      let translationDoneEff = !!prog?.translation_done;
      const autoPatch: Record<string, boolean> = {};
      if (!flags.pre && !preDoneEff) {
        preDoneEff = true;
        autoPatch.pre_done = true;
      }
      if (!flags.analysis && !analysisDoneEff) {
        analysisDoneEff = true;
        autoPatch.analysis_done = true;
      }
      if (!flags.translation && !translationDoneEff) {
        translationDoneEff = true;
        autoPatch.translation_done = true;
      }
      if (Object.keys(autoPatch).length > 0) {
        try {
          await upsertSentenceProgress(found.id, autoPatch);
        } catch (e) {
          console.warn("auto-skip upsert failed", e);
        }
      }

      setPreDone(preDoneEff);
      setAnalysisDone(analysisDoneEff);
      setTranslationDone(translationDoneEff);
      setProfile(prof);
      setAttemptLogs(logs);
      const status = (prog?.status ?? "pending") as "pending" | "pass" | "fail" | "hold";
      setPreviousStatus(status);
      setRedoRequestedAt((prog as { redo_requested_at?: string | null } | null)?.redo_requested_at ?? null);
      setRedoMemo((prog as { last_redo_memo?: string | null } | null)?.last_redo_memo ?? null);


      // 미통 + 힌트 모드 ON → 직전 시도의 wrong owner_id 추출
      if (status === "fail" && prof?.hint_mode_enabled && logs.length > 0) {
        const latest = logs[0];
        const diffs = (latest.owner_diff as OwnerDiffEntry[]) ?? [];
        setHintWrongOwnerIds(new Set(diffs.map((d) => d.owner_id)));
      }

      // 미통 진입 시 인트로 노출 (보류는 미노출)
      if (status === "fail") {
        setShowFailIntro(true);
      }

      let built: WordTestEntry[] = [];
      if (extraction && extraction.words.length > 0) {
        built = extractedToEntries(extraction.words);
      } else {
        const ownerSurfaces: Record<string, string> = {};
        found.tokens.forEach((t) => {
          if (t.type === "analyzable") ownerSurfaces[t.id] = t.text;
        });
        const progressMap: Record<string, unknown> = {};
        const completed: string[] = [];
        owners.forEach((o) => {
          progressMap[o.owner_id] = o.progress as object;
          if (o.completed) completed.push(o.owner_id);
        });
        built = buildWordTest(
          ownerSurfaces,
          progressMap as Parameters<typeof buildWordTest>[1],
          completed,
        );
      }
      setEntries(built);

      // 초기 step 결정 — 이미 뒤 단계까지 온 학생은 이전 단계로 되돌리지 않음
      const wordTestPassedRow = await supabase
        .from("word_test_results")
        .select("passed, mode")
        .eq("sentence_id", found.id)
        .eq("user_id", currentUserId ?? "")
        .eq("passed", true);
      const passedModes = new Set(((wordTestPassedRow.data ?? []) as { mode: string }[]).map((r) => r.mode));
      const wordtestAllPassed = passedModes.has("spell") && passedModes.has("meaning") && passedModes.has("mixed");

      // 추출된 단어가 없으면 pre/wordtest는 자동 done 처리 → '구문 분석'에서 시작
      const hasWords = built.length > 0;
      const wtEff = !!prog?.word_test_done || wordtestAllPassed || analysisDoneEff || translationDoneEff || !hasWords || !flags.wordtest;
      const preEff = preDoneEff || wtEff || analysisDoneEff || translationDoneEff || !hasWords;
      setPreDone(preEff);
      setWordtestDone(wtEff);

      if (translationDoneEff) setStep("translation");
      else if (analysisDoneEff && flags.translation) setStep("translation");
      else if (!preEff && flags.pre) setStep("pre");
      else if (!wtEff && flags.wordtest) setStep("wordtest");
      else if (!analysisDoneEff && flags.analysis) setStep("analysis");
      else setStep("translation");

      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [sentenceId]);

  // 학생: 본인 요청의 상태 변화(승인/거절/취소) 실시간 수신
  useEffect(() => {
    if (!sentence) return;
    const unsub = subscribeMyRequest(sentence.id, currentAttemptNo, (row) => {
      // 본인 요청만 반영
      setOpenRequest((prev) => {
        if (row.status === "approved" || row.status === "pending") return row;
        if (prev && prev.id === row.id) return null; // rejected/cancelled
        return prev;
      });
      if (row.status === "approved") {
        toast({
          title: "🎉 선생님분석본보기 요청이 승인됐어요",
          description: "선생님 분석본을 열어 확인하세요.",
        });
      }
      if (row.status === "rejected") {
        toast({
          title: "선생님분석본보기 요청이 반려됐어요",
          description: row.response_note ?? "선생님 메시지를 확인하세요.",
          variant: "destructive",
        });
      }
    });
    return unsub;
  }, [sentence, currentAttemptNo]);

  // 한글해석 승인 대기 행 실시간 구독 — 다른 기기/세션에서 승인되면 즉시 진행
  useEffect(() => {
    if (!sentence) return;
    let cancelled = false;
    (async () => {
      const uid = await getCurrentUserId();
      if (!uid || cancelled) return;
      const unsub = subscribeMyApproval(sentence.id, uid, (row) => {
        if (row.status === "pending") {
          setPendingApproval(row);
          return;
        }
        if (row.status === "approved") {
          void advanceAfterApproval(row);
        }
      });
      if (cancelled) unsub();
      else (window as any).__sa_unsub__ = unsub;
    })();
    return () => {
      cancelled = true;
      const u = (window as any).__sa_unsub__;
      if (typeof u === "function") {
        u();
        (window as any).__sa_unsub__ = null;
      }
    };
  }, [sentence, navigate]);

  const stepStates = useMemo(
    () => ({
      pre: { done: preDone, locked: analysisDone || translationDone, skipped: !skipFlags.pre },
      wordtest: { done: wordtestDone, locked: skipFlags.pre && !preDone, skipped: !skipFlags.wordtest },
      analysis: {
        done: analysisDone,
        locked: (skipFlags.pre && !preDone) || (skipFlags.wordtest && !wordtestDone) || translationDone,
        skipped: !skipFlags.analysis,
      },
      translation: {
        done: translationDone,
        locked:
          (skipFlags.pre && !preDone) ||
          (skipFlags.wordtest && !wordtestDone) ||
          (skipFlags.analysis && !analysisDone),
        skipped: !skipFlags.translation,
      },
    }),
    [preDone, wordtestDone, analysisDone, translationDone, skipFlags],
  );

  /** 다음으로 진입 가능한 OFF가 아닌 단계로 자동 점프 */
  const advanceFrom = (current: Step) => {
    const flagOf: Record<Step, boolean> = {
      pre: skipFlags.pre,
      wordtest: skipFlags.wordtest,
      analysis: skipFlags.analysis,
      translation: skipFlags.translation,
    };
    const idx = STEP_ORDER.indexOf(current);
    for (let i = idx + 1; i < STEP_ORDER.length; i++) {
      if (flagOf[STEP_ORDER[i]]) {
        safeSetStep(STEP_ORDER[i]);
        return;
      }
    }
    // 마지막 단계까지 모두 완료 → translation에 머무름
    safeSetStep("translation");
  };

  /** 백워드 전이 차단: 한글해석 제출 후에는 이전 단계 진입 차단 */
  const safeSetStep = (next: Step) => {
    if (translationDone && next !== "translation") {
      setStep("translation");
      return;
    }
    setStep(next);
  };

  /** Word test 종료(PASS/FAIL 무관) → 분석 채점 + attempt log 기록 + status 업데이트 */
  const recordAttempt = async (
    wordTest: { passed: boolean; score: number },
    opts?: { teacherOverride?: boolean },
  ) => {
    if (!sentence) return;
    try {
      // 마스터 미등록 문장은 analysisRate(전체 분석가능 owner 대비 채워진 비율)를 fallback rate로 사용 → 게이트 일관 적용
      const grade = await gradeAnalysis(sentence.id, { fallbackRate: analysisRate });
      const threshold = profile?.analysis_pass_threshold ?? ANALYSIS_GATE;
      const rateOk = grade.rate >= threshold;
      const requiredOk = grade.requiredOwnersFilled;
      // 마스터 미등록 문장은 attempt log에서 분석 통과로 잡지 않는다(가짜 점수 누적 방지).
      // 진행 자체는 proceedToTranslation의 'hold' 분기로 차단 없이 이어짐.
      const naturalAnalysisPassed = grade.hasMaster ? rateOk && requiredOk : false;
      const analysisPassed = opts?.teacherOverride ? true : naturalAnalysisPassed;
      // 단어시험이 OFF인 특별과제 → 단어시험을 자동 PASS 처리
      const wordTestPassed = opts?.teacherOverride ? true : (!skipFlags.wordtest ? true : wordTest.passed);
      const overallPass = analysisPassed && wordTestPassed;
      setAnalysisGrade({ rate: grade.rate, passed: analysisPassed, diffs: grade.diffs, hasMaster: grade.hasMaster });

      // 필수 owner 누락 안내 (학생에게) — override 시에는 생략
      if (!opts?.teacherOverride && grade.hasMaster && !requiredOk) {
        toast({
          title: "주절 S/V·접속절 V 분석이 필요해요",
          description: "정답률이 충분해도 주어/동사·접속절의 동사 분석은 모두 완료되어야 통과합니다.",
          variant: "destructive",
        });
      }

      // 학습 진입 경로 자동 판별 (URL 쿼리 → attempt_source)
      const sp = new URLSearchParams(window.location.search);
      let attemptSource: "regular" | "review" | "assignment" | "test" = "regular";
      if (sp.get("review") === "1" || previousStatus === "pass") attemptSource = "review";
      else if (sp.get("assignment")) attemptSource = "assignment";
      else if (sp.get("test") === "1") attemptSource = "test";

      const attemptCount = await fetchAttemptCount(sentence.id);
      // 마스터 부재 시 owner_diff 맨 앞에 마커를 끼워 후속 재채점/통계 로직에서 식별 가능하게 한다.
      const noMasterMarker = !grade.hasMaster
        ? [{ owner_id: "__no_master__", noMaster: true } as unknown as OwnerDiffEntry]
        : [];
      const teacherMarker = opts?.teacherOverride
        ? [{ owner_id: "__teacher_override__", teacherOverride: true } as unknown as OwnerDiffEntry]
        : [];
      const ownerDiffPayload = [...teacherMarker, ...noMasterMarker, ...grade.diffs];
      // attempt_log.analysis_match_rate는 NOT NULL 컬럼이므로 마스터 부재 시 0으로 기록 (NULL 저장은 스키마 변경 필요 → 별도 작업).
      const attemptRate = grade.hasMaster ? grade.rate : 0;
      await insertAttemptLog({
        sentence_id: sentence.id,
        attempt_no: attemptCount + 1,
        analysis_match_rate: attemptRate,
        analysis_passed: analysisPassed,
        word_test_score: wordTest.score,
        word_test_passed: wordTestPassed,
        owner_diff: ownerDiffPayload,
        translation_text: translationText || null,
        started_at: sessionStartedAt,
        completed_at: new Date().toISOString(),
        attempt_source: attemptSource,
      });

      // 복습(이미 PASS한 sentence) 진입 시 status를 fail로 덮어쓰지 않음 — attempt만 누적
      // 또한 한글해석 제출 직전에 이미 PASS 처리된 경우(translation onSubmitted)도 동일하게 보호
      const existingProg = await fetchSentenceProgress(sentence.id);
      const alreadyPass = previousStatus === "pass" || existingProg?.status === "pass";
      if (alreadyPass && !overallPass) {
        // 복습 실패: status 유지(PASS), word_test_done만 갱신
        await upsertSentenceProgress(sentence.id, {
          word_test_done: wordTestPassed,
        });
      } else {
        const nextStatus: "pass" | "fail" = overallPass ? "pass" : "fail";
        // 마스터 부재 시 sentence_progress.analysis_match_rate는 건드리지 않음
        // (proceedToTranslation에서 status='hold' + match_rate=NULL로 최종 정리됨).
        await upsertSentenceProgress(sentence.id, {
          word_test_done: wordTestPassed,
          ...(analysisPassed || opts?.teacherOverride ? { analysis_done: true } : {}),
          ...(grade.hasMaster ? { analysis_match_rate: grade.rate } : {}),
          status: nextStatus,
          passed_at: nextStatus === "pass" ? new Date().toISOString() : null,
        });
      }

      if (opts?.teacherOverride) {
        setPreviousStatus("pass");
      }
    } catch (e) {
      console.error("attempt log failed", e);
      toast({ title: "기록 저장 실패", description: String(e), variant: "destructive" });
    }
  };

  const handleSkipToNext = async (fromSentenceId?: string) => {
    const sid = fromSentenceId ?? sentence?.id;
    if (!sid) {
      navigate("/learn");
      return;
    }
    const r = await resolveNextAfterPass(sid);
    if (r.sentence) {
      navigate(`/learn/sentence/${encodeURIComponent(r.sentence.id)}`);
    } else {
      navigate("/learn");
    }
  };

  const advanceAfterApproval = async (approval: SentenceApproval) => {
    setPendingApproval(null);
    if (approval.grade === "redo") {
      setRedoRequestedAt(new Date().toISOString());
      setRedoMemo(approval.memo);
      toast({
        title: "선생님 추가학습 요청",
        description: approval.memo ?? "한 번 더 제출해 주세요.",
      });
      return;
    }
    try {
      await applyApprovalToMyProgress(approval);
      setPreviousStatus("pass");
      toast({
        title: "✅ 선생님이 승인했어요",
        description: "다음 문장으로 이동합니다",
      });
      await handleSkipToNext(approval.sentence_id);
    } catch (e) {
      toast({
        title: "다음 문장 이동 실패",
        description: String(e),
        variant: "destructive",
      });
    }
  };

  const startRetryNow = () => {
    setShowFailIntro(false);
    // 새 흐름: 미통 재도전 시 단어테스트부터 다시 (단어학습은 이미 했음)
    if (skipFlags.wordtest) {
      setWordtestDone(false);
      setStep("wordtest");
    } else if (skipFlags.analysis) {
      setStep("analysis");
    } else {
      setStep("translation");
    }
  };

  /** 분석 → translation 전환 (다이얼로그 confirm 시) */
  const proceedToTranslation = async () => {
    if (!sentence) return;
    // ⚡ 낙관적 진입: 학생 화면을 즉시 한글해석으로 전환한다.
    // 저장(upsertSentenceProgress)은 백그라운드에서 fire-and-forget으로 처리.
    // 이렇게 하지 않으면 네트워크가 한 번이라도 지연될 때 학생이 다이얼로그/로딩에 갇힘.
    const sid = sentence.id;
    const sentenceHasMaster = analysisHasMaster;
    const rateForSave = analysisRate;

    setWordtestDone(true);
    setAnalysisDone(true);
    advanceFrom("analysis");

    // 마스터키 없을 때만 안내 토스트(차단 아님)
    if (!sentenceHasMaster) {
      toast({
        title: "선생님 채점 대기 중",
        description: "정답 등록 후 자동 채점됩니다. 한글 해석을 계속 진행하세요.",
      });
    }

    // 저장은 백그라운드 — 실패해도 학생 진행은 막지 않는다.
    void (async () => {
      try {
        if (sentenceHasMaster) {
          await upsertSentenceProgress(sid, {
            word_test_done: true,
            analysis_done: true,
            analysis_match_rate: rateForSave,
          });
        } else {
          await upsertSentenceProgress(sid, {
            word_test_done: true,
            analysis_done: true,
            analysis_match_rate: null,
            status: "hold",
          });
        }
      } catch (e) {
        console.warn("[proceedToTranslation] background save failed", e);
        // 분석 본문 자체는 owner_progress에 이미 저장됨 → 단순 진행 플래그 저장만 실패한 상황.
        // 잠시 후 다음 자동저장 사이클이나 다음 단계 완료 시점에 다시 기록됨.
        toast({
          title: "진행 상태 저장이 잠시 지연됐어요",
          description: "한글 해석은 그대로 진행하셔도 됩니다. 곧 자동으로 다시 저장됩니다.",
        });
      }
    })();
  };

  /** 자기 첨삭 요청 생성 */
  const requestAnalysisReview = async () => {
    if (!sentence || requesting) return;
    setRequesting(true);
    try {
      const grade = await gradeAnalysis(sentence.id, { fallbackRate: analysisRate });
      const track = decideTrack({
        rate: grade.rate,
        requiredFilled: grade.requiredOwnersFilled,
        sentenceStatus: previousStatus,
      });
      if (!track) {
        toast({
          title: "요청을 보낼 수 없어요",
          description: "분석률 30% 이상이면 요청할 수 있어요.",
          variant: "destructive",
        });
        return;
      }
      const row = await createReviewRequest({
        sentence_id: sentence.id,
        attempt_no: currentAttemptNo,
        analysis_rate: grade.rate,
        required_filled: grade.requiredOwnersFilled,
        track,
      });
      setOpenRequest(row);
      toast({
        title: "요청을 보냈어요",
        description: `선생님 승인 대기 중 · ${track === "fail_assist" ? "미통 보조" : "정상"} 트랙`,
      });
    } catch (e) {
      const msg = String(e);
      toast({
        title: "요청 실패",
        description: msg.includes("uq_arr_open_per_attempt")
          ? "이미 진행 중인 요청이 있어요."
          : msg,
        variant: "destructive",
      });
    } finally {
      setRequesting(false);
    }
  };

  /** 본인 요청 취소 */
  const cancelMyRequest = async () => {
    if (!openRequest) return;
    try {
      await cancelReviewRequest(openRequest.id);
      setOpenRequest(null);
      toast({ title: "요청을 취소했어요" });
    } catch (e) {
      toast({ title: "취소 실패", description: String(e), variant: "destructive" });
    }
  };

  /** 5-state 요청 버튼 렌더 */
  const renderReviewRequestButton = () => {
    if (!sentence) return null;
    const hasMaster = analysisGrade?.hasMaster ?? analysisHasMaster;
    if (openRequest?.status === "approved") {
      return (
        <Button
          size="sm"
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
          onClick={() => navigate(`/learn/compare/${encodeURIComponent(sentence.id)}`)}
        >
          <Eye className="w-4 h-4 mr-1" /> 정답 확인
        </Button>
      );
    }
    if (openRequest?.status === "pending") {
      return (
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300 text-xs font-bold">
            <Hourglass className="w-3 h-3 animate-pulse" /> 승인 대기 중
            {openRequest.track === "fail_assist" && " · 미통 보조"}
          </span>
          <Button size="sm" variant="ghost" className="text-xs" onClick={cancelMyRequest}>
            취소
          </Button>
        </div>
      );
    }
    const rate = analysisGrade?.rate ?? analysisRate;
    const required = analysisGrade
      ? !analysisGrade.diffs.some((d) => d.status === "missing")
      : analysisRequiredFilled;
    const label = rateLabel(hasMaster);
    if (rate < analysisGate) {
      return (
        <Button size="sm" disabled variant="outline" className="text-xs">
          <Lock className="w-3 h-3 mr-1" /> 선생님분석본보기요청 ({label} {Math.round(rate * 100)}%)
        </Button>
      );
    }
    // 마스터 없음 → 30% 이상이면 normal 트랙으로 요청 가능
    if (!hasMaster) {
      return (
        <Button size="sm" onClick={requestAnalysisReview} disabled={requesting}>
          <ShieldCheck className="w-4 h-4 mr-1" /> 선생님분석본보기요청 ({label} {Math.round(rate * 100)}%)
        </Button>
      );
    }
    if (rate >= analysisGate && required) {
      return (
        <Button size="sm" onClick={requestAnalysisReview} disabled={requesting}>
          <ShieldCheck className="w-4 h-4 mr-1" /> 선생님분석본보기요청
        </Button>
      );
    }
    if (previousStatus === "fail" && rate >= 0.5) {
      return (
        <Button
          size="sm"
          variant="outline"
          className="border-amber-500 text-amber-700 hover:bg-amber-500/10 dark:text-amber-300"
          onClick={requestAnalysisReview}
          disabled={requesting}
        >
          🆘 선생님분석본보기요청 (미통 보조)
        </Button>
      );
    }
    return (
      <Button size="sm" disabled variant="outline" className="text-xs" title={`${Math.round(analysisGate * 100)}% 이상 또는 미통 후 요청 가능`}>
        <HelpCircle className="w-3 h-3 mr-1" /> 선생님분석본보기요청 ({Math.round(analysisGate * 100)}% 이상 또는 미통 후)
      </Button>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!sentence) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center bg-background">
        <Card className="p-8 space-y-4 max-w-md">
          <div className="text-xl font-bold text-foreground">Passage를 찾을 수 없어요</div>
          <Button onClick={() => navigate("/learn")}>학습 홈으로</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-secondary/30">
      <header className="sticky top-0 z-30 backdrop-blur-md bg-background/70 border-b border-border">
        <div className="max-w-5xl mx-auto px-5 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Button variant="ghost" size="sm" onClick={() => navigate("/learn")} className="shrink-0">
              <ArrowLeft className="w-4 h-4 mr-1" />
              <span className="hidden sm:inline">홈</span>
            </Button>
            <div className="min-w-0 flex-1">
              <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                {levelDisplay(sentence.level)} · {sentence.id}
                {previousStatus === "fail" && (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[10px] font-bold">
                    미통
                  </span>
                )}
                {previousStatus === "pass" && (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">
                    PASS
                  </span>
                )}
                {previousStatus === "hold" && (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-[10px] font-bold">
                    보류
                  </span>
                )}
              </div>
              <div className="text-sm font-bold text-foreground truncate max-w-[38vw] sm:max-w-[42vw]">
                {sentence.english}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isStaff && (
              <button
                type="button"
                onClick={() => {
                  setMode("teacher");
                  navigate("/teacher");
                }}
                className="text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline whitespace-nowrap"
              >
                선생님 화면
              </button>
            )}
            <Button variant="ghost" size="sm" onClick={() => signOut()}>
              <LogOut className="w-4 h-4 mr-1" />
              <span className="hidden sm:inline">로그아웃</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-6 space-y-5">
        {/* 선생님 추가학습 요청 배너 — 기존 통과 기록은 유지된 채 한 번 더 제출 */}
        {redoRequestedAt && previousStatus === "pass" && (
          <Card className="p-5 space-y-3 border-2 border-violet-500/40 bg-violet-50/40 dark:bg-violet-500/5">
            <div className="flex items-start gap-3">
              <RotateCcw className="w-6 h-6 text-violet-600 dark:text-violet-400 mt-0.5 shrink-0" />
              <div className="space-y-1">
                <div className="text-base font-extrabold text-foreground">선생님 추가학습 요청</div>
                <div className="text-sm text-muted-foreground">
                  기존 통과 기록은 그대로 유지돼요. 한 번 더 한글 해석을 작성해 제출해 주세요.
                </div>
                {redoMemo && (
                  <div className="mt-2 text-sm rounded-md bg-background/60 border border-violet-500/20 px-3 py-2 text-foreground whitespace-pre-wrap">
                    💬 {redoMemo}
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="default"
                onClick={() => {
                  setTranslationDone(false);
                  setStep("translation");
                }}
              >
                추가학습 시작 — 한글 해석 다시 제출
              </Button>
            </div>
          </Card>
        )}

        {/* 미통 재진입 인트로 */}

        {showFailIntro && (
          <Card className="p-5 space-y-4 border-2 border-amber-500/40 bg-amber-50/30 dark:bg-amber-500/5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <div className="space-y-1">
                <div className="text-base font-extrabold text-foreground">
                  이 지문은 아직 통과하지 못했어요
                </div>
                <div className="text-sm text-muted-foreground">
                  지난 시도 {attemptLogs.length}회의 기록이 누적되어 있어요. 다시 도전하거나 이전 기록을 살펴보세요.
                  {profile?.hint_mode_enabled && (
                    <span className="block mt-1 text-amber-700 dark:text-amber-300 font-semibold">
                      💡 힌트 모드 ON: 지난번 틀린 부분을 살짝 강조해 드릴게요.
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 justify-end">
              <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <History className="w-4 h-4 mr-1" /> 이전 기록 보기
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>학습 기록 ({attemptLogs.length}회)</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                    {attemptLogs.length === 0 ? (
                      <div className="text-sm text-muted-foreground py-6 text-center">
                        아직 기록이 없어요.
                      </div>
                    ) : (
                      attemptLogs.map((log, i) => {
                        const overallPass = log.analysis_passed && log.word_test_passed;
                        const diffCount = (log.owner_diff as OwnerDiffEntry[])?.length ?? 0;
                        return (
                          <div
                            key={log.id}
                            className={cn(
                              "p-3 rounded-lg border-2 space-y-1",
                              overallPass
                                ? "border-emerald-500/40 bg-emerald-50/30 dark:bg-emerald-500/5"
                                : "border-amber-500/40 bg-amber-50/30 dark:bg-amber-500/5",
                            )}
                          >
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-bold">{attemptLogs.length - i}차 시도</span>
                              <span className="text-muted-foreground">
                                {new Date(log.completed_at).toLocaleString("ko-KR", {
                                  month: "2-digit",
                                  day: "2-digit",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-xs">
                              <span
                                className={cn(
                                  "px-2 py-0.5 rounded-full font-extrabold",
                                  overallPass
                                    ? "bg-emerald-500 text-white"
                                    : "bg-amber-500 text-white",
                                )}
                              >
                                {overallPass ? "PASS" : "TRY AGAIN"}
                              </span>
                              <span className="text-muted-foreground">
                                분석 {Math.round(Number(log.analysis_match_rate) * 100)}%
                                {" · "}
                                단어 {Math.round(Number(log.word_test_score) * 100)}%
                                {diffCount > 0 && ` · 틀린 owner ${diffCount}개`}
                              </span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </DialogContent>
              </Dialog>
              <Button size="sm" onClick={startRetryNow}>
                <RotateCcw className="w-4 h-4 mr-1" /> 다시 도전하기
              </Button>
            </div>
          </Card>
        )}

        {/* Step tabs */}
        <div className="flex gap-2">
          {(Object.keys(STEP_LABELS) as Step[]).map((k) => {
            const s = stepStates[k];
            const active = step === k;
            const disabled = s.locked || s.skipped;
            return (
              <button
                key={k}
                onClick={() => !disabled && safeSetStep(k)}
                disabled={disabled}
                className={cn(
                  "flex-1 px-3 py-2.5 rounded-lg border-2 text-xs font-bold transition-all",
                  active
                    ? "border-primary bg-primary text-primary-foreground shadow"
                    : s.skipped
                      ? "border-dashed border-border bg-muted/40 text-muted-foreground cursor-not-allowed opacity-60"
                      : s.done
                        ? "border-primary/40 bg-primary/5 text-primary"
                        : s.locked
                          ? "border-border bg-muted text-muted-foreground cursor-not-allowed opacity-70"
                          : "border-border bg-card text-foreground hover:border-primary/40",
                )}
              >
                <div className="flex items-center justify-center gap-1.5">
                  {s.skipped ? (
                    <span className="text-[10px] font-extrabold opacity-80">스킵</span>
                  ) : s.locked ? (
                    <Lock className="w-3 h-3" />
                  ) : null}
                  {STEP_LABELS[k]}
                </div>
              </button>
            );
          })}
        </div>

        {/* Step content */}
        {step === "pre" && (
          entries.length === 0 ? (
            <Card className="p-6 space-y-3 border-primary/30 bg-gradient-to-br from-primary/5 to-accent/5">
              <div className="flex items-center gap-2 text-primary">
                <Sparkles className="w-4 h-4" />
                <div className="text-sm font-bold">아직 단어가 준비되지 않았어요</div>
              </div>
              <p className="text-sm text-foreground/80">
                선생님이 이 Passage의 단어 추출을 아직 하지 않았어요. 잠시 후 다시 시도해 주세요.
              </p>
              <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
                새로고침
              </Button>
            </Card>
          ) : (
            <WordPreStep
              sentenceId={sentence.id}
              entries={entries}
              onCompleted={async () => {
                setPreDone(true);
                try {
                  await upsertSentenceProgress(sentence.id, { pre_done: true });
                } catch (e) {
                  toast({
                    title: "진행 저장 실패",
                    description: String(e),
                    variant: "destructive",
                  });
                }
                advanceFrom("pre");
              }}
            />
          )
        )}

        {step === "analysis" && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2 px-1">
                <div className="text-xs font-bold text-primary uppercase tracking-wider">
                  구문 분석
                </div>
                {analysisDone && (
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                    <Check className="w-3.5 h-3.5" /> 분석 완료
                  </span>
                )}
              </div>
              {hydrationError && (
                <div
                  role="alert"
                  className="rounded-xl border-2 border-amber-400 bg-amber-50 dark:bg-amber-950/40 px-3 py-2.5 flex items-center justify-between gap-3 flex-wrap"
                >
                  <div className="flex items-start gap-2 text-sm text-amber-900 dark:text-amber-100">
                    <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="font-bold">{hydrationError}</div>
                      <div className="text-xs opacity-80 mt-0.5">
                        잠시 후 [다시 불러오기]를 눌러주세요. 작성한 분석은 클라우드에 안전하게 저장되어 있어요.
                      </div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-amber-500 text-amber-900 dark:text-amber-100 hover:bg-amber-100 dark:hover:bg-amber-900/40"
                    onClick={() => {
                      setHydrationError(null);
                      setHydrationReloadNonce((n) => n + 1);
                      toast({ title: "분석 데이터를 다시 불러옵니다…" });
                    }}
                  >
                    <RotateCcw className="w-3.5 h-3.5 mr-1" /> 다시 불러오기
                  </Button>
                </div>
              )}
              <div className="rounded-2xl border border-border/60 bg-card/40 overflow-hidden">
                <Index
                  embedMode
                  studentMode={true}
                  embedSentenceId={sentence.id}
                  reloadNonce={hydrationReloadNonce}
                  onHydrationError={(info) => {
                    setHydrationError(info.message);
                    toast({
                      title: info.message,
                      description: "'다시 불러오기' 버튼을 눌러 재시도해주세요.",
                      variant: "destructive",
                    });
                  }}
                  onAnalysisDone={() => setAnalysisDone(true)}
                  onAnalysisProgress={(rate, meta) => {
                    setAnalysisRate(rate);
                    setAnalysisHasMaster(meta.hasMaster);
                    setAnalysisCounts({ filled: meta.filled, total: meta.total });
                    // 마스터 정보 안정 판정: hasMaster=true가 한 번이라도 관측되거나, 콜백이 2회 이상 도착하면 잠금 해제.
                    // (Index.tsx의 progress effect는 masterOwnerIds를 dep으로 가지므로 fetch 완료 후 반드시 한 번 더 호출됨.)
                    masterCallbackCountRef.current += 1;
                    if (meta.hasMaster || masterCallbackCountRef.current >= 2) {
                      setAnalysisMasterLoaded(true);
                    }
                    // hydrate 성공 시 자동으로 배너 정리
                    if (hydrationError) setHydrationError(null);
                  }}
                  hintWrongOwnerIds={hintWrongOwnerIds.size > 0 ? hintWrongOwnerIds : undefined}
                />
              </div>
            </div>

            <Card className="p-4 border-primary/40 bg-primary/5 flex items-center justify-between gap-3 flex-wrap">
              <div className="text-sm text-foreground">
                {!analysisMasterLoaded
                  ? "정답 정보를 불러오는 중…"
                  : canAdvanceToTranslation
                    ? analysisHasMaster
                      ? "분석을 충분히 진행했어요. 한글 해석으로 넘어가세요."
                      : "분석을 30% 이상 완료했어요. 선생님 정답 등록 후 자동 채점됩니다."
                    : `분석을 30% 이상 완료하면 한글 해석으로 넘어갈 수 있어요. (${Math.round(analysisRate * 100)}% · ${analysisCounts.filled}/${analysisCounts.total})`}
              </div>
              <div className="flex items-center gap-2">
                <TeacherAnalysisOverride
                  label="선생님 확인 후 분석 스킵"
                  description="의문점이나 오류가 있을 때 선생님 PIN을 확인하면 분석 단계를 스킵하고 한글 해석으로 넘어갑니다."
                  onApproved={async () => {
                    try {
                      await upsertSentenceProgress(sentence.id, {
                        word_test_done: true,
                        analysis_done: true,
                        analysis_match_rate: Math.max(analysisRate, 1),
                      });
                    } catch (e) {
                      toast({ title: "진행 저장 실패", description: String(e), variant: "destructive" });
                    }
                    setAnalysisRate(1);
                    setWordtestDone(true);
                    setAnalysisDone(true);
                    advanceFrom("analysis");
                  }}
                />
                <Button
                  size="sm"
                  disabled={!canAdvanceToTranslation}
                  onClick={() => setSubmitDialogOpen(true)}
                >
                  한글 해석 →
                </Button>
              </div>
            </Card>
          </div>
        )}

        <AnalysisSubmitConfirmDialog
          open={submitDialogOpen}
          onOpenChange={setSubmitDialogOpen}
          sentenceId={sentence.id}
          currentStatus={previousStatus}
          onConfirmSubmit={proceedToTranslation}
          wordAnalysisRate={analysisRate}
        />

        {step === "wordtest" && skipFlags.wordtest && (
          <WordTestStep
            sentenceId={sentence.id}
            entries={entries}
            onPassed={async () => {
              // 3종 모두 통과 → 단어테스트 완료를 즉시 DB에 저장 (선생님 화면 실시간 반영)
              setWordtestDone(true);
              try {
                await upsertSentenceProgress(sentence.id, { word_test_done: true });
              } catch (e) {
                console.warn("word_test_done upsert failed", e);
              }
              advanceFrom("wordtest");
            }}
            onTestCompleted={(r) => {
              // 단어테스트 결과는 state에 저장만, attempt log는 한글해석 제출 시 일괄 기록
              setWordTestResult({ passed: r.passed, score: r.score });
            }}
            onSkipToNext={handleSkipToNext}
          />
        )}

        {step === "wordtest" && !skipFlags.wordtest && (
          <Card className="p-6 space-y-4 border-primary/30 bg-primary/5 text-center">
            <div className="text-sm font-bold text-primary">단어시험 단계가 비활성화된 과제예요</div>
            <p className="text-xs text-muted-foreground">
              선생님이 이 과제에서 단어시험 단계를 빼셨어요. 자동으로 통과 처리됩니다.
            </p>
            <div className="flex items-center justify-center gap-2">
              <Button
                size="sm"
                onClick={() => {
                  setWordtestDone(true);
                  setWordTestResult({ passed: true, score: 1 });
                  advanceFrom("wordtest");
                }}
              >
                다음 단계로 →
              </Button>
            </div>
          </Card>
        )}

        {step === "translation" && pendingApproval && (
          <ApprovalWaitingPanel studentTranslation={submittedTranslation || null} />
        )}


        {step === "translation" && !pendingApproval && (
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground px-1">
              ⚠ 이 단계에서는 이전 단계로 돌아갈 수 없어요. 원문을 보고 직접 해석을 작성하세요.
            </div>
            <TranslationStep
              sentenceId={sentence.id}
              englishSentence={sentence.english}
              onSubmitted={async (submittedText) => {
                try {
                  // 정책 변경: 한글해석 제출 = 모든 단계 학습 완료지만,
                  // status=pass 확정은 '선생님 승인 + 평가 등급 입력' 후로 미룬다.
                  // 따라서 여기서는 단계 플래그만 true 로 두고 status 는 pending 유지.
                  await upsertSentenceProgress(sentence.id, {
                    translation_done: true,
                    analysis_done: true,
                    word_test_done: true,
                  });
                  setTranslationDone(true);
                  await recordAttempt(testWordResultForFinalSubmit());

                  // 선생님 승인 요청 행 생성 (이미 pending 이면 재사용)
                  const ap = await createApprovalRequest(sentence.id);
                  setSubmittedTranslation(submittedText);
                  setPendingApproval(ap);
                } catch (e) {
                  toast({
                    title: "저장 실패",
                    description: String(e),
                    variant: "destructive",
                  });
                }
              }}
            />
          </div>
        )}

        {/* 분석 게이트에 막혀 PASS 처리되지 않은 경우 — 자기 첨삭 요청 + 선생님 PIN 통과 */}
        {/* 분석 단계(analysis)에서만 노출 — 단어시험 완료 화면(post)에선 숨김 */}
        {step === "analysis" && analysisGrade && !analysisGrade.passed && (
          <Card className="p-4 border-2 border-amber-500/40 bg-amber-50/30 dark:bg-amber-500/5 space-y-3">
            <div className="text-sm text-foreground">
              <div className="font-bold">분석 결과에 의문점이 있나요?</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                분석 일치율 {Math.round(analysisGrade.rate * 100)}% · 선생님분석본보기 요청을 보내거나 선생님 PIN으로 즉시 통과할 수 있어요.
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 flex-wrap">
              {renderReviewRequestButton()}
              <TeacherAnalysisOverride
                label="선생님 확인 후 통과"
                description="분석 결과에 의문점이 있을 때 선생님 PIN을 확인하면 이 지문이 PASS 처리됩니다."
                variant="outline"
                className="text-xs"
                onApproved={async () => {
                  await recordAttempt(testWordResultForFinalSubmit(), { teacherOverride: true });
                  navigate("/learn");
                }}
              />
            </div>
          </Card>
        )}

        {/* 분석 채점 결과 (선생님/관리자에게만 보임) */}
        {analysisGrade && isStaff && (
          <Card className="p-3 border-dashed border-muted-foreground/30 bg-muted/20 text-xs text-muted-foreground">
            <span className="font-bold text-foreground">[스태프 전용]</span> 분석 일치율{" "}
            <span className="font-mono font-bold">{Math.round(analysisGrade.rate * 100)}%</span>
            {" · "}
            {analysisGrade.passed ? "분석 PASS" : "분석 TRY AGAIN"}
            {" · "}
            틀린 owner {analysisGrade.diffs.length}개
          </Card>
        )}
      </main>
    </div>
  );
};

export default SentenceLearn;

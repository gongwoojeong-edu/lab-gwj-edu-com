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
import { ensureHandoutRow, toIsoDate, type HandoutResult } from "@/lib/handoutResults";
import WordHoInput from "@/components/teacher/WordHoInput";
import SyntaxHoToggle from "@/components/teacher/SyntaxHoToggle";
import { WorkbookModeToggle } from "@/components/teacher/WorkbookModeToggle";
import { subscribeToPrintRequests } from "@/lib/printRequests";
import { launchPrintHtml, launchPrintHtmlMany, prewarmPrintDocument } from "@/lib/printLauncher";
import {
  buildHandoutPrintHtmlFor,
  buildWordPrintHtmlFor,
  printStageMessage,
  PrintPreloadError,
} from "@/lib/printPreload";
import { errMsg } from "@/lib/errMsg";
import { buildUnitWorkbookHtmlFor } from "@/lib/unitWorkbook";
import { toast } from "@/hooks/use-toast";

interface StudentInfo {
  user_id: string;
  display_name: string | null;
  student_no: string;
  unit_workbook_mode: "unit_only" | "both";
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
  // 한글해석 / 단어시험 보기 다이얼로그
  const [viewDialog, setViewDialog] = useState<{
    kind: "translation" | "wordTest";
    title: string;
    body: React.ReactNode;
  } | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setTeacherId(data.user?.id ?? null));
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
      const addPair = (uid: string | null | undefined, sid: string | null | undefined) => {
        if (!uid || !sid) return;
        // 합성 remediation sid 는 별도 카드로 띄우지 않고 카운트만 잡는다
        if (isRemediationSid(sid)) {
          noteRemediation(uid, sid);
          return;
        }
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
      const tSet: Record<string, boolean> = {};
      ((translationsRes.data ?? []) as Array<{ user_id: string; sentence_id: string }>).forEach(
        (r) => {
          addPair(r.user_id, r.sentence_id);
          if (!isRemediationSid(r.sentence_id)) {
            tSet[`${r.user_id}::${r.sentence_id}`] = true;
          }
        },
      );
      ((wordTestRes.data ?? []) as Array<{ user_id: string; sentence_id: string }>).forEach(
        (r) => addPair(r.user_id, r.sentence_id),
      );
      ((wordPreRes.data ?? []) as Array<{ user_id: string; sentence_id: string }>).forEach(
        (r) => addPair(r.user_id, r.sentence_id),
      );
      // sentence_progress 도 짝 추가 — attempt_log 미생성 케이스(예: 분석만 끝나고 단어시험 전)도 표에 노출
      const progressRows = (progressRes.data ?? []) as Array<{
        user_id: string;
        sentence_id: string;
        analysis_done: boolean;
        analysis_match_rate: number | null;
        translation_done: boolean;
        word_test_done: boolean;
      }>;
      progressRows.forEach((r) => {
        addPair(r.user_id, r.sentence_id);
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
          .select("user_id, display_name, student_no, unit_workbook_mode")
          .in("user_id", allUserIds);
        (sp ?? []).forEach((s) => {
          const row = s as { user_id: string; display_name: string | null; student_no: string; unit_workbook_mode: string | null };
          sMap[row.user_id] = {
            user_id: row.user_id,
            display_name: row.display_name,
            student_no: row.student_no,
            unit_workbook_mode: row.unit_workbook_mode === "unit_only" ? "unit_only" : "both",
          };
        });
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

      // 학생별 sentence_id 정렬 목록
      const ssMap: Record<string, string[]> = {};
      pairs.forEach((set, uid) => {
        ssMap[uid] = Array.from(set).sort();
      });
      setStudentSentences(ssMap);
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
      const { data: u } = await supabase.auth.getUser();
      supabase
        .from("print_requests")
        .insert({
          user_id: userId,
          sentence_id: sentenceId,
          teacher_id: u.user?.id ?? null,
          status: "printed",
          handled_at: nowIso,
          handled_by: u.user?.id ?? null,
          note: "teacher-print",
        })
        .then(({ error }) => {
          if (error) console.warn("[LearningResults] print_requests insert skipped", error);
        });
      const row = await ensureHandoutRow(
        userId,
        u.user?.id ?? null,
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
      // 1) sentence_progress.status='retest' (학생 홈 RetestBanner용)
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
      // 2) assignments 에 [재시험] 행 insert (학생 홈 특별과제로 노출)
      const { data: u } = await supabase.auth.getUser();
      if (u.user?.id) {
        const due = new Date();
        due.setDate(due.getDate() + 1);
        await supabase.from("assignments").insert({
          teacher_id: u.user.id,
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

  const handlePrintAll = async (userId: string, sentenceIds: string[]) => {
    // 직렬 인쇄 큐 — 한 건씩 OS 인쇄창이 순차로 뜸 (화면전환 없음)
    try {
      const htmls = await Promise.all(
        sentenceIds.map((sid) =>
          buildHandoutPrintHtmlFor({ sentenceId: sid, studentId: userId }),
        ),
      );
      launchPrintHtmlMany(htmls, { jobKey: `printAll:${userId}` }).catch((e) =>
        console.warn("[LearningResults] launchPrintHtmlMany failed", e),
      );
      toast({ title: `${sentenceIds.length}개 인쇄창이 순차로 열립니다` });
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
      const { data: u } = await supabase.auth.getUser();
      // print_requests insert 실패는 사용자에게 노출하지 않음 (인쇄 자체는 성공)
      supabase
        .from("print_requests")
        .insert({
          user_id: userId,
          sentence_id: sentenceId,
          teacher_id: u.user?.id ?? null,
          status: "printed",
          handled_at: nowIso,
          handled_by: u.user?.id ?? null,
          note: `teacher-print-word-${scope}`,
        })
        .then(({ error }) => {
          if (error) console.warn("[LearningResults] word print_requests insert skipped", error);
        });
      const row = await ensureHandoutRow(
        userId,
        u.user?.id ?? null,
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
                    {s && (
                      <div className="ml-2">
                        <WorkbookModeToggle
                          userId={s.user_id}
                          value={s.unit_workbook_mode}
                          studentLabel={s.display_name ?? s.student_no}
                          onChange={(m) =>
                            setStudents((prev) => ({
                              ...prev,
                              [s.user_id]: { ...prev[s.user_id], unit_workbook_mode: m },
                            }))
                          }
                        />
                      </div>
                    )}
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

                  {/* 유닛별 그룹핑: 같은 unit_id의 sentence들을 한 카드(접이식)로 묶음 */}
                  {(() => {
                    // 학생의 sentence들을 unit으로 그룹핑
                    const groups = new Map<string, string[]>();
                    sentenceIds.forEach((sid) => {
                      const uid = codeToUnit[sid];
                      const groupKey = uid ?? `__nounit__${sid}`;
                      if (!groups.has(groupKey)) groups.set(groupKey, []);
                      groups.get(groupKey)!.push(sid);
                    });
                    const groupArr = Array.from(groups.entries()).map(([k, sids]) => ({
                      key: k,
                      unitId: k.startsWith("__nounit__") ? null : k,
                      sids: sids.slice().sort(),
                      label: k.startsWith("__nounit__")
                        ? sids[0]
                        : unitLabel[k] ?? "유닛 정보 로딩…",
                    }));

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
                                    handlePrintAll(userId, g.sids);
                                  }}
                                  title="이 유닛 전체 인쇄"
                                >
                                  <Printer className="size-3.5" />
                                </Button>
                              </button>

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

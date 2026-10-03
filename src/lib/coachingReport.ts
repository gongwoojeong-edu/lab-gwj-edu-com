// ============================================================
// coachingReport — 주간·월간 첨삭 리포트 집계
//   · 기존 테이블만 조회 (스키마 변경 없음)
//   · 선생님 발송 화면 / 학생 열람 화면 / 인쇄 템플릿이 공용으로 사용
// ============================================================
import { supabase } from "@/integrations/supabase/client";
import { parseMemo, MEMO_FIELD_KEYS, MEMO_FIELD_LABEL, type MemoFieldKey } from "@/lib/approvalMemo";
import { GRADE_LABEL, type ApprovalGrade } from "@/lib/sentenceApprovals";

export interface ReportPeriod {
  start: string; // yyyy-mm-dd
  end: string; // yyyy-mm-dd
}

export interface ReportMemoItem {
  sentenceId: string;
  grade: ApprovalGrade | null;
  at: string; // ISO
  memo: string; // raw (JSON or plain)
}

export interface HandoutItem {
  testDate: string;
  sessionNo: number;
  wordHoScore: number | null;
  syntaxHoResult: string | null;
}

export interface StudentCoachingReport {
  userId: string;
  passCount: number;
  gradeCounts: Partial<Record<ApprovalGrade, number>>;
  praises: string[];
  memos: ReportMemoItem[];
  redoCount: number;
  /** 코칭 메모 4개 항목별 지적 횟수 */
  memoFieldCounts: Record<MemoFieldKey, number>;
  wordAvg: number | null; // %
  wordMin: number | null; // %
  wordTests: number;
  handouts: HandoutItem[];
}

interface ApprovalRow {
  user_id: string;
  sentence_id: string;
  grade: string | null;
  memo: string | null;
  praise_text: string | null;
  approved_at: string | null;
  requested_at: string;
}

interface WordRow {
  user_id: string | null;
  score: number | null;
}

interface HandoutRow {
  user_id: string;
  test_date: string;
  session_no: number;
  word_ho_score: number | null;
  syntax_ho_result: string | null;
}

interface ReviewRow {
  user_id: string;
}

const toPct = (v: number | null | undefined): number | null => {
  if (v == null) return null;
  const n = Number(v);
  if (!isFinite(n)) return null;
  return n <= 1 ? Math.round(n * 100) : Math.round(n);
};

// 첨삭이 늦게 이뤄져도 "학생이 실제로 학습한 시점" 기준으로 리포트에 반영한다.
// 예: 9월에 통과한 문장을 10월에 첨삭 → 9월 리포트에 포함.
// 학습 시점은 sentence_progress.passed_at(최초 통과일)으로 판정하고,
// 통과 기록이 없으면 첨삭일(approved_at)로 대체한다.
const LOOKBACK_DAYS = 120; // 첨삭 지연을 고려한 조회 범위

interface ProgressRow {
  user_id: string;
  sentence_id: string;
  passed_at: string | null;
}

/** 기간 내 리포트 원천 데이터 일괄 조회 */
export const fetchCoachingReportSource = async (period: ReportPeriod) => {
  const startIso = new Date(period.start + "T00:00:00").toISOString();
  const endIso = new Date(period.end + "T23:59:59.999").toISOString();
  // 첨삭일이 기간을 넘겨도 학습일이 기간 안이면 포함해야 하므로 넓게 조회
  const lookbackStart = new Date(period.start + "T00:00:00");
  lookbackStart.setDate(lookbackStart.getDate() - LOOKBACK_DAYS);
  const [ap, wr, ho, rr] = await Promise.all([
    supabase
      .from("sentence_approvals")
      .select("user_id,sentence_id,grade,memo,praise_text,approved_at,requested_at")
      .eq("status", "approved")
      .gte("approved_at", lookbackStart.toISOString())
      .lte("approved_at", endIso)
      .order("approved_at", { ascending: true }),
    supabase
      .from("word_test_results")
      .select("user_id,score")
      .gte("taken_at", startIso)
      .lte("taken_at", endIso),
    supabase
      .from("handout_results")
      .select("user_id,test_date,session_no,word_ho_score,syntax_ho_result")
      .gte("test_date", period.start)
      .lte("test_date", period.end)
      .order("test_date", { ascending: true }),
    supabase
      .from("analysis_review_requests")
      .select("user_id")
      .gte("created_at", startIso)
      .lte("created_at", endIso),
  ]);
  // 승인된 문장들의 최초 통과일(학습일) 조회
  const approvals = (ap.data ?? []) as ApprovalRow[];
  const userIds = [...new Set(approvals.map((a) => a.user_id))];
  const sentenceIds = [...new Set(approvals.map((a) => a.sentence_id))];
  let progressRows: ProgressRow[] = [];
  if (userIds.length && sentenceIds.length) {
    const { data } = await supabase
      .from("sentence_progress")
      .select("user_id,sentence_id,passed_at")
      .in("user_id", userIds)
      .in("sentence_id", sentenceIds)
      .not("passed_at", "is", null);
    progressRows = (data ?? []) as ProgressRow[];
  }
  // (user_id, sentence_id) → 최초 통과일
  const firstPassAt = new Map<string, string>();
  progressRows.forEach((p) => {
    if (!p.passed_at) return;
    const key = `${p.user_id}|${p.sentence_id}`;
    const prev = firstPassAt.get(key);
    if (!prev || p.passed_at < prev) firstPassAt.set(key, p.passed_at);
  });

  return {
    approvals,
    firstPassAt,
    wordResults: (wr.data ?? []) as WordRow[],
    handouts: (ho.data ?? []) as HandoutRow[],
    reviewReqs: (rr.data ?? []) as ReviewRow[],
  };
};

export type CoachingReportSource = Awaited<ReturnType<typeof fetchCoachingReportSource>>;

/** 학생 1명의 리포트 집계 */
export const buildStudentReport = (
  userId: string,
  src: CoachingReportSource,
): StudentCoachingReport => {
  const approvals = src.approvals.filter((a) => a.user_id === userId);
  const gradeCounts: Partial<Record<ApprovalGrade, number>> = {};
  const praises: string[] = [];
  const memos: ReportMemoItem[] = [];
  const memoFieldCounts: Record<MemoFieldKey, number> = {
    no_skipping: 0,
    no_guessing: 0,
    grammar_watch: 0,
    other: 0,
  };

  approvals.forEach((a) => {
    const g = (a.grade ?? null) as ApprovalGrade | null;
    if (g) gradeCounts[g] = (gradeCounts[g] ?? 0) + 1;
    if (a.praise_text?.trim()) praises.push(a.praise_text.trim());
    if (a.memo?.trim()) {
      memos.push({
        sentenceId: a.sentence_id,
        grade: g,
        at: a.approved_at ?? a.requested_at,
        memo: a.memo,
      });
      const parsed = parseMemo(a.memo);
      MEMO_FIELD_KEYS.forEach((k) => {
        if (parsed[k].trim()) memoFieldCounts[k]++;
      });
    }
  });

  const words = src.wordResults
    .filter((w) => w.user_id === userId)
    .map((w) => toPct(w.score))
    .filter((v): v is number => v != null);

  return {
    userId,
    passCount: approvals.length,
    gradeCounts,
    praises,
    memos,
    redoCount: src.reviewReqs.filter((r) => r.user_id === userId).length,
    memoFieldCounts,
    wordAvg: words.length ? Math.round(words.reduce((s, v) => s + v, 0) / words.length) : null,
    wordMin: words.length ? Math.min(...words) : null,
    wordTests: words.length,
    handouts: src.handouts
      .filter((h) => h.user_id === userId)
      .map((h) => ({
        testDate: h.test_date,
        sessionNo: h.session_no,
        wordHoScore: h.word_ho_score,
        syntaxHoResult: h.syntax_ho_result,
      })),
  };
};

/** 알림 본문용 요약 텍스트 */
export const reportSummaryText = (r: StudentCoachingReport, periodLabel: string): string => {
  const grades = (Object.entries(r.gradeCounts) as [ApprovalGrade, number][])
    .filter(([, n]) => n > 0)
    .map(([g, n]) => `${GRADE_LABEL[g]} ${n}`)
    .join(" · ");
  const lines = [
    `${periodLabel} 첨삭 리포트`,
    `통과 문장 ${r.passCount}개${grades ? ` (${grades})` : ""}`,
  ];
  if (r.wordAvg != null) lines.push(`단어테스트 평균 ${r.wordAvg}% (${r.wordTests}회)`);
  if (r.redoCount > 0) lines.push(`재학습 ${r.redoCount}회`);
  return lines.join("\n");
};

// ── 발송 기록 (student_notifications 재사용) ──
export const reportNotifTitle = (period: ReportPeriod) =>
  `첨삭리포트:${period.start}~${period.end}`;

/** 이미 발송된 학생 user_id 집합 */
export const fetchSentReportUserIds = async (period: ReportPeriod): Promise<Set<string>> => {
  const { data } = await supabase
    .from("student_notifications")
    .select("user_id")
    .eq("kind", "evaluation")
    .eq("title", reportNotifTitle(period));
  return new Set(((data ?? []) as { user_id: string }[]).map((r) => r.user_id));
};

/** 학생에게 리포트 발송 (알림 생성) */
export const sendCoachingReport = async (
  userId: string,
  period: ReportPeriod,
  report: StudentCoachingReport,
  periodLabel: string,
): Promise<void> => {
  const { error } = await supabase.from("student_notifications").insert({
    user_id: userId,
    kind: "evaluation",
    title: reportNotifTitle(period),
    body: reportSummaryText(report, periodLabel),
  });
  if (error) throw error;
};

// ── 기간 프리셋 ──
const toInputDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const startOfWeek = (d: Date) => {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // 월요일 시작
  x.setDate(x.getDate() - day);
  return x;
};

export type PeriodPreset = "this_week" | "last_week" | "this_month" | "last_month";

export const PERIOD_PRESET_LABEL: Record<PeriodPreset, string> = {
  this_week: "이번 주",
  last_week: "지난 주",
  this_month: "이번 달",
  last_month: "지난 달",
};

export const presetPeriod = (p: PeriodPreset): ReportPeriod => {
  const now = new Date();
  if (p === "this_week" || p === "last_week") {
    const s = startOfWeek(now);
    if (p === "last_week") s.setDate(s.getDate() - 7);
    const e = new Date(s);
    e.setDate(e.getDate() + 6);
    return { start: toInputDate(s), end: toInputDate(e) };
  }
  const y = now.getFullYear();
  const m = p === "this_month" ? now.getMonth() : now.getMonth() - 1;
  const s = new Date(y, m, 1);
  const e = new Date(y, m + 1, 0);
  return { start: toInputDate(s), end: toInputDate(e) };
};

export const periodLabel = (period: ReportPeriod): string =>
  `${period.start} ~ ${period.end}`;

export { MEMO_FIELD_LABEL };

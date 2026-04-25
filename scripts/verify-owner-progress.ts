// ============================================================
// verify-owner-progress.ts
// 자동 검증 배치: 학생이 "구문분석 완료"를 누른 문장에 대해
// owner_progress 테이블에 품사(pos)/역할(role)/element 등이
// 실제로 저장됐는지 점검한다.
//
// 실행: npx tsx scripts/verify-owner-progress.ts [studentNoOrName]
//   기본값: 이지호 (gwj0065)
//
// 출력:
//   - sentence_progress.analysis_done=true 인 모든 문장
//   - 각 문장의 owner_progress 행 수
//   - progress.pos / progress.role / progress.element 가 들어있는 행 수
//   - 토큰 단위(span:: 가 아닌 owner_id) 행 수
//   - PASS / FAIL 판정 (토큰 progress가 1행도 없으면 FAIL)
// ============================================================
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("환경변수 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.");
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const arg = process.argv[2] ?? "gwj0065";

interface ProgressShape {
  pos?: string;
  role?: string;
  element?: string;
  clauseStart?: number;
  clauseEnd?: number;
  bracketStart?: number;
  bracketEnd?: number;
}

const isTokenOwner = (ownerId: string) => !ownerId.startsWith("span::");

const hasTokenAnnotation = (p: unknown): boolean => {
  if (!p || typeof p !== "object") return false;
  const o = p as ProgressShape;
  return Boolean(o.pos || o.role || o.element);
};

(async () => {
  // 1) 학생 식별
  const { data: profile, error: profErr } = await sb
    .from("student_profiles")
    .select("user_id, display_name, student_no")
    .or(`student_no.eq.${arg},display_name.eq.${arg}`)
    .maybeSingle();
  if (profErr || !profile) {
    console.error("학생을 찾을 수 없습니다:", arg, profErr?.message);
    process.exit(2);
  }
  const userId = profile.user_id as string;
  console.log(`\n검증 대상: ${profile.display_name} (${profile.student_no}) [${userId}]\n`);

  // 2) analysis_done = true 인 문장들
  const { data: progressRows } = await sb
    .from("sentence_progress")
    .select("sentence_id, analysis_done, analysis_match_rate, status, last_activity_at")
    .eq("user_id", userId)
    .eq("analysis_done", true)
    .order("last_activity_at", { ascending: false });

  if (!progressRows?.length) {
    console.log("analysis_done=true 인 문장이 없습니다.");
    return;
  }

  const results: Array<{
    sentence_id: string;
    op_rows: number;
    token_rows: number;
    annotated_tokens: number;
    span_rows: number;
    verdict: "PASS" | "FAIL";
  }> = [];

  for (const row of progressRows) {
    const { data: ops } = await sb
      .from("owner_progress")
      .select("owner_id, progress, custom_answer, completed")
      .eq("user_id", userId)
      .eq("sentence_id", row.sentence_id);
    const opList = ops ?? [];
    const tokenRows = opList.filter((r) => isTokenOwner(r.owner_id));
    const annotated = tokenRows.filter(
      (r) => hasTokenAnnotation(r.progress) || hasTokenAnnotation(r.custom_answer),
    );
    const spanRows = opList.filter((r) => !isTokenOwner(r.owner_id));
    results.push({
      sentence_id: row.sentence_id,
      op_rows: opList.length,
      token_rows: tokenRows.length,
      annotated_tokens: annotated.length,
      span_rows: spanRows.length,
      verdict: annotated.length > 0 ? "PASS" : "FAIL",
    });
  }

  // 3) 보고서 출력
  console.log("문장별 검증 결과:");
  console.table(results);

  const failed = results.filter((r) => r.verdict === "FAIL");
  console.log(`\n총 ${results.length}건 중 FAIL ${failed.length}건`);
  if (failed.length) {
    console.log("\n[FAIL 상세] 분석 완료로 표시됐지만 토큰(품사/역할) progress 저장 0행:");
    for (const f of failed) console.log(`  - ${f.sentence_id} (op_rows=${f.op_rows}, span_rows=${f.span_rows})`);
    process.exit(3);
  }
  console.log("\n✅ 모든 분석 완료 문장에 토큰 단위 progress가 저장되어 있습니다.");
})();

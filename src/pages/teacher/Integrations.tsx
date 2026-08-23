import { useEffect, useState } from "react";
import { TeacherLayout } from "@/components/teacher/TeacherLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Copy, Trash2, KeyRound, Loader2, ExternalLink, Eye, EyeOff, RefreshCw, RotateCcw } from "lucide-react";
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
import { syncOrbitEnglishProfiles, type OrbitEnglishSyncResult } from "@/lib/orbit-sync";
import {
  fetchTeacherAccounts,
  resetTeacherPassword,
  type TeacherAccountRow,
} from "@/lib/resetTeacherPassword";
import { useStaff } from "@/lib/staff-context";
import { defaultPasswordFromLoginId } from "@/lib/gwj-login-id";

interface TokenRow {
  id: string;
  label: string;
  created_at: string;
  last_used_at: string | null;
  revoked: boolean;
}

const PROJECT_REF = (import.meta.env.VITE_SUPABASE_PROJECT_ID as string) || "vyiwfkctilezvpafqjek";
const FUNCTION_URL = `https://${PROJECT_REF}.supabase.co/functions/v1/import-claude-handout`;

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateToken(): string {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const Integrations = () => {
  const { user, roles } = useAuth();
  const isAdmin = roles.includes("admin");
  const { reload: reloadStaff, staffSource } = useStaff();
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [issuing, setIssuing] = useState(false);
  const [orbitSyncing, setOrbitSyncing] = useState(false);
  const [orbitResult, setOrbitResult] = useState<OrbitEnglishSyncResult | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [teacherCount, setTeacherCount] = useState<number>(0);
  const [studentCount, setStudentCount] = useState<number>(0);
  const [label, setLabel] = useState("Claude 지문분석기");
  const [newPlainToken, setNewPlainToken] = useState<string | null>(null);
  const [showSnippet, setShowSnippet] = useState(true);
  const [revokeTarget, setRevokeTarget] = useState<TokenRow | null>(null);
  const [teachers, setTeachers] = useState<TeacherAccountRow[]>([]);
  const [teachersLoading, setTeachersLoading] = useState(false);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [manualLoginId, setManualLoginId] = useState("");
  const [resetResult, setResetResult] = useState<{
    name: string | null;
    loginId: string;
    password: string;
  } | null>(null);
  const [resetConfirm, setResetConfirm] = useState<{
    userId?: string;
    loginId?: string;
    name: string;
  } | null>(null);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("import_tokens")
      .select("id, label, created_at, last_used_at, revoked")
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "토큰 목록 로드 실패", description: error.message, variant: "destructive" });
    } else {
      setTokens(data ?? []);
    }
    setLoading(false);
  };

  const loadOrbitStatus = async () => {
    const db = supabase as unknown as { from: (t: string) => any };
    const [{ data: staffRows }, { count: studentN }] = await Promise.all([
      db.from("orbit_staff_cache").select("synced_at").order("synced_at", { ascending: false }).limit(1),
      db.from("student_profiles").select("user_id", { count: "exact", head: true }).not("orbit_class_id", "is", null),
    ]);
    const { count: staffN } = await db.from("orbit_staff_cache").select("id", { count: "exact", head: true });
    setLastSyncAt(staffRows?.[0]?.synced_at ?? null);
    setTeacherCount(staffN ?? 0);
    setStudentCount(studentN ?? 0);
  };

  useEffect(() => {
    void load();
    void loadOrbitStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    (async () => {
      setTeachersLoading(true);
      try {
        const rows = await fetchTeacherAccounts();
        if (!cancelled) setTeachers(rows);
      } catch (e) {
        if (!cancelled) {
          toast({
            title: "선생님 목록 로드 실패",
            description: (e as Error).message,
            variant: "destructive",
          });
        }
      } finally {
        if (!cancelled) setTeachersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  const doReset = async (opts: { userId?: string; loginId?: string }) => {
    const key = opts.userId ?? opts.loginId ?? "";
    setResettingId(key);
    setResetResult(null);
    try {
      const result = await resetTeacherPassword(opts);
      if (!result.ok) {
        toast({ title: "비밀번호 초기화 실패", description: result.error, variant: "destructive" });
        return;
      }
      setResetResult({
        name: result.name ?? null,
        loginId: result.loginId ?? opts.loginId ?? "",
        password: result.password ?? "",
      });
      toast({
        title: "비밀번호가 초기화되었습니다",
        description: `${result.loginId} → ${result.password}`,
      });
    } finally {
      setResettingId(null);
      setResetConfirm(null);
    }
  };

  const issue = async () => {
    if (!user) return;
    setIssuing(true);
    try {
      const plain = generateToken();
      const hash = await sha256Hex(plain);
      const { error } = await supabase.from("import_tokens").insert({
        teacher_id: user.id,
        token_hash: hash,
        label: label.trim() || "Claude 지문분석기",
      });
      if (error) throw error;
      setNewPlainToken(plain);
      toast({ title: "토큰이 발급되었습니다", description: "이 화면을 떠나면 다시 볼 수 없습니다." });
      await load();
    } catch (e) {
      toast({ title: "토큰 발급 실패", description: (e as Error).message, variant: "destructive" });
    } finally {
      setIssuing(false);
    }
  };

  const revoke = async (id: string) => {
    const { error } = await supabase.from("import_tokens").update({ revoked: true }).eq("id", id);
    if (error) {
      toast({ title: "폐기 실패", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "토큰을 폐기했습니다" });
      await load();
    }
  };

  const runOrbitSync = async () => {
    setOrbitSyncing(true);
    setOrbitResult(null);
    try {
      const result = await syncOrbitEnglishProfiles();
      setOrbitResult(result);
      if (!result.ok) {
        toast({ title: "Orbit 동기화 실패", description: result.error, variant: "destructive" });
        return;
      }
      reloadStaff();
      void loadOrbitStatus();
      toast({
        title: "Orbit 동기화 완료",
        description: `선생님 ${result.teachersSynced ?? 0}명 · 학생 ${result.studentsSynced ?? 0}명 · 시간표 ${result.classesWithTimes ?? 0}/${result.classesTotal ?? 0}반`,
      });
    } finally {
      setOrbitSyncing(false);
    }
  };

  const copy = async (text: string, msg = "복사되었습니다") => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: msg });
    } catch {
      toast({ title: "복사 실패 — 직접 선택해 복사하세요", variant: "destructive" });
    }
  };

  const snippet = `// ===== 공우정에듀 학습기 연동 (1회 등록) =====
// ① 아래 라인의 'YOUR_TOKEN_HERE' 자리에 발급받은 토큰을 넣고 콘솔(F12)에 붙여넣기
localStorage.setItem("GWJ_IMPORT_KEY", "YOUR_TOKEN_HERE");

// ② 라이브러리 카드 footer 등에 아래 함수를 호출하는 버튼 추가
// ★ 지문이 여러 개면 unit_title을 다르게(263모고32, 263모고33...) 해서 각각 호출하세요.
async function sendToLearner(id) {
  const rec = library.find(r => r.id === id);
  if (!rec) return alert("기록을 찾을 수 없습니다");
  const apiKey = localStorage.getItem("GWJ_IMPORT_KEY");
  if (!apiKey) return alert("먼저 GWJ_IMPORT_KEY를 등록하세요");

  const renderAnalysis = (typeof renderAnalysisToString === "function")
    ? renderAnalysisToString(rec.data) : "";
  const renderStructure = (typeof renderStructureToString === "function")
    ? renderStructureToString(rec.data) : "";

  const d = rec.data;
  const res = await fetch("${FUNCTION_URL}", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey },
    body: JSON.stringify({
      // ─── 계층 구조 (필수 권장) ───────────────────────────
      level:         d.level         || "L08",          // L01~L10
      series_title:  d.series_title  || "모의고사",      // 시리즈명
      volume_title:  d.volume_title  || "2026년 3월",   // 권명
      unit_title:    d.unit_title    || "263모고32",    // 유닛명 (지문별로 다르게!)
      unit_no:       d.unit_no       || 260332,        // 정렬용 번호 (선택)
      item_code:     d.item_code     || "263모고32-1", // 지문 고유 코드 (선택)

      // ─── 본문 ─────────────────────────────────────────
      passage:        d.passage,
      analysis_html:  renderAnalysis,
      structure_html: renderStructure,
      structure: { nodes: [/* id, label, english, korean, literal, point, children */], svg: "<svg>...</svg>" },

      // ─── 메타 (선택) ──────────────────────────────────
      title_ko:       d.title_ko,
      topic_ko:       d.topic_ko,
      topic_en:       d.topic_en,
    }),
  });
  const j = await res.json();
  if (j.ok) alert("📚 학습기 전송 완료\\n레벨: " + j.level + "\\n코드: " + j.code + "\\n학습 URL: " + j.learn_url);
  else alert("❌ 전송 실패: " + (j.error || "알 수 없는 오류"));
}
`;

  const fieldsDoc = `level         L01~L10  레벨 (예: L08 = 고1)
series_title  문자열   시리즈명 — 같은 (level + series_title)이면 동일 시리즈 재사용
volume_title  문자열   권명     — 같은 (series + volume_title)이면 동일 권 재사용
unit_title    문자열   유닛명   — 다른 값으로 보내면 새 유닛 생성, 같은 값이면 같은 유닛에 지문 누적
unit_no       숫자     정렬용 번호 (선택)
item_code     문자열   지문 고유 코드 (선택, 충돌 시 자동 -2/-3 부여)
passage       문자열   영문 본문 (필수)
analysis_html 문자열   분석교안 HTML (선택)
structure_html 문자열  구조도 HTML (선택, standalone 인터랙티브 권장)
structure       객체    구조도 JSON { nodes[], svg? } — HTML 스냅샷 이슈 원천 제거 (권장)`;

  return (
    <TeacherLayout>
      <div className="container max-w-4xl py-8 space-y-6">
        <header>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <KeyRound className="size-6" /> 외부 연동
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            클로드 지문분석기 등 외부 도구에서 만든 자료를 학생 학습기로 직접 전송할 수 있습니다.
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="size-5" /> Orbit 연동 (영어과)
            </CardTitle>
            <CardDescription>
              오르빗 마스터에서 영어과 선생님·반·학생 정보를 가져옵니다. 로그인은 잉글랩·단어학습기와
              동일합니다 (학생 gwj+4자리, 선생님 gwjt+3자리 · 초기 비밀번호: 아이디+마지막 숫자).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
              <p>
                선생님 예: <code className="text-xs bg-background px-1 rounded">512</code> →{" "}
                <code className="text-xs bg-background px-1 rounded">gwjt512</code> · 초기 비밀번호{" "}
                <code className="text-xs bg-background px-1 rounded">
                  {defaultPasswordFromLoginId("gwjt512")}
                </code>
              </p>
              {staffSource === "cache" && (
                <p className="text-xs text-muted-foreground">
                  직원 목록: Orbit 동기화 캐시 사용 중 (외부 연동에서 동기화 실행)
                </p>
              )}
            </div>
            <div className="rounded-md border bg-muted/20 p-3 text-sm space-y-1">
              <p className="flex items-center gap-2">
                <span className="font-medium">최근 동기화:</span>
                {lastSyncAt ? (
                  <>
                    <Badge variant="secondary">
                      {new Date(lastSyncAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      선생님 {teacherCount}명 · 학생 {studentCount}명
                    </span>
                  </>
                ) : (
                  <span className="text-muted-foreground">아직 동기화된 적 없음</span>
                )}
              </p>
            </div>
            <Button onClick={runOrbitSync} disabled={orbitSyncing}>
              {orbitSyncing && <Loader2 className="size-4 mr-1 animate-spin" />}
              Orbit 영어과 동기화
            </Button>
            {orbitResult?.ok && (
              <p className="text-sm text-muted-foreground">
                선생님 {orbitResult.teachersSynced ?? 0}명 · 학생 {orbitResult.studentsSynced ?? 0}명
                {typeof orbitResult.classesWithTimes === "number"
                  ? ` · 시간표 ${orbitResult.classesWithTimes}/${orbitResult.classesTotal ?? 0}반`
                  : ""}
                동기화 · 건너뜀 {orbitResult.studentsSkipped ?? 0} · 제외(비영어/휴퇴원){" "}
                {orbitResult.studentsExcluded ?? 0}
                {(orbitResult.studentsFailed ?? 0) > 0 &&
                  ` · 실패 ${orbitResult.studentsFailed}`}
              </p>
            )}
          </CardContent>
        </Card>

        {isAdmin && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RotateCcw className="size-5" /> 선생님 비밀번호 초기화
              </CardTitle>
              <CardDescription>
                admin 전용. 초기 비밀번호는 아이디+마지막 숫자 규칙으로 재설정됩니다 (예: gwjt512 →
                gwjt5122).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <Label htmlFor="manual-login-id">선생님 번호</Label>
                  <Input
                    id="manual-login-id"
                    value={manualLoginId}
                    onChange={(e) => setManualLoginId(e.target.value)}
                    placeholder="예: 512, gwjt512"
                    maxLength={20}
                  />
                </div>
                <Button
                  variant="secondary"
                  disabled={!manualLoginId.trim() || resettingId !== null}
                  onClick={() =>
                    setResetConfirm({
                      loginId: manualLoginId.trim(),
                      name: manualLoginId.trim(),
                    })
                  }
                >
                  {resettingId === manualLoginId.trim() && (
                    <Loader2 className="size-4 mr-1 animate-spin" />
                  )}
                  초기화
                </Button>
              </div>

              {resetResult && (
                <div className="rounded-md border border-primary/40 bg-primary/5 p-3 text-sm space-y-1">
                  <p className="font-semibold">✓ 초기화 완료</p>
                  <p>
                    {resetResult.name && <span>{resetResult.name} · </span>}
                    로그인:{" "}
                    <code className="text-xs bg-background px-1 rounded">
                      {resetResult.loginId.replace(/^gwjt/, "")}
                    </code>{" "}
                    / 비밀번호{" "}
                    <code className="text-xs bg-background px-1 rounded">{resetResult.password}</code>
                  </p>
                </div>
              )}

              {teachersLoading ? (
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" /> Orbit 연동 선생님 목록 불러오는 중…
                </p>
              ) : teachers.length > 0 ? (
                <ul className="divide-y rounded-md border">
                  {teachers.map((t) => (
                    <li key={t.user_id} className="py-2 px-3 flex items-center gap-3 text-sm">
                      <div className="flex-1 min-w-0">
                        <span className="font-medium">{t.name}</span>
                        <span className="text-muted-foreground ml-2 font-mono text-xs">{t.login_id}</span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={resettingId !== null}
                        onClick={() =>
                          setResetConfirm({ userId: t.user_id, loginId: t.login_id, name: t.name })
                        }
                      >
                        {resettingId === t.user_id && (
                          <Loader2 className="size-3 mr-1 animate-spin" />
                        )}
                        초기화
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Orbit 동기화 후 연결된 선생님 목록이 여기에 표시됩니다.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Issue token */}
        <Card>
          <CardHeader>
            <CardTitle>새 Import Token 발급</CardTitle>
            <CardDescription>
              발급된 토큰은 발급 직후 한 번만 표시됩니다. 안전한 곳에 보관하세요.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <Label htmlFor="label">토큰 라벨 (메모용)</Label>
                <Input
                  id="label"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="예: Claude 지문분석기 - 데스크톱"
                  maxLength={100}
                />
              </div>
              <Button onClick={issue} disabled={issuing}>
                {issuing && <Loader2 className="size-4 mr-1 animate-spin" />}
                발급
              </Button>
            </div>

            {newPlainToken && (
              <div className="rounded-md border border-primary/40 bg-primary/5 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">🎉 발급된 토큰 (지금만 표시됩니다)</span>
                  <Button size="sm" variant="ghost" onClick={() => setNewPlainToken(null)}>
                    닫기
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Input readOnly value={newPlainToken} className="font-mono text-xs" />
                  <Button size="sm" variant="outline" onClick={() => copy(newPlainToken, "토큰이 복사되었습니다")}>
                    <Copy className="size-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  클로드 앱 콘솔(F12)에 다음을 한 번만 실행하세요:
                </p>
                <code className="block text-xs bg-background border rounded p-2 font-mono break-all">
                  localStorage.setItem("GWJ_IMPORT_KEY", "{newPlainToken}");
                </code>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Token list */}
        <Card>
          <CardHeader>
            <CardTitle>발급된 토큰 목록</CardTitle>
            <CardDescription>토큰 평문은 보관되지 않습니다. 분실 시 새로 발급하세요.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="size-5 mr-2 animate-spin" /> 불러오는 중...
              </div>
            ) : tokens.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                아직 발급된 토큰이 없습니다.
              </p>
            ) : (
              <ul className="divide-y">
                {tokens.map((t) => (
                  <li key={t.id} className="py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{t.label}</span>
                        {t.revoked ? (
                          <Badge variant="destructive">폐기됨</Badge>
                        ) : (
                          <Badge variant="secondary">활성</Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        발급 {new Date(t.created_at).toLocaleString("ko-KR")}
                        {t.last_used_at &&
                          ` · 마지막 사용 ${new Date(t.last_used_at).toLocaleString("ko-KR")}`}
                      </div>
                    </div>
                    {!t.revoked && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => setRevokeTarget(t)}
                      >
                        <Trash2 className="size-4 mr-1" /> 폐기
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Snippet */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>클로드 앱에 붙여넣을 코드</CardTitle>
              <CardDescription>
                클로드에서 만든 HTML 파일에 아래 함수와 버튼을 추가하세요.
              </CardDescription>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setShowSnippet((s) => !s)}>
              {showSnippet ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </Button>
          </CardHeader>
          {showSnippet && (
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>API Endpoint</Label>
                  <Button size="sm" variant="outline" onClick={() => copy(FUNCTION_URL)}>
                    <Copy className="size-3 mr-1" /> 복사
                  </Button>
                </div>
                <code className="block text-xs bg-muted rounded p-2 font-mono break-all">
                  {FUNCTION_URL}
                </code>
              </div>

              <Separator />

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>JavaScript 스니펫</Label>
                  <Button size="sm" variant="outline" onClick={() => copy(snippet, "스니펫이 복사되었습니다")}>
                    <Copy className="size-3 mr-1" /> 복사
                  </Button>
                </div>
                <pre className="text-[11px] bg-muted rounded p-3 overflow-x-auto font-mono whitespace-pre-wrap max-h-96 overflow-y-auto">
                  {snippet}
                </pre>
              </div>

              <div className="space-y-2">
                <Label>페이로드 필드 안내</Label>
                <pre className="text-[11px] bg-muted rounded p-3 overflow-x-auto font-mono whitespace-pre max-h-60 overflow-y-auto">
                  {fieldsDoc}
                </pre>
                <p className="text-xs text-muted-foreground">
                  ★ <b>지문이 여러 개</b>면 같은 시리즈/권 안에서 <code className="bg-background px-1 rounded">unit_title</code> 값을 다르게 해서
                  여러 번 호출하세요. 같은 값이면 같은 유닛에 누적되고, 다른 값이면 새 유닛이 생성됩니다.
                </p>
              </div>

              <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
                <p className="font-semibold">📋 사용 순서</p>
                <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                  <li>위에서 토큰 발급 → 평문 토큰 복사</li>
                  <li>클로드 앱을 브라우저에서 열고 콘솔(F12) → <code className="text-xs bg-background px-1 rounded">localStorage.setItem(...)</code> 실행</li>
                  <li>클로드 앱 코드의 라이브러리 카드 footer에 <code className="text-xs bg-background px-1 rounded">📚 학습기로 전송</code> 버튼 추가 (위 스니펫 참고)</li>
                  <li>버튼 클릭 → 책장 → 해당 레벨 → 시리즈 → 권 → 유닛에 자동 등록됨</li>
                </ol>
              </div>
            </CardContent>
          )}
        </Card>

        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <ExternalLink className="size-3" />
          전송된 자료는{" "}
          <a href="/teacher/bookshelf" className="underline">
            책장
          </a>{" "}
          에서 확인할 수 있습니다.
        </p>
      </div>

      <AlertDialog open={!!revokeTarget} onOpenChange={(o) => !o && setRevokeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>이 토큰을 폐기할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              이 토큰을 사용 중인 외부 도구는 더 이상 학습기로 전송할 수 없게 됩니다. 새로 발급해서
              다시 등록해야 합니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (revokeTarget) await revoke(revokeTarget.id);
                setRevokeTarget(null);
              }}
            >
              폐기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!resetConfirm} onOpenChange={(o) => !o && setResetConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>비밀번호를 초기화할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              {resetConfirm?.name} 선생님 계정의 비밀번호를 초기값으로 재설정합니다. 기존 비밀번호는
              더 이상 사용할 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (resetConfirm) {
                  void doReset({
                    userId: resetConfirm.userId,
                    loginId: resetConfirm.loginId,
                  });
                }
              }}
            >
              초기화
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TeacherLayout>
  );
};

export default Integrations;

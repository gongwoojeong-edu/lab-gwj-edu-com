// Edge Function: sync-orbit-english
// Platform Orbit(odyyafiexhebzoodeejl) → lab student_profiles / auth / staff cache
// 영어과 학생·선생님·반만 동기화, 로그인 정책 동일 (gwj#### / gwjt### + default password)
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.50.0";

const ORBIT_PROJECT_REF = "odyyafiexhebzoodeejl";

/** Legacy JWT(eyJ…) or opaque sb_secret_ — both work for admin/service REST. */
function createServiceClient(url: string, serviceKey: string): SupabaseClient {
  const key = serviceKey.trim();
  const isOpaqueKey = key.startsWith("sb_secret_") || key.startsWith("sb_publishable_");

  if (!isOpaqueKey) {
    return createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: { apikey: key },
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        headers.set("apikey", key);
        const auth = headers.get("authorization") ?? "";
        const bearer = auth.replace(/^Bearer\s+/i, "").trim();
        if (bearer === key || (!bearer.startsWith("eyJ") && bearer.length > 0)) {
          headers.delete("authorization");
        }
        return fetch(input, { ...init, headers });
      },
    },
  });
}

async function deactivateOrbitStudentByHakbun(
  labSb: SupabaseClient,
  hakbun: string,
): Promise<boolean> {
  const full = {
    orbit_enrollment_active: false,
    orbit_class_id: null,
    orbit_class_name: null,
    orbit_class_days: null,
    orbit_class_schedule: null as null,
  };
  let { data, error } = await labSb
    .from("student_profiles")
    .update(full)
    .eq("student_no", hakbun)
    .select("user_id");
  // 마이그레이션 전: schedule 컬럼 없으면 나머지라도 갱신
  if (error && /orbit_class_schedule/i.test(error.message)) {
    const { orbit_class_schedule: _drop, ...rest } = full;
    ({ data, error } = await labSb
      .from("student_profiles")
      .update(rest)
      .eq("student_no", hakbun)
      .select("user_id"));
  }
  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}

async function probeOrbitClient(
  orbitSb: SupabaseClient,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await orbitSb.schema("orbit").from("campuses").select("id").limit(1);
  if (!error) return { ok: true };

  const msg = error.message ?? "Orbit query failed";
  if (/invalid api key/i.test(msg)) {
    return {
      ok: false,
      error:
        "Orbit API key 거부됨. ORBIT_SUPABASE_SERVICE_ROLE_KEY가 " +
        "odyyafiexhebzoodeejl 프로젝트의 sb_secret_ 또는 legacy service_role(eyJ…)인지, " +
        "lab(vyiwfkctilezvpafqjek) 키가 아닌지 확인하세요.",
    };
  }
  return { ok: false, error: msg };
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type OrbitStudent = {
  id: string;
  hakbun: string | null;
  name: string;
  grade: string | null;
  status: string | null;
  subjects: string[] | null;
  campus_id: string | null;
};

type OrbitStaff = {
  id: string;
  name: string;
  rank: number;
  campus_id: string | null;
  auth_user_id: string | null;
  employee_no: string | null;
  subjects: string[] | null;
  active: boolean;
};

type OrbitClassRow = {
  class_id: string;
  class_name: string;
  filter_label: string;
  schedule_label?: string | null;
  /** Orbit classes.schedule jsonb { slots: [{ day, start, end }] } */
  schedule?: unknown;
  subject: string | null;
  days?: string[] | null;
  /** MON → HH:MM */
  times?: Record<string, string> | null;
};

const DAY_TOKEN: Record<string, string> = {
  MON: "MON",
  MONDAY: "MON",
  TUE: "TUE",
  TUES: "TUE",
  TUESDAY: "TUE",
  WED: "WED",
  WEDNESDAY: "WED",
  THU: "THU",
  THUR: "THU",
  THURS: "THU",
  THURSDAY: "THU",
  FRI: "FRI",
  FRIDAY: "FRI",
  SAT: "SAT",
  SATURDAY: "SAT",
  SUN: "SUN",
  SUNDAY: "SUN",
  월: "MON",
  화: "TUE",
  수: "WED",
  목: "THU",
  금: "FRI",
  토: "SAT",
  일: "SUN",
};

function normalizeDayToken(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const upper = t.toUpperCase();
  return DAY_TOKEN[upper] ?? DAY_TOKEN[t] ?? null;
}

function parseDaysValue(input: unknown): string[] | null {
  if (input == null) return null;
  const out: string[] = [];
  const push = (c: string | null) => {
    if (c && !out.includes(c)) out.push(c);
  };
  if (Array.isArray(input)) {
    for (const v of input) {
      if (typeof v === "string") push(normalizeDayToken(v));
    }
  } else if (typeof input === "string") {
    const s = input.trim();
    if (!s) return null;
    const parts = s.split(/[,|/\s·･]+/).filter(Boolean);
    if (parts.length > 1) parts.forEach((p) => push(normalizeDayToken(p)));
    else {
      for (const ch of s) push(normalizeDayToken(ch));
      if (out.length === 0) push(normalizeDayToken(s));
    }
  }
  return out.length > 0 ? out : null;
}

function parseDaysFromLabel(label: string | null | undefined): string[] | null {
  if (!label) return null;
  // 반 이름 전체에서 글자마다 요일을 뽑으면 "일반/일대일/월요일"의 「일」이 SUN으로 오인됨.
  // 명시적 요일 덩어리만 인정: 월화수목, 화·목, 토요 등
  const compact = label.replace(/\s+/g, "");
  const chunk =
    compact.match(/[월화수목금토일]{2,}/)?.[0] ??
    compact.match(/(?:월|화|수|목|금|토|일)(?:[·･,/]? (?:월|화|수|목|금|토|일)){1,6}/)?.[0] ??
    null;
  // "토요" / "토요반" 단독
  if (!chunk) {
    if (/토요|토요일|토반/.test(compact)) return ["SAT"];
    if (/일요|일요일(?!반)/.test(compact)) return ["SUN"]; // 일요만, 「일반」제외
    return null;
  }
  const out: string[] = [];
  for (const ch of chunk.replace(/[·･,/]/g, "")) {
    const c = normalizeDayToken(ch);
    if (c && !out.includes(c)) out.push(c);
  }
  return out.length > 0 ? out : null;
}

/**
 * Orbit filter_label / schedule_label → 요일+시작시각.
 * 예: "화토 14:00", "월수 16:00 · 토 10:00", "판교 · 김선생 · 화토 14:00"
 */
function parseScheduleFromLabel(
  label: string | null | undefined,
): { days: string[]; times: Record<string, string> } | null {
  if (!label) return null;
  const days: string[] = [];
  const times: Record<string, string> = {};
  const push = (code: string | null, hm: string | null) => {
    if (!code) return;
    if (!days.includes(code)) days.push(code);
    if (hm && !times[code]) times[code] = hm;
  };

  const parts = String(label)
    .split(/[·･|]/)
    .map((p) => p.trim())
    .filter(Boolean);

  for (const part of parts) {
    // "화토 14:00" / "화토14:00" / "토 14:00~16:00"
    const withTime = part.match(
      /^([월화수목금토일]{1,7})\s*(\d{1,2}:\d{2})(?:\s*[~\-–]\s*\d{1,2}:\d{2})?/,
    );
    if (withTime) {
      const hm = timeToHm(withTime[2]);
      for (const ch of withTime[1]) push(normalizeDayToken(ch), hm);
      continue;
    }
    // 요일만 (시간 없음)
    const daysOnly = parseDaysFromLabel(part);
    if (daysOnly) {
      for (const d of daysOnly) push(d, null);
    }
  }

  // 분할 실패 시 전체 문자열에서 "요일덩어리 + 시각" 재시도
  if (days.length === 0) {
    const global = String(label).match(
      /([월화수목금토일]{1,7})\s*(\d{1,2}:\d{2})/g,
    );
    if (global) {
      for (const g of global) {
        const m = g.match(/([월화수목금토일]{1,7})\s*(\d{1,2}:\d{2})/);
        if (!m) continue;
        const hm = timeToHm(m[2]);
        for (const ch of m[1]) push(normalizeDayToken(ch), hm);
      }
    }
  }

  if (days.length === 0 && Object.keys(times).length === 0) return null;
  return { days, times };
}

/** Orbit classes.schedule jsonb → 요일+시작시각 */
function parseOrbitScheduleJson(
  raw: unknown,
): { days: string[]; times: Record<string, string> } | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const days: string[] = [];
  const times: Record<string, string> = {};
  const push = (dayRaw: unknown, startRaw: unknown) => {
    const code =
      typeof dayRaw === "string"
        ? normalizeDayToken(dayRaw)
        : typeof dayRaw === "number"
          ? ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][
              dayRaw >= 0 && dayRaw <= 6
                ? dayRaw
                : dayRaw >= 1 && dayRaw <= 7
                  ? dayRaw % 7
                  : -1
            ] ?? null
          : null;
    if (!code) return;
    if (!days.includes(code)) days.push(code);
    const hm = timeToHm(startRaw);
    if (hm && !times[code]) times[code] = hm;
  };

  // 표준: { slots: [{ day: "화", start: "16:00", end: "18:00" }] }
  if (Array.isArray(obj.slots)) {
    for (const slot of obj.slots) {
      if (!slot || typeof slot !== "object") continue;
      const s = slot as Record<string, unknown>;
      push(s.day ?? s.weekday ?? s.day_of_week, s.start ?? s.start_time);
    }
  } else if (Array.isArray(obj.days)) {
    // 레거시: { days: ["화","토"], start, end }
    for (const d of obj.days) push(d, obj.start ?? obj.start_time);
  } else {
    // attendance_schedule 스타일: { SAT: { start, end }, ... }
    for (const [k, v] of Object.entries(obj)) {
      if (!v || typeof v !== "object" || Array.isArray(v)) continue;
      const slot = v as Record<string, unknown>;
      if (slot.start == null && slot.start_time == null) continue;
      push(k, slot.start ?? slot.start_time);
    }
  }

  if (days.length === 0 && Object.keys(times).length === 0) return null;
  return { days, times };
}

/** Orbit classes / schedules → 요일 + 시작시각 */
type ClassScheduleInfo = {
  days: string[];
  /** MON → "14:00" */
  times: Record<string, string>;
};

function timeToHm(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Math.min(23, Math.max(0, Number(m[1])));
  const min = Math.min(59, Math.max(0, Number(m[2])));
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

async function labHasClassScheduleColumn(labSb: SupabaseClient): Promise<boolean> {
  const { error } = await labSb
    .from("student_profiles")
    .select("orbit_class_schedule")
    .limit(1);
  if (!error) return true;
  if (/orbit_class_schedule/i.test(error.message)) return false;
  // 다른 오류(권한 등)면 컬럼은 있다고 보고 진행 — 이후 update에서 재확인
  return true;
}

async function loadClassScheduleById(
  orbitSb: SupabaseClient,
): Promise<Map<string, ClassScheduleInfo>> {
  const map = new Map<string, ClassScheduleInfo>();

  const ensure = (id: string) => {
    let row = map.get(id);
    if (!row) {
      row = { days: [], times: {} };
      map.set(id, row);
    }
    return row;
  };

  const addDay = (id: string, code: string | null, timeHm: string | null) => {
    if (!id || !code) return;
    const row = ensure(id);
    if (!row.days.includes(code)) row.days.push(code);
    if (timeHm && !row.times[code]) row.times[code] = timeHm;
  };

  // 1) Orbit 정식: classes.schedule jsonb
  {
    const { data, error } = await orbitSb
      .schema("orbit")
      .from("classes")
      .select("id, schedule, subject")
      .eq("subject", "영어")
      .limit(2000);
    if (!error && data?.length) {
      for (const r of data as Record<string, unknown>[]) {
        const id = String(r.id ?? "");
        if (!id) continue;
        const parsed = parseOrbitScheduleJson(r.schedule);
        if (!parsed) continue;
        for (const d of parsed.days) addDay(id, d, parsed.times[d] ?? null);
      }
    }
  }

  // 2) 레거시 class_schedules (있으면 보강)
  if (map.size === 0) {
    const schedSelects = [
      "class_id, day_of_week, start_time, end_time",
      "class_id, weekday, start_time",
    ];
    for (const sel of schedSelects) {
      const { data, error } = await orbitSb
        .schema("orbit")
        .from("class_schedules")
        .select(sel)
        .limit(8000);
      if (error || !data?.length) continue;
      for (const r of data as Record<string, unknown>[]) {
        const id = String(r.class_id ?? "");
        const raw = r.day_of_week ?? r.weekday ?? r.day;
        let code: string | null = null;
        if (typeof raw === "number") {
          const names = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
          const js =
            raw >= 0 && raw <= 6 ? raw : raw >= 1 && raw <= 7 ? raw % 7 : -1;
          code = js >= 0 ? names[js] : null;
        } else if (typeof raw === "string") {
          code = normalizeDayToken(raw);
        }
        addDay(id, code, timeToHm(r.start_time ?? r.begin_time));
      }
      if (map.size > 0) break;
    }
  }

  return map;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function defaultPassword(loginId: string): string {
  const t = loginId.trim().toLowerCase();
  const last = t.match(/\d$/)?.[0];
  return last ? `${t}${last}` : t;
}

function loginIdToEmail(loginId: string): string {
  return `${loginId.trim().toLowerCase()}@gwj.local`;
}

/**
 * 오르빗 학년 문자열 → 구문랩 시작 레벨.
 * L03(예비중)·L07(예비고) 은 수동 승급 전용이므로 자동 배정하지 않음.
 * 매핑 불가 학년은 null → 호출부에서 기본값 유지.
 */
function gradeToStartLevel(grade: string | null | undefined): string | null {
  if (!grade) return null;
  const g = grade.replace(/\s+/g, "").replace(/초등/, "초").replace(/중등/, "중").replace(/고등/, "고");
  const map: Record<string, string> = {
    "초1": "L01", "초2": "L01", "초3": "L01", "초4": "L01",
    "초5": "L02", "초6": "L02",
    "중1": "L04", "중2": "L05", "중3": "L06",
    "고1": "L08", "고2": "L09", "고3": "L10",
  };
  return map[g] ?? null;
}

async function loadEnglishStudentIds(sb: SupabaseClient): Promise<Set<string>> {
  const ids = new Set<string>();

  const { data: enrollments } = await sb
    .schema("orbit")
    .from("enrollments")
    .select("student_id, classes(subject)")
    .eq("active", true);

  for (const row of enrollments ?? []) {
    const subject = (row.classes as { subject?: string | null } | null)?.subject;
    if (subject === "영어") ids.add(row.student_id as string);
  }

  const { data: teachers } = await sb
    .schema("orbit")
    .from("student_subject_teachers")
    .select("student_id")
    .eq("subject", "영어");

  for (const row of teachers ?? []) {
    ids.add(row.student_id as string);
  }

  return ids;
}

function isEngEligible(
  st: Pick<OrbitStudent, "id" | "subjects">,
  englishIds: Set<string>,
): boolean {
  const subs = st.subjects ?? [];
  if (subs.includes("영어")) return true;
  return englishIds.has(st.id);
}

async function resolveEnglishTeacherStaffId(
  orbitSb: SupabaseClient,
  studentId: string,
): Promise<string | null> {
  const { data: sst } = await orbitSb
    .schema("orbit")
    .from("student_subject_teachers")
    .select("teacher_id")
    .eq("student_id", studentId)
    .eq("subject", "영어")
    .eq("role", "primary")
    .limit(1)
    .maybeSingle();

  if (sst?.teacher_id) return sst.teacher_id as string;

  const { data: enr } = await orbitSb
    .schema("orbit")
    .from("enrollments")
    .select("classes(teacher_id, subject)")
    .eq("student_id", studentId)
    .eq("active", true);

  for (const row of enr ?? []) {
    const cls = row.classes as { teacher_id?: string | null; subject?: string | null } | null;
    if (cls?.subject === "영어" && cls.teacher_id) return cls.teacher_id;
  }

  return null;
}

async function resolveEnglishClass(
  orbitSb: SupabaseClient,
  studentId: string,
  classById: Map<string, OrbitClassRow>,
): Promise<OrbitClassRow | null> {
  const { data: enr } = await orbitSb
    .schema("orbit")
    .from("enrollments")
    .select("class_id, classes(subject)")
    .eq("student_id", studentId)
    .eq("active", true);

  for (const row of enr ?? []) {
    const cls = row.classes as { subject?: string | null } | null;
    if (cls?.subject !== "영어") continue;
    const hit = classById.get(row.class_id as string);
    if (hit) return hit;
  }
  return null;
}

async function ensureAuthUser(
  labSb: SupabaseClient,
  loginId: string,
  displayName: string,
  role: "student" | "teacher",
): Promise<string> {
  const email = loginIdToEmail(loginId);
  const password = defaultPassword(loginId);

  const { data: listed, error: listErr } = await labSb.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listErr) throw new Error(listErr.message);

  const existing = listed.users.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase(),
  );
  if (existing) {
    const update: {
      user_metadata: { student_no: string; display_name: string };
      password?: string;
    } = {
      user_metadata: {
        student_no: loginId,
        display_name: displayName,
      },
    };
    // Orbit 동기화 시 선생님은 표준 초기 비밀번호로 맞춤 (기존 계정 로그인 불가 방지)
    if (role === "teacher") {
      update.password = password;
    }
    await labSb.auth.admin.updateUserById(existing.id, update);
    await ensureRole(labSb, existing.id, role);
    return existing.id;
  }

  const { data: created, error: createErr } = await labSb.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      student_no: loginId,
      display_name: displayName,
    },
  });
  if (createErr || !created.user) {
    throw new Error(createErr?.message ?? "auth 계정 생성 실패");
  }

  await ensureRole(labSb, created.user.id, role);
  return created.user.id;
}

async function ensureRole(
  labSb: SupabaseClient,
  userId: string,
  role: "student" | "teacher",
) {
  const { error } = await labSb.from("user_roles").upsert(
    { user_id: userId, role },
    { onConflict: "user_id,role" },
  );
  if (error && !/duplicate|unique/i.test(error.message)) {
    throw new Error(error.message);
  }
}

async function verifyCaller(
  labSb: SupabaseClient,
  orbitSb: SupabaseClient,
  accessToken: string,
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const {
    data: { user },
    error,
  } = await labSb.auth.getUser(accessToken);
  if (error || !user?.id) {
    return { ok: false, error: "인증이 필요합니다." };
  }

  const [{ data: teacherRole }, { data: adminRole }] = await Promise.all([
    labSb.from("user_roles").select("role").eq("user_id", user.id).eq("role", "teacher").maybeSingle(),
    labSb.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle(),
  ]);

  if (teacherRole || adminRole) {
    return { ok: true, userId: user.id };
  }

  const { data: staff } = await orbitSb
    .schema("orbit")
    .from("staff")
    .select("id, active, rank")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (staff?.active && (staff.rank ?? 0) >= 2) {
    return { ok: true, userId: user.id };
  }

  return { ok: false, error: "선생님 또는 Orbit 직원만 실행할 수 있습니다." };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ ok: false, error: "POST only" }, 405);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!accessToken) {
    return json({ ok: false, error: "인증이 필요합니다." }, 401);
  }

  const labUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const labServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const orbitUrl =
    Deno.env.get("ORBIT_SUPABASE_URL") ??
    "https://odyyafiexhebzoodeejl.supabase.co";
  const orbitServiceKey = Deno.env.get("ORBIT_SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!labUrl || !labServiceKey) {
    return json({ ok: false, error: "Lab Supabase 설정 없음" }, 500);
  }
  if (!orbitServiceKey) {
    return json(
      {
        ok: false,
        error:
          "ORBIT_SUPABASE_SERVICE_ROLE_KEY 가 설정되지 않았습니다. Supabase Edge Function secrets에 추가하세요.",
      },
      500,
    );
  }
  if (!orbitUrl.includes(ORBIT_PROJECT_REF)) {
    return json(
      {
        ok: false,
        error: `ORBIT_SUPABASE_URL must be https://${ORBIT_PROJECT_REF}.supabase.co`,
      },
      500,
    );
  }

  const labSb = createServiceClient(labUrl, labServiceKey);
  const orbitSb = createServiceClient(orbitUrl, orbitServiceKey);

  const orbitProbe = await probeOrbitClient(orbitSb);
  if (!orbitProbe.ok) {
    return json({ ok: false, error: orbitProbe.error }, 500);
  }

  // pg_cron/서비스 자동호출 우회 방법:
  // 1) Authorization Bearer 가 서비스 롤 키와 일치
  // 2) X-Cron-Secret 헤더가 SYNC_CRON_SECRET 환경변수와 일치 (pg_cron 용)
  const cronSecret = Deno.env.get("SYNC_CRON_SECRET") ?? "";
  const cronHeader = req.headers.get("x-cron-secret") ?? "";
  const isServiceCall =
    accessToken === labServiceKey || (cronSecret !== "" && cronHeader === cronSecret);

  // pg_cron 이 vault 에서 시크릿을 읽을 수 있도록, 매 호출마다 vault 동기화 (idempotent)
  if (cronSecret) {
    try {
      await labSb.rpc("upsert_cron_secret", { p_secret: cronSecret });
    } catch (_e) {
      // 최초 배포 전이거나 권한 문제일 수 있음 — 동기화 자체는 계속 진행
    }
  }

  if (!isServiceCall) {
    const caller = await verifyCaller(labSb, orbitSb, accessToken);
    if (!caller.ok) {
      return json({ ok: false, error: caller.error }, 403);
    }
  }

  try {
    const stats = {
      teachersSynced: 0,
      studentsSynced: 0,
      studentsSkipped: 0,
      studentsExcluded: 0,
      studentsFailed: 0,
      deactivated: 0,
      classesTotal: 0,
      classesWithDays: 0,
      classesWithTimes: 0,
    };

    if (!(await labHasClassScheduleColumn(labSb))) {
      return json(
        {
          ok: false,
          error:
            "DB에 student_profiles.orbit_class_schedule 컬럼이 없습니다. Lovable SQL Editor에서 아래를 실행한 뒤 다시 동기화하세요:\n\nALTER TABLE public.student_profiles ADD COLUMN IF NOT EXISTS orbit_class_schedule jsonb NULL;",
        },
        400,
      );
    }

    const campusNameById = new Map<string, string>();
    const { data: campuses } = await orbitSb
      .schema("orbit")
      .from("campuses")
      .select("id, name");
    for (const c of campuses ?? []) {
      campusNameById.set(c.id as string, c.name as string);
    }

    await labSb.from("orbit_campus_cache").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (campuses?.length) {
      await labSb.from("orbit_campus_cache").upsert(
        campuses.map((c) => ({ id: c.id, name: c.name })),
      );
    }

    const { data: orbitStaff, error: staffErr } = await orbitSb
      .schema("orbit")
      .from("staff")
      .select(
        "id, name, rank, campus_id, auth_user_id, employee_no, subjects, active",
      )
      .eq("active", true);

    if (staffErr) throw new Error(staffErr.message);

    const englishStaff = ((orbitStaff ?? []) as OrbitStaff[]).filter((s) =>
      (s.subjects ?? []).includes("영어"),
    );

    const staffIdToLabAuth = new Map<string, string>();
    const validStaffIds: string[] = [];

    for (const st of englishStaff) {
      const loginId = String(st.employee_no ?? "")
        .trim()
        .toLowerCase();
      if (!loginId || !/^gwjt\d{3}$/.test(loginId)) continue;

      const labAuthId = await ensureAuthUser(labSb, loginId, st.name, "teacher");
      staffIdToLabAuth.set(st.id, labAuthId);
      validStaffIds.push(st.id);

      await labSb.from("orbit_staff_cache").upsert({
        id: st.id,
        name: st.name,
        rank: st.rank,
        campus_id: st.campus_id,
        campus_name: st.campus_id ? campusNameById.get(st.campus_id) ?? null : null,
        employee_no: loginId,
        subjects: st.subjects ?? ["영어"],
        active: st.active,
        platform_auth_user_id: st.auth_user_id,
        auth_user_id: labAuthId,
        synced_at: new Date().toISOString(),
      });

      stats.teachersSynced += 1;
    }

    // Orbit에서 영어 담당이 아니거나 퇴직한 강사는 캐시에서 제거 (auth 계정은 유지)
    if (validStaffIds.length > 0) {
      await labSb
        .from("orbit_staff_cache")
        .delete()
        .not("id", "in", `(${validStaffIds.map((v) => `"${v}"`).join(",")})`);
    }

    let orbitClasses: OrbitClassRow[] | null = null;
    {
      const withSchedule = await orbitSb
        .schema("orbit")
        .from("v_class_filter_options")
        .select(
          "class_id, class_name, filter_label, schedule_label, schedule, subject",
        )
        .eq("subject", "영어");
      if (withSchedule.error) {
        // schedule 컬럼/라벨 없는 구버전 뷰 대비
        const fallback = await orbitSb
          .schema("orbit")
          .from("v_class_filter_options")
          .select("class_id, class_name, filter_label, subject")
          .eq("subject", "영어");
        if (
          fallback.error &&
          !/schema|v_class_filter|does not exist/i.test(fallback.error.message)
        ) {
          throw new Error(fallback.error.message);
        }
        if (
          withSchedule.error &&
          !fallback.data?.length &&
          !/schema|v_class_filter|does not exist|column|schedule/i.test(
            withSchedule.error.message,
          )
        ) {
          throw new Error(withSchedule.error.message);
        }
        orbitClasses = (fallback.data ?? []) as OrbitClassRow[];
      } else {
        orbitClasses = (withSchedule.data ?? []) as OrbitClassRow[];
      }
    }

    const classById = new Map<string, OrbitClassRow>();
    for (const c of orbitClasses ?? []) {
      classById.set(c.class_id, c);
    }

    // 반 요일·시간표: classes.schedule jsonb 우선 → 라벨 파싱
    const classScheduleById = await loadClassScheduleById(orbitSb);
    let classesWithTimes = 0;
    let classesWithDays = 0;
    for (const row of classById.values()) {
      const fromJson = parseOrbitScheduleJson(row.schedule);
      const fromDb = classScheduleById.get(row.class_id) ?? null;
      const fromLabel =
        parseScheduleFromLabel(row.schedule_label) ??
        parseScheduleFromLabel(row.filter_label) ??
        parseScheduleFromLabel(row.class_name);

      const days =
        (fromJson?.days?.length ? fromJson.days : null) ??
        (fromDb?.days?.length ? fromDb.days : null) ??
        (fromLabel?.days?.length ? fromLabel.days : null) ??
        parseDaysFromLabel(row.class_name) ??
        parseDaysFromLabel(row.filter_label) ??
        null;

      const times =
        (fromJson && Object.keys(fromJson.times).length > 0
          ? fromJson.times
          : null) ??
        (fromDb && Object.keys(fromDb.times).length > 0 ? fromDb.times : null) ??
        (fromLabel && Object.keys(fromLabel.times).length > 0
          ? fromLabel.times
          : null);

      row.days = days;
      row.times = times;
      if (days?.length) classesWithDays += 1;
      if (times && Object.keys(times).length > 0) classesWithTimes += 1;
    }
    stats.classesWithDays = classesWithDays;
    stats.classesWithTimes = classesWithTimes;
    stats.classesTotal = classById.size;

    const englishStudentIds = await loadEnglishStudentIds(orbitSb);

    const { data: orbitStudents, error: osErr } = await orbitSb
      .schema("orbit")
      .from("students")
      .select("id, hakbun, name, grade, status, subjects, campus_id");

    if (osErr) throw new Error(osErr.message);

    const orbitActiveHakbuns = new Set<string>();
    for (const row of (orbitStudents ?? []) as OrbitStudent[]) {
      const hakbun = String(row.hakbun ?? "").trim().toLowerCase();
      if (!hakbun || !/^gwj\d{4}$/.test(hakbun)) continue;
      if (!isEngEligible(row, englishStudentIds)) continue;
      if (!coalesceStatus(row.status)) continue;
      orbitActiveHakbuns.add(hakbun);
    }

    for (const row of (orbitStudents ?? []) as OrbitStudent[]) {
      const hakbun = String(row.hakbun ?? "").trim().toLowerCase();
      if (!hakbun || !/^gwj\d{4}$/.test(hakbun)) {
        stats.studentsSkipped += 1;
        continue;
      }

      if (!isEngEligible(row, englishStudentIds)) {
        if (await deactivateOrbitStudentByHakbun(labSb, hakbun)) stats.deactivated += 1;
        stats.studentsExcluded += 1;
        continue;
      }

      if (!coalesceStatus(row.status)) {
        if (await deactivateOrbitStudentByHakbun(labSb, hakbun)) stats.deactivated += 1;
        stats.studentsExcluded += 1;
        continue;
      }

      try {
        const teacherStaffId = await resolveEnglishTeacherStaffId(orbitSb, row.id);
        const teacherAuthId = teacherStaffId
          ? staffIdToLabAuth.get(teacherStaffId) ?? null
          : null;

        const engClass = await resolveEnglishClass(orbitSb, row.id, classById);
        const campusName = row.campus_id
          ? campusNameById.get(row.campus_id) ?? null
          : null;

        const userId = await ensureAuthUser(labSb, hakbun, row.name, "student");

        const patch: Record<string, unknown> = {
          display_name: row.name,
          campus: campusName,
          school_name: null,
          actual_grade: row.grade,
          teacher_id: teacherAuthId,
          orbit_class_id: engClass?.class_id ?? null,
          orbit_class_name: engClass?.class_name ?? engClass?.filter_label ?? null,
          orbit_class_days:
            engClass?.days && engClass.days.length > 0 ? engClass.days : null,
          orbit_class_schedule:
            engClass?.times && Object.keys(engClass.times).length > 0
              ? engClass.times
              : null,
          orbit_enrollment_active: true,
        };

        const { data: existing } = await labSb
          .from("student_profiles")
          .select("user_id")
          .eq("user_id", userId)
          .maybeSingle();

        if (existing) {
          // 기존 프로필: start_level/current_level 은 건드리지 않음 (원장 수동 조정 보존)
          let { error: uErr } = await labSb
            .from("student_profiles")
            .update(patch)
            .eq("user_id", userId);
          // 마이그레이션 전: schedule 컬럼 없으면 요일만이라도 저장
          if (uErr && /orbit_class_schedule/i.test(uErr.message)) {
            const { orbit_class_schedule: _drop, ...rest } = patch;
            ({ error: uErr } = await labSb
              .from("student_profiles")
              .update(rest)
              .eq("user_id", userId));
          }
          if (uErr) throw new Error(uErr.message);
        } else {
          // 신규 프로필: 오르빗 학년으로 초기 레벨 자동 배정 (L03/L07 제외, 매핑 없으면 미설정)
          const autoLevel = gradeToStartLevel(row.grade);
          const insertRow: Record<string, unknown> = {
            user_id: userId,
            student_no: hakbun,
            ...patch,
          };
          if (autoLevel) {
            insertRow.start_level = autoLevel;
            insertRow.current_level = autoLevel;
          }
          let { error: iErr } = await labSb
            .from("student_profiles")
            .upsert(insertRow, { onConflict: "user_id" });
          if (iErr && /orbit_class_schedule/i.test(iErr.message)) {
            const { orbit_class_schedule: _drop, ...rest } = insertRow;
            ({ error: iErr } = await labSb
              .from("student_profiles")
              .upsert(rest, { onConflict: "user_id" }));
          }
          if (iErr) throw new Error(iErr.message);
        }

        stats.studentsSynced += 1;
      } catch (e) {
        stats.studentsFailed += 1;
        console.warn(`[sync-orbit-english] ${hakbun}:`, e);
      }
    }

    const { data: labActiveRows, error: labActiveErr } = await labSb
      .from("student_profiles")
      .select("student_no")
      .eq("orbit_enrollment_active", true)
      .like("student_no", "gwj%");
    if (labActiveErr) throw new Error(labActiveErr.message);

    for (const row of labActiveRows ?? []) {
      const hakbun = String(row.student_no ?? "").trim().toLowerCase();
      if (!hakbun || orbitActiveHakbuns.has(hakbun)) continue;
      if (await deactivateOrbitStudentByHakbun(labSb, hakbun)) stats.deactivated += 1;
    }

    return json({ ok: true, ...stats });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "동기화 실패";
    return json({ ok: false, error: msg }, 500);
  }
});

function coalesceStatus(status: string | null): boolean {
  return coalesceStatusRaw(status) !== "inactive";
}

function coalesceStatusRaw(status: string | null): "active" | "inactive" {
  const normalized = String(status ?? "").trim().replace(/\s+/g, "");
  if (
    normalized.includes("휴원") ||
    normalized.includes("퇴원") ||
    normalized.includes("탈퇴") ||
    normalized.includes("중단") ||
    /^(inactive|withdrawn|withdraw|suspended|leave)$/i.test(normalized)
  ) return "inactive";
  return "active";
}

// Edge Function: sync-orbit-english
// Platform Orbit(odyyafiexhebzoodeejl) → lab student_profiles / auth / staff cache
// 영어과 학생·선생님·반만 동기화, 로그인 정책 동일 (gwj#### / gwjt### + default password)
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";

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
  subject: string | null;
};

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
    await labSb.auth.admin.updateUserById(existing.id, {
      user_metadata: {
        student_no: loginId,
        display_name: displayName,
      },
    });
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

  const caller = await verifyCaller(labSb, orbitSb, accessToken);
  if (!caller.ok) {
    return json({ ok: false, error: caller.error }, 403);
  }

  try {
    const stats = {
      teachersSynced: 0,
      studentsSynced: 0,
      studentsSkipped: 0,
      studentsExcluded: 0,
      studentsFailed: 0,
      deactivated: 0,
    };

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

    for (const st of englishStaff) {
      const loginId = String(st.employee_no ?? "")
        .trim()
        .toLowerCase();
      if (!loginId || !/^gwjt\d{3}$/.test(loginId)) continue;

      const labAuthId = await ensureAuthUser(labSb, loginId, st.name, "teacher");
      staffIdToLabAuth.set(st.id, labAuthId);

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

    const { data: orbitClasses, error: classErr } = await orbitSb
      .schema("orbit")
      .from("v_class_filter_options")
      .select("class_id, class_name, filter_label, subject")
      .eq("subject", "영어");

    if (classErr && !/schema|v_class_filter|does not exist/i.test(classErr.message)) {
      throw new Error(classErr.message);
    }

    const classById = new Map<string, OrbitClassRow>();
    for (const c of (orbitClasses ?? []) as OrbitClassRow[]) {
      classById.set(c.class_id, c);
    }

    const englishStudentIds = await loadEnglishStudentIds(orbitSb);

    const { data: orbitStudents, error: osErr } = await orbitSb
      .schema("orbit")
      .from("students")
      .select("id, hakbun, name, grade, status, subjects, campus_id");

    if (osErr) throw new Error(osErr.message);

    for (const row of (orbitStudents ?? []) as OrbitStudent[]) {
      const hakbun = String(row.hakbun ?? "").trim().toLowerCase();
      if (!hakbun || !/^gwj\d{4}$/.test(hakbun)) {
        stats.studentsSkipped += 1;
        continue;
      }

      if (!isEngEligible(row, englishStudentIds)) {
        stats.studentsExcluded += 1;
        continue;
      }

      if (!coalesceStatus(row.status)) {
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
        };

        const { data: existing } = await labSb
          .from("student_profiles")
          .select("user_id")
          .eq("user_id", userId)
          .maybeSingle();

        if (existing) {
          const { error: uErr } = await labSb
            .from("student_profiles")
            .update(patch)
            .eq("user_id", userId);
          if (uErr) throw new Error(uErr.message);
        } else {
          const { error: iErr } = await labSb.from("student_profiles").upsert(
            {
              user_id: userId,
              student_no: hakbun,
              ...patch,
            },
            { onConflict: "user_id" },
          );
          if (iErr) throw new Error(iErr.message);
        }

        stats.studentsSynced += 1;
      } catch (e) {
        stats.studentsFailed += 1;
        console.warn(`[sync-orbit-english] ${hakbun}:`, e);
      }
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
  if (status === "휴원" || status === "퇴원") return "inactive";
  return "active";
}

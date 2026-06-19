// Edge Function: reset-teacher-password
// admin만 선생님 Auth 비밀번호를 초기값(아이디+마지막 숫자)으로 재설정
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";

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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

/** 512 / t512 / gwjt512 → gwjt512 */
function normalizeTeacherLoginId(raw: string): string | null {
  let v = raw.trim().toLowerCase().replace(/^gwj/, "");
  if (/^t\d+$/.test(v)) {
    v = v.slice(1);
  }
  v = v.replace(/\D/g, "");
  if (v.length === 0 || v.length > 3) return null;
  return `gwjt${v.padStart(3, "0")}`;
}

async function findUserByEmail(
  admin: ReturnType<typeof createClient>,
  email: string,
) {
  const target = email.toLowerCase();
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => (u.email ?? "").toLowerCase() === target);
    if (found) return found;
    if (data.users.length < 200) break;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SUPABASE_ANON =
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!SUPABASE_URL || !SUPABASE_ANON || !SERVICE_ROLE) {
      return json({ error: "Server misconfigured" }, 500);
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);

    const admin = createServiceClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: roleRows, error: roleErr } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id);
    if (roleErr) return json({ error: roleErr.message }, 500);
    const roles = (roleRows ?? []).map((r) => r.role);
    if (!roles.includes("admin")) {
      return json({ error: "Forbidden: admin only" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const userId = typeof body?.userId === "string" ? body.userId.trim() : "";
    const loginIdRaw = typeof body?.loginId === "string" ? body.loginId.trim() : "";

    let targetUser: { id: string; email?: string } | null = null;
    let loginId: string | null = null;

    if (userId) {
      const { data, error } = await admin.auth.admin.getUserById(userId);
      if (error || !data.user) {
        return json({ error: "해당 사용자를 찾을 수 없습니다." }, 404);
      }
      targetUser = data.user;
      const emailLocal = (data.user.email ?? "").split("@")[0]?.toLowerCase() ?? "";
      loginId = normalizeTeacherLoginId(emailLocal) ?? emailLocal;
      if (!/^gwjt\d{3}$/.test(loginId)) {
        return json({ error: "선생님 계정(gwjt###)만 초기화할 수 있습니다." }, 400);
      }
    } else if (loginIdRaw) {
      loginId = normalizeTeacherLoginId(loginIdRaw);
      if (!loginId) {
        return json({ error: "번호 형식이 올바르지 않습니다 (예: 512, t512, gwjt512)" }, 400);
      }
      const email = loginIdToEmail(loginId);
      targetUser = await findUserByEmail(admin, email);
      if (!targetUser) {
        return json({ error: `${loginId} 계정이 없습니다. Orbit 동기화를 먼저 실행하세요.` }, 404);
      }
    } else {
      return json({ error: "userId 또는 loginId가 필요합니다." }, 400);
    }

    const password = defaultPassword(loginId!);
    const { error: updateErr } = await admin.auth.admin.updateUserById(targetUser!.id, {
      password,
    });
    if (updateErr) return json({ error: updateErr.message }, 500);

    const displayName =
      typeof targetUser!.user_metadata?.display_name === "string"
        ? targetUser!.user_metadata.display_name
        : typeof targetUser!.user_metadata?.name === "string"
          ? targetUser!.user_metadata.name
          : null;

    return json({
      ok: true,
      loginId,
      password,
      email: loginIdToEmail(loginId!),
      name: displayName,
      userId: targetUser!.id,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg }, 500);
  }
});

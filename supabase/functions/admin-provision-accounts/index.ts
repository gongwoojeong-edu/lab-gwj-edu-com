// One-shot admin utility: create/repair specific accounts and reset default passwords.
// Only callable by admin users.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.50.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

function createServiceClient(url: string, key: string): SupabaseClient {
  const k = key.trim();
  const opaque = k.startsWith("sb_secret_") || k.startsWith("sb_publishable_");
  if (!opaque) {
    return createClient(url, k, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return createClient(url, k, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: { apikey: k },
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        h.set("apikey", k);
        const auth = h.get("authorization") ?? "";
        const bearer = auth.replace(/^Bearer\s+/i, "").trim();
        if (bearer === k || (!bearer.startsWith("eyJ") && bearer.length > 0)) h.delete("authorization");
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

async function findByEmail(admin: SupabaseClient, email: string) {
  const target = email.toLowerCase();
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const f = data.users.find((u) => (u.email ?? "").toLowerCase() === target);
    if (f) return f;
    if (data.users.length < 200) break;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const ANON = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!SUPABASE_URL || !ANON || !SERVICE) return json({ error: "misconfigured" }, 500);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const userClient = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: ud, error: ue } = await userClient.auth.getUser();
  if (ue || !ud.user) return json({ error: "Unauthorized" }, 401);

  const admin = createServiceClient(SUPABASE_URL, SERVICE);
  const { data: rr } = await admin.from("user_roles").select("role").eq("user_id", ud.user.id);
  if (!(rr ?? []).some((r) => r.role === "admin")) return json({ error: "admin only" }, 403);

  const body = await req.json().catch(() => ({}));
  const items: Array<{ loginId: string; displayName?: string; role: "student" | "teacher" }> =
    Array.isArray(body?.accounts) ? body.accounts : [];

  const results: unknown[] = [];
  for (const it of items) {
    const loginId = String(it.loginId ?? "").trim().toLowerCase();
    const role = it.role === "teacher" ? "teacher" : "student";
    const displayName = String(it.displayName ?? loginId);
    const email = `${loginId}@gwj.local`;
    const password = defaultPassword(loginId);
    try {
      let user = await findByEmail(admin, email);
      let action: "created" | "updated" = "updated";
      if (!user) {
        const { data: c, error: ce } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { student_no: loginId, display_name: displayName },
        });
        if (ce || !c.user) throw new Error(ce?.message ?? "create failed");
        user = c.user;
        action = "created";
      } else {
        const { error: upe } = await admin.auth.admin.updateUserById(user.id, {
          password,
          user_metadata: { ...user.user_metadata, student_no: loginId, display_name: displayName },
        });
        if (upe) throw new Error(upe.message);
      }
      await admin.from("user_roles").upsert({ user_id: user.id, role }, { onConflict: "user_id,role" });
      results.push({ loginId, role, action, userId: user.id, email, password });
    } catch (e) {
      results.push({ loginId, role, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return json({ ok: true, results });
});

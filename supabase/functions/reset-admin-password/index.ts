// One-off: reset admin (gwj0000) password. Guarded by shared bootstrap header
// that matches SUPABASE_SERVICE_ROLE_KEY (only backend callers can supply it).
import { createClient } from "npm:@supabase/supabase-js@2.50.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-bootstrap",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const bootstrap = req.headers.get("x-bootstrap") ?? "";
  if (!SERVICE || bootstrap !== SERVICE) return json({ error: "Forbidden" }, 403);

  const body = await req.json().catch(() => ({}));
  const password = String(body?.password ?? "");
  const email = String(body?.email ?? "gwj0000@gwj.local").toLowerCase();
  if (password.length < 6) return json({ error: "password too short" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

  // find user by email
  let target: { id: string; email?: string | null } | null = null;
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return json({ error: error.message }, 500);
    const f = data.users.find((u) => (u.email ?? "").toLowerCase() === email);
    if (f) { target = f; break; }
    if (data.users.length < 200) break;
  }
  if (!target) return json({ error: "user not found" }, 404);

  // ensure target is admin
  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", target.id);
  if (!(roles ?? []).some((r) => r.role === "admin")) return json({ error: "target is not admin" }, 403);

  const { error: upErr } = await admin.auth.admin.updateUserById(target.id, { password });
  if (upErr) return json({ error: upErr.message }, 500);

  return json({ ok: true, userId: target.id, email });
});

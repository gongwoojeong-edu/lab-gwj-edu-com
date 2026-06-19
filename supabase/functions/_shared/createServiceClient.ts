import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";

/** Legacy JWT(eyJ…) or opaque sb_secret_ — both work for admin/service REST. */
export function createServiceClient(url: string, serviceKey: string): SupabaseClient {
  const key = serviceKey.trim();
  const isOpaqueKey = key.startsWith("sb_secret_") || key.startsWith("sb_publishable_");

  if (!isOpaqueKey) {
    return createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  // Opaque secret keys must use apikey header only; Bearer with non-JWT → "Invalid API key".
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

export async function probeOrbitClient(
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

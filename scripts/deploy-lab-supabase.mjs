// lab Supabase: migrations + Edge Function + secrets
// 실행: node scripts/deploy-lab-supabase.mjs
//
// 1) scripts/db-password.local — lab DB password
// 2) Supabase CLI 로그인 + vyiwfkctilezvpafqjek 프로젝트 접근 권한
//    (Lovable Cloud 프로젝트는 별도 org — CLI 403 시 Lovable 대시보드에서 수동 배포)
// 3) Orbit platform service role: ../gwj-orbit/scripts/service-role.local (선택)

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PROJECT_REF = "vyiwfkctilezvpafqjek";

function run(cmd, args, opts = {}) {
  console.log(`\n> ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: "inherit",
    shell: process.platform === "win32",
    ...opts,
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function loadOrbitServiceRole() {
  const env = process.env.ORBIT_SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (env) return env;
  const f = join(__dirname, "..", "..", "gwj-orbit", "scripts", "service-role.local");
  if (!existsSync(f)) return null;
  return readFileSync(f, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith("#"));
}

console.log("=== 1/3 DB migrations ===");
run("node", [join(__dirname, "apply-lab-migrations.mjs")]);

console.log("\n=== 2/3 Edge Function deploy ===");
run("npx", ["supabase", "functions", "deploy", "sync-orbit-english", "--project-ref", PROJECT_REF]);

console.log("\n=== 3/3 Edge Function secrets ===");
const orbitKey = loadOrbitServiceRole();
if (!orbitKey) {
  console.warn(
    "[경고] ORBIT_SUPABASE_SERVICE_ROLE_KEY 없음 — secrets 수동 설정 필요:\n" +
      "  npx supabase secrets set ORBIT_SUPABASE_URL=https://odyyafiexhebzoodeejl.supabase.co ORBIT_SUPABASE_SERVICE_ROLE_KEY=<key> --project-ref vyiwfkctilezvpafqjek",
  );
  process.exit(0);
}

run("npx", [
  "supabase",
  "secrets",
  "set",
  `ORBIT_SUPABASE_URL=https://odyyafiexhebzoodeejl.supabase.co`,
  `ORBIT_SUPABASE_SERVICE_ROLE_KEY=${orbitKey}`,
  "--project-ref",
  PROJECT_REF,
]);

console.log("\n배포 완료. /teacher/integrations → 「Orbit 영어과 동기화」로 테스트하세요.");

// lab Supabase(vyiwfkctilezvpafqjek) — pending migrations 일괄 적용
// 실행: node scripts/apply-lab-migrations.mjs
// 필요: scripts/db-password.local 또는 SUPABASE_DB_PASSWORD

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_REF = "vyiwfkctilezvpafqjek";

const MIGRATION_FILES = [
  "20260605120000_orbit_english_sync.sql",
  "20260605140000_unit_workflow_policy.sql",
];

function loadDbPassword() {
  if (process.env.SUPABASE_DB_PASSWORD) return process.env.SUPABASE_DB_PASSWORD.trim();
  const f = join(__dirname, "db-password.local");
  if (!existsSync(f)) return null;
  return readFileSync(f, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith("#"));
}

const password = loadDbPassword();
if (!password) {
  console.error("[중단] scripts/db-password.local 또는 SUPABASE_DB_PASSWORD 필요");
  console.error("  Lovable Cloud → Supabase → Database password");
  process.exit(1);
}

const urls = [
  process.env.DATABASE_URL,
  `postgresql://postgres:${encodeURIComponent(password)}@db.${PROJECT_REF}.supabase.co:5432/postgres`,
  `postgresql://postgres.${PROJECT_REF}:${encodeURIComponent(password)}@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres`,
  `postgresql://postgres.${PROJECT_REF}:${encodeURIComponent(password)}@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres`,
].filter(Boolean);

const { default: postgres } = await import("postgres");

let db;
for (const url of urls) {
  const candidate = postgres(url, { ssl: "require", max: 1, connect_timeout: 15 });
  try {
    await candidate`select 1 as ok`;
    console.log("Connected:", url.replace(/:[^:@]+@/, ":***@"));
    db = candidate;
    break;
  } catch (e) {
    console.error("Failed:", url.replace(/:[^:@]+@/, ":***@"), "-", e.message);
    await candidate.end().catch(() => {});
  }
}

if (!db) {
  console.error("[중단] DB 연결 실패 — 비밀번호를 확인하세요.");
  process.exit(1);
}

console.log(`Applying ${MIGRATION_FILES.length} lab migrations…\n`);

try {
  for (const file of MIGRATION_FILES) {
    const path = join(__dirname, "..", "supabase", "migrations", file);
    if (!existsSync(path)) {
      console.error(`[중단] 파일 없음: ${path}`);
      process.exit(1);
    }
    const sql = readFileSync(path, "utf8");
    console.log(`Applying ${file} …`);
    await db.unsafe(sql);
    console.log(`  ✓ ${file}`);
  }
  console.log("\nDB 마이그레이션 적용 완료.");
} catch (e) {
  console.error("\n적용 실패:", e.message);
  process.exit(1);
} finally {
  await db.end();
}

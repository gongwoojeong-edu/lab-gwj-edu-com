/**
 * Orbit(공유 DB) → lab DB 영어과 선생님 1명 계정 생성 (Edge Function 배포 전 로컬용)
 *
 * node scripts/provision-lab-teacher.mjs gwjt512
 * node scripts/provision-lab-teacher.mjs --all-english
 *
 * 필요:
 *   scripts/lab-service-role.local  — lab vyiwfkctilezvpafqjek service_role
 *   ../gwj-orbit/scripts/service-role.local — platform odyyafiexhebzoodeejl (Orbit 조회용)
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LAB_URL = "https://vyiwfkctilezvpafqjek.supabase.co";
const ORBIT_URL = "https://odyyafiexhebzoodeejl.supabase.co";
const EMAIL_DOMAIN = "gwj.local";

function loadKey(file, envName) {
  if (process.env[envName]) return process.env[envName].trim();
  if (!existsSync(file)) return null;
  return readFileSync(file, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith("#"));
}

function defaultPassword(loginId) {
  const t = loginId.trim().toLowerCase();
  const last = t.match(/\d$/)?.[0];
  return last ? `${t}${last}` : t;
}

function normalizeTeacherId(raw) {
  let v = raw.trim().toLowerCase();
  if (v.startsWith("gwjt")) v = v.slice(4);
  else if (v.startsWith("gwj")) v = v.slice(3).replace(/^t/, "");
  v = v.replace(/\D/g, "");
  if (!v) return null;
  return `gwjt${v.padStart(3, "0")}`;
}

async function findUserByEmail(admin, email) {
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

async function ensureTeacher(labAdmin, loginId, displayName) {
  const email = `${loginId}@${EMAIL_DOMAIN}`;
  const password = defaultPassword(loginId);

  let user = await findUserByEmail(labAdmin, email);
  if (!user) {
    const { data, error } = await labAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { student_no: loginId, display_name: displayName },
    });
    if (error) throw new Error(`${email} 생성 실패: ${error.message}`);
    user = data.user;
    console.log(`+ 생성 ${displayName} (${email})`);
  } else {
    const { error } = await labAdmin.auth.admin.updateUserById(user.id, { password });
    if (error) throw new Error(`${email} 비밀번호 갱신 실패: ${error.message}`);
    console.log(`✓ 갱신 ${displayName} (${email})`);
  }

  const { error: roleErr } = await labAdmin.from("user_roles").upsert(
    { user_id: user.id, role: "teacher" },
    { onConflict: "user_id,role" },
  );
  if (roleErr) console.warn(`  ⚠ user_roles: ${roleErr.message}`);

  console.log(`  로그인: 선생님 탭 → ${loginId.replace(/^gwjt/, "")} / 비밀번호 ${password}`);
  return user.id;
}

async function fetchOrbitEnglishStaff(orbitSb, loginIdFilter) {
  const { data, error } = await orbitSb
    .schema("orbit")
    .from("staff")
    .select("id, name, employee_no, subjects, active")
    .eq("active", true);
  if (error) throw error;

  return (data ?? []).filter((s) => {
    const emp = (s.employee_no ?? "").trim().toLowerCase();
    if (!emp.startsWith("gwjt")) return false;
    const subs = s.subjects ?? [];
    const english = subs.length === 0 || subs.some((x) => /영어|english/i.test(String(x)));
    if (!english) return false;
    if (loginIdFilter) {
      const id = normalizeTeacherId(loginIdFilter);
      return id && emp === id;
    }
    return true;
  });
}

async function main() {
  const labKey = loadKey(join(__dirname, "lab-service-role.local"), "LAB_SUPABASE_SERVICE_ROLE_KEY");
  const orbitKey = loadKey(
    join(__dirname, "..", "..", "gwj-orbit", "scripts", "service-role.local"),
    "ORBIT_SUPABASE_SERVICE_ROLE_KEY",
  );

  if (!labKey) {
    console.error("[중단] scripts/lab-service-role.local 필요 (lab service_role)");
    console.error("  Lovable → Cloud → Supabase → Settings → API");
    process.exit(1);
  }
  if (!orbitKey) {
    console.error("[중단] gwj-orbit/scripts/service-role.local 필요 (Orbit 조회)");
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const allEnglish = args.includes("--all-english");
  const rawId = args.find((a) => !a.startsWith("--"));

  if (!allEnglish && !rawId) {
    console.error("Usage: node scripts/provision-lab-teacher.mjs gwjt512");
    console.error("       node scripts/provision-lab-teacher.mjs --all-english");
    process.exit(1);
  }

  const labAdmin = createClient(LAB_URL, labKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const orbitSb = createClient(ORBIT_URL, orbitKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const staffList = await fetchOrbitEnglishStaff(orbitSb, allEnglish ? null : rawId);

  if (staffList.length === 0) {
    console.error("[중단] Orbit에서 해당 영어과 선생님을 찾지 못했습니다.");
    process.exit(1);
  }

  console.log(`Orbit → lab 계정 ${staffList.length}명 처리…\n`);
  for (const s of staffList) {
    const loginId = normalizeTeacherId(s.employee_no ?? "");
    if (!loginId) continue;
    await ensureTeacher(labAdmin, loginId, s.name);
  }
  console.log("\n완료. lab.gwj-edu.com / localhost 에서 로그인해 보세요.");
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});

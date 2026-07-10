/**
 * 구문랩 DB: 유닛(및 소속 지문)을 다른 시리즈/권으로 이동
 *
 * node scripts/move-units.mjs \
 *   --level L06 \
 *   --from-series "M3 천재이재영" \
 *   --from-volume "5과" \
 *   --units "1번,2번,3번,4번" \
 *   --to-series "M3 동아이병민" \
 *   --to-volume "5과"
 *
 * 필요: scripts/lab-service-role.local (또는 LAB_SERVICE_ROLE_KEY 환경변수)
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LAB_URL = "https://vyiwfkctilezvpafqjek.supabase.co";

function loadKey() {
  if (process.env.LAB_SERVICE_ROLE_KEY) return process.env.LAB_SERVICE_ROLE_KEY.trim();
  const file = join(__dirname, "lab-service-role.local");
  if (!existsSync(file)) return null;
  return readFileSync(file, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith("#"));
}

function arg(name, fallback = "") {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function norm(s) {
  return (s || "").replace(/\s+/g, "").toLowerCase();
}

async function findSeries(admin, level, title) {
  const { data, error } = await admin
    .from("textbook_series")
    .select("id, title, series_no, level")
    .eq("level", level);
  if (error) throw error;
  const hit =
    (data || []).find((s) => s.title === title) ||
    (data || []).find((s) => norm(s.title) === norm(title)) ||
    (data || []).find((s) => norm(s.title).includes(norm(title)) || norm(title).includes(norm(s.title)));
  return hit || null;
}

async function findTextbook(admin, seriesId, title) {
  const { data, error } = await admin
    .from("textbooks")
    .select("id, title, volume_no, series_id")
    .eq("series_id", seriesId);
  if (error) throw error;
  const hit =
    (data || []).find((t) => t.title === title) ||
    (data || []).find((t) => norm(t.title) === norm(title));
  return hit || null;
}

async function findUnits(admin, textbookId, unitTitles) {
  const { data, error } = await admin
    .from("textbook_units")
    .select("id, title, unit_no, textbook_id")
    .eq("textbook_id", textbookId);
  if (error) throw error;
  const out = [];
  for (const want of unitTitles) {
    const hit =
      (data || []).find((u) => u.title === want) ||
      (data || []).find((u) => norm(u.title) === norm(want));
    if (!hit) throw new Error(`유닛 "${want}" 을(를) 찾지 못했습니다 (textbook_id=${textbookId})`);
    out.push(hit);
  }
  return out;
}

async function moveUnit(admin, unitId, newTextbookId) {
  const { error: uErr } = await admin
    .from("textbook_units")
    .update({ textbook_id: newTextbookId })
    .eq("id", unitId);
  if (uErr) throw uErr;

  const { error: pErr } = await admin
    .from("textbook_passages")
    .update({ textbook_id: newTextbookId })
    .eq("unit_id", unitId);
  if (pErr) throw pErr;
}

async function main() {
  const key = loadKey();
  if (!key) {
    console.error(
      "❌ lab service role key 없음.\n" +
        "   scripts/lab-service-role.local 파일을 만들거나 LAB_SERVICE_ROLE_KEY 환경변수를 설정하세요.\n" +
        "   (Lovable → Supabase → Settings → API → Secret key)",
    );
    process.exit(1);
  }

  const level = (arg("--level", "L06") || "L06").toUpperCase();
  const fromSeries = arg("--from-series", "M3 천재이재영");
  const fromVolume = arg("--from-volume", "5과");
  const toSeries = arg("--to-series", "M3 동아이병민");
  const toVolume = arg("--to-volume", "5과");
  const unitsRaw = arg("--units", "1번,2번,3번,4번");
  const unitTitles = unitsRaw.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
  const dryRun = process.argv.includes("--dry-run");

  const admin = createClient(LAB_URL, key, { auth: { persistSession: false } });

  console.log("🔍 조회 중...");
  console.log(`   FROM: ${level} › ${fromSeries} › ${fromVolume} › [${unitTitles.join(", ")}]`);
  console.log(`   TO:   ${level} › ${toSeries} › ${toVolume}`);

  const srcSeries = await findSeries(admin, level, fromSeries);
  if (!srcSeries) throw new Error(`출발 시리즈 "${fromSeries}" (${level}) 없음`);
  const srcTb = await findTextbook(admin, srcSeries.id, fromVolume);
  if (!srcTb) throw new Error(`출발 권 "${fromVolume}" (series=${srcSeries.title}) 없음`);

  const dstSeries = await findSeries(admin, level, toSeries);
  if (!dstSeries) throw new Error(`도착 시리즈 "${toSeries}" (${level}) 없음 — 먼저 생성 필요`);
  const dstTb = await findTextbook(admin, dstSeries.id, toVolume);
  if (!dstTb) throw new Error(`도착 권 "${toVolume}" (series=${dstSeries.title}) 없음 — 먼저 생성 필요`);

  const units = await findUnits(admin, srcTb.id, unitTitles);

  console.log("\n📋 이동 대상:");
  for (const u of units) {
    const { count } = await admin
      .from("textbook_passages")
      .select("id", { count: "exact", head: true })
      .eq("unit_id", u.id);
    console.log(`   • ${u.title} (unit_id=${u.id}, 지문 ${count ?? 0}건)`);
  }

  if (dryRun) {
    console.log("\n✅ --dry-run: DB 변경 없음");
    return;
  }

  for (const u of units) {
    await moveUnit(admin, u.id, dstTb.id);
    console.log(`✓ ${u.title} → ${toSeries} / ${toVolume}`);
  }

  console.log(`\n✅ ${units.length}개 유닛 이동 완료`);
  console.log(`   구문랩: ${level} › ${toSeries} › ${toVolume}`);
}

main().catch((e) => {
  console.error("❌", e.message || e);
  process.exit(1);
});

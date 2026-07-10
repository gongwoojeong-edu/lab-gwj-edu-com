/**
 * 유닛별 중복 textbook_passages 삭제 (앞쪽 passage_no 유지)
 *
 * node scripts/delete-duplicate-passages.mjs --dry-run
 * node scripts/delete-duplicate-passages.mjs --level L06
 *
 * 필요: scripts/lab-service-role.local
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

function normEn(s) {
  return (s ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function normCode(code) {
  return (code ?? "").trim().toLowerCase().replace(/-alt\d+/gi, "");
}

function dedupeKey(p) {
  const en = normEn(p.english);
  if (en.length > 8) return `en:${en}`;
  const c = normCode(p.code);
  if (c) return `code:${c}`;
  return `id:${p.id}`;
}

async function main() {
  const key = loadKey();
  if (!key) {
    console.error("❌ scripts/lab-service-role.local 필요");
    process.exit(1);
  }

  const levelFilter = arg("--level", "");
  const dryRun = process.argv.includes("--dry-run");
  const admin = createClient(LAB_URL, key, { auth: { persistSession: false } });

  let unitQuery = admin
    .from("textbook_units")
    .select("id, title, unit_no, textbook_id, textbooks!inner(id, title, level, series_id, textbook_series!inner(level, title))");

  const { data: units, error: uErr } = await unitQuery;
  if (uErr) throw uErr;

  const filtered = (units ?? []).filter((u) => {
    if (!levelFilter) return true;
    const tb = u.textbooks;
    return tb?.level === levelFilter || tb?.textbook_series?.level === levelFilter;
  });

  console.log(`🔍 유닛 ${filtered.length}개 검사${levelFilter ? ` (${levelFilter})` : ""}...`);

  let totalDelete = 0;
  const report = [];

  for (const u of filtered) {
    const { data: passages, error: pErr } = await admin
      .from("textbook_passages")
      .select("id, code, english, passage_no, unit_id")
      .eq("unit_id", u.id)
      .order("passage_no", { ascending: true });
    if (pErr) throw pErr;
    if (!passages?.length) continue;

    const seen = new Set();
    const deleteIds = [];
    for (const p of passages) {
      const key = dedupeKey(p);
      if (seen.has(key)) deleteIds.push(p.id);
      else seen.add(key);
    }

    if (deleteIds.length === 0) continue;

    const tb = u.textbooks;
    const series = tb?.textbook_series?.title ?? "";
    const label = `${tb?.level ?? "?"} › ${series} › ${tb?.title ?? "?"} › ${u.title}`;
    report.push({ label, count: deleteIds.length, ids: deleteIds });
    totalDelete += deleteIds.length;

    if (!dryRun) {
      const { error: dErr } = await admin.from("textbook_passages").delete().in("id", deleteIds);
      if (dErr) throw dErr;
    }
  }

  if (report.length === 0) {
    console.log("✅ 삭제할 중복 없음");
    return;
  }

  for (const r of report) {
    console.log(`${dryRun ? "[dry-run] " : ""}🗑 ${r.label}: ${r.count}건`);
  }
  console.log(`\n${dryRun ? "예상 " : ""}총 ${totalDelete}건 중복 ${dryRun ? "삭제 대상" : "삭제 완료"}`);
}

main().catch((e) => {
  console.error("❌", e.message || e);
  process.exit(1);
});

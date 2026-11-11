import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Database } from "./client.js";
import { ingestSnapshot } from "../ingest/ingestService.js";
import { createCycle, findCycleByYearStage } from "../repositories/cycles.js";
import { eq } from "drizzle-orm";
import { accounts, dismissReasons, organizationUnits, riskAssessments, riskConfig, rkaItems, rules, satkerFindingStats, userScopes, users } from "./schema.js";
import type { Db } from "./client.js";
import { runDetection } from "../services/detectionPipeline.js";
import { importHooks } from "../services/importHooks.js";
import { seedSyntheticAnswerKey } from "./seedAnswerKey.js";
import { hashPassword } from "../lib/security.js";
import { ACCOUNT_SEEDS, DEFAULT_RISK_PARAMS, DEFAULT_THRESHOLDS, DEFAULT_WEIGHTS, DEMO_USER_SEEDS, DISMISS_REASON_SEEDS, FINDING_STAT_SEEDS, ORGANIZATION_UNIT_SEEDS } from "./seeds/reference.js";
import { RULE_SEEDS } from "./seeds/rules.js";

/**
 * Seed master data + akun demo. Idempoten: baris yang sudah ada dibiarkan.
 * Semua data sintetis. Dipanggil setelah migrasi.
 */
export async function seedMasterData({ db }: Database) {
  const now = Date.now();
  await db.insert(organizationUnits).values(ORGANIZATION_UNIT_SEEDS.map((unit) => ({ ...unit, createdAt: now }))).onConflictDoNothing();
  await db.insert(accounts).values([...ACCOUNT_SEEDS]).onConflictDoNothing();
  await db.insert(dismissReasons).values(DISMISS_REASON_SEEDS.map((reason) => ({ ...reason, active: true }))).onConflictDoNothing();

  for (const user of DEMO_USER_SEEDS) {
    await db.insert(users).values({ id: user.id, username: user.username, displayName: user.displayName, role: user.role, passwordHash: await hashPassword(user.password), unitLabel: user.unitLabel, createdAt: now }).onConflictDoNothing();
    if (user.scope.length) await db.insert(userScopes).values(user.scope.map((organizationUnitId) => ({ userId: user.id, organizationUnitId }))).onConflictDoNothing();
  }

  await db.insert(rules).values(RULE_SEEDS.map((rule) => ({
    id: `rule_${rule.code}`, code: rule.code, name: rule.name, category: rule.category, kind: rule.kind, params: rule.params,
    reasonTemplate: rule.reasonTemplate, source: rule.source, defaultExpectation: rule.defaultExpectation, active: true,
    validYear: null, validationNote: rule.validationNote, updatedAt: now
  }))).onConflictDoNothing();

  await db.insert(satkerFindingStats).values(FINDING_STAT_SEEDS.map((stat) => ({ id: `fstat_${stat.workUnitCode}_${stat.theme}`, ...stat }))).onConflictDoNothing();

  await db.insert(riskConfig).values({
    id: "risk_config_v1", version: "1", weights: DEFAULT_WEIGHTS, thresholds: DEFAULT_THRESHOLDS, params: DEFAULT_RISK_PARAMS, createdBy: "usr_admin", createdAt: now
  }).onConflictDoNothing();
}

async function hasAssessments(db: Db, documentId: string) {
  const rows = await db.select({ id: riskAssessments.id }).from(riskAssessments).innerJoin(rkaItems, eq(rkaItems.id, riskAssessments.rkaItemId)).where(eq(rkaItems.documentId, documentId)).limit(1);
  return rows.length > 0;
}

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), "../../fixtures/synthetic");

/**
 * Siklus demo (TA 2026 · Alokasi) + impor snapshot "Awal" dari fixtures sintetis, lengkap dengan deteksi aturan dan
 * skor (pipeline Fase 3 berjalan di dalam impor), sehingga daftar Risk Triage langsung terisi.
 * Snapshot "Revisi" sengaja tidak diimpor di sini: ia dipakai untuk mendemokan loop
 * (triage → CHR → impor revisi → cek tindak lanjut) dan oleh test. Idempoten lewat hash berkas.
 */
export async function seedSyntheticSnapshots(database: Database) {
  const { db } = database;
  const manifest = JSON.parse(await readFile(join(fixtureDir, "manifest.json"), "utf8")) as { fiscalYear: number; expectedDiff: Record<string, unknown> };
  const satkerNames = JSON.parse(await readFile(join(fixtureDir, "satker.json"), "utf8")) as Record<string, string>;
  const cycleId = (await findCycleByYearStage(db, manifest.fiscalYear, "alokasi"))?.id
    ?? await createCycle(db, { fiscalYear: manifest.fiscalYear, stage: "alokasi", name: `TA ${manifest.fiscalYear} · Alokasi`, adkDeadline: Date.UTC(manifest.fiscalYear, 10, 12), dipaIssuedAt: null, createdBy: "usr_admin" });
  const imported: string[] = [];
  for (const code of Object.keys(manifest.expectedDiff)) {
    const name = `awal/es1_${code}_${manifest.fiscalYear}.csv`;
    const result = await ingestSnapshot(database, { cycleId, filePath: join(fixtureDir, name), fileName: name.split("/")[1], importedBy: "usr_admin", allowedOrganizationUnitIds: null, satkerNames }, importHooks());
    if (!result.alreadyImported) imported.push(code);
    else if (!(await hasAssessments(db, result.snapshot.id))) await database.transaction(() => runDetection(db, result.snapshot.id, { mode: "recalculate" })); // snapshot dari seed Fase 2
  }
  return { cycleId, imported };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await import("dotenv/config");
  const { getDatabase } = await import("./client.js");
  const { migrate } = await import("./migrate.js");
  const database = getDatabase();
  migrate(database);
  await seedMasterData(database);
  const { imported } = await seedSyntheticSnapshots(database);
  await seedSyntheticAnswerKey(database);
  console.log(`Seed sintetis NIRMALA selesai dibuat${imported.length ? ` (snapshot awal diimpor: eselon I ${imported.join(", ")})` : " (snapshot sudah ada)"}.`);
}

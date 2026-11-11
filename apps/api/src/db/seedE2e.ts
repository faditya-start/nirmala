/**
 * Seed untuk uji end-to-end (`npm run db:seed:e2e`): master data + akun demo + siklus TA 2026 Alokasi, TANPA snapshot.
 * Snapshot Awal dan Revisi diunggah lewat UI oleh skrip e2e/core-loop.mjs. Idempoten. Semua data sintetis.
 */
import { fileURLToPath } from "node:url";
import { findCycleByYearStage, createCycle } from "../repositories/cycles.js";
import { seedMasterData } from "./seed.js";
import { seedSyntheticAnswerKey } from "./seedAnswerKey.js";
import type { Database } from "./client.js";

export async function seedEmptyCycle(database: Database) {
  await seedMasterData(database);
  await seedSyntheticAnswerKey(database);
  const existing = await findCycleByYearStage(database.db, 2026, "alokasi");
  if (existing) return existing.id;
  return createCycle(database.db, { fiscalYear: 2026, stage: "alokasi", name: "TA 2026 · Alokasi", adkDeadline: Date.UTC(2026, 10, 12), dipaIssuedAt: null, createdBy: "usr_admin" });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await import("dotenv/config");
  const { getDatabase } = await import("./client.js");
  const { migrate } = await import("./migrate.js");
  const database = getDatabase();
  migrate(database);
  await seedEmptyCycle(database);
  console.log("Seed e2e selesai: master data, akun demo, dan siklus TA 2026 Alokasi (tanpa snapshot).");
}

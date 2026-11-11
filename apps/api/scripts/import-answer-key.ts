/**
 * Impor kunci jawaban validasi engine dari berkas JSON buatan lokal (format: `src/services/answerKeyImport.ts`).
 * Tidak membaca `data/private` sendiri: berkas JSON disiapkan tim di server sendiri dan tidak di-commit.
 * Pemakaian: `npm run import:answer-key -w @nirmala/api -- <berkas.json> [--cycle 2026:alokasi]`
 * Keluarannya hanya jumlah (tanpa isi item).
 */
import "dotenv/config";
import { readFile } from "node:fs/promises";
import { eq, and } from "drizzle-orm";
import type { CycleStage } from "@nirmala/shared";
import { getDatabase } from "../src/db/client.js";
import { migrate } from "../src/db/migrate.js";
import { reviewCycles } from "../src/db/schema.js";
import { answerKeyFileSchema, importAnswerKey } from "../src/services/answerKeyImport.js";

const args = process.argv.slice(2);
const path = args.find((arg) => !arg.startsWith("--"));
if (!path) { console.error("Pemakaian: npm run import:answer-key -w @nirmala/api -- <berkas.json> [--cycle 2026:alokasi]"); process.exit(1); }
const cycleArg = args[args.indexOf("--cycle") + 1];

const parsed = answerKeyFileSchema.safeParse(JSON.parse(await readFile(path, "utf8")));
if (!parsed.success) { console.error(`Berkas tidak valid: ${parsed.error.issues[0]?.message} (${parsed.error.issues[0]?.path.join(".")})`); process.exit(1); }

const database = getDatabase();
migrate(database);
let cycleId: string | undefined;
if (args.includes("--cycle")) {
  const [year, stage] = (cycleArg ?? "").split(":");
  const [cycle] = await database.db.select({ id: reviewCycles.id }).from(reviewCycles).where(and(eq(reviewCycles.fiscalYear, Number(year)), eq(reviewCycles.stage, stage as CycleStage))).limit(1);
  if (!cycle) { console.error("Siklus tidak ditemukan."); process.exit(1); }
  cycleId = cycle.id;
}
const result = await importAnswerKey(database, parsed.data, cycleId);
console.log(`Kunci jawaban diimpor: ${result.sets} set, ${result.imported} item${result.unresolved ? `, ${result.unresolved} item tidak ditemukan dan dilewati` : ""}.`);

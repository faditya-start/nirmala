/**
 * Impor LOKAL dari data/private (tidak pernah di-commit atau dijalankan di CI).
 *
 *   npm run import:private -w @nirmala/api -- <folder-csv> [--cycle <tahun>:<pagu|alokasi>] [--db <path>] [--production --actor <username-admin>]
 *
 * `--production`: database produksi tanpa seed demo (siapkan dulu dengan `bootstrap:production` dan `create-admin`); impor dan siklus
 * dicatat atas nama `--actor` (admin yang sudah ada). Tanpa flag ini skrip memakai seed demo dan akun `usr_admin` seperti sebelumnya.
 *
 * - Membaca berkas `es1_<BAES1>_<tahun>.csv` di folder (nama bebas selama berakhiran .csv).
 * - Eselon I yang belum terdaftar dibuat dari kode BAES1; Satker dibuat dari KDSATKER.
 *   Nama asli tidak ada di CSV, jadi diisi "Eselon I <kode>" / "Satker <kode>".
 * - Memakai jalur impor yang sama dengan aplikasi (idempoten lewat hash berkas).
 * - Keluaran hanya agregat (jumlah baris, waktu). Tidak mencetak isi data.
 *
 * Belum diimplementasikan (butuh keputusan privasi tersendiri, lihat docs/plan.md Fase 2):
 *  - snapshot awal dari dump SQL `d_dipa_awal`
 *  - `satker_finding_stats` dari PTL LHP BPK (xlsx)
 */
import "dotenv/config";
import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { and, eq } from "drizzle-orm";
import { createDatabase } from "../src/db/client.js";
import { migrate } from "../src/db/migrate.js";
import { seedMasterData } from "../src/db/seed.js";
import { organizationUnits, users } from "../src/db/schema.js";
import { readSnapshotRows } from "../src/ingest/csvParser.js";
import { ingestSnapshot } from "../src/ingest/ingestService.js";
import { newId } from "../src/lib/security.js";
import { createCycle, findCycleByYearStage } from "../src/repositories/cycles.js";

const args = process.argv.slice(2);
const option = (name: string) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
const folder = args.find((arg, index) => !arg.startsWith("--") && !args[index - 1]?.startsWith("--"));
if (!folder) { console.error("Pemakaian: import-private <folder-csv> [--cycle 2026:alokasi] [--db path]"); process.exit(1); }

const [yearText, stage = "alokasi"] = (option("--cycle") ?? "2026:alokasi").split(":");
if (stage !== "pagu" && stage !== "alokasi") { console.error("Tahap harus pagu atau alokasi."); process.exit(1); }

const database = createDatabase(option("--db") ?? process.env.DATABASE_PATH ?? "./nirmala.sqlite");
migrate(database);
const production = args.includes("--production");
await seedMasterData(database, { demo: !production });
let actorId = "usr_admin";
if (production) {
  const username = option("--actor");
  const [actor] = username ? await database.db.select({ id: users.id }).from(users).where(and(eq(users.username, username), eq(users.role, "admin"))).limit(1) : [];
  if (!actor) { console.error("Mode --production butuh --actor <username admin yang sudah ada> (buat dengan create-admin)."); process.exit(1); }
  actorId = actor.id;
}

const files = (await readdir(resolve(folder))).filter((name) => name.toLowerCase().endsWith(".csv")).sort();
const fiscalYear = Number(yearText);
const cycleId = (await findCycleByYearStage(database.db, fiscalYear, stage))?.id
  ?? await createCycle(database.db, { fiscalYear, stage, name: `TA ${fiscalYear} · ${stage === "pagu" ? "Pagu" : "Alokasi"}`, adkDeadline: null, dipaIssuedAt: null, createdBy: actorId });

for (const name of files) {
  const filePath = join(resolve(folder), name);
  let code: string | undefined;
  for await (const { row } of readSnapshotRows(filePath)) { code = row.BAES1; break; }
  if (!code) { console.log(`${name}: dilewati (tanpa item detail)`); continue; }
  const [existing] = await database.db.select({ id: organizationUnits.id }).from(organizationUnits).where(eq(organizationUnits.code, code)).limit(1);
  if (!existing) await database.db.insert(organizationUnits).values({ id: newId("org"), code, shortName: `E${code}`, name: `Eselon I ${code}`, createdAt: Date.now() });

  const started = Date.now();
  const result = await ingestSnapshot(database, { cycleId, filePath, fileName: name, importedBy: actorId, allowedOrganizationUnitIds: null });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const { snapshot } = result;
  console.log(`${name}: eselon I ${code} · ${result.alreadyImported ? "sudah pernah diimpor" : "diimpor"} · v${snapshot.versionNo} ${snapshot.label} · ${snapshot.rowCount} item · ${snapshot.headerRowsSkipped} baris judul disaring · ${seconds} dtk${snapshot.diffSummary ? ` · diff ${JSON.stringify(snapshot.diffSummary)}` : ""}`);
}
database.close();

/**
 * Impor LOKAL dari data/private (tidak pernah di-commit atau dijalankan di CI).
 *
 *   npm run import:private -w @nirmala/api -- [<folder-csv-revisi>] [--awal-sql <d_dipa_awal.sql>] [--ptl <rekap.xlsx>]
 *                                             [--cycle <tahun>:<pagu|alokasi>] [--db <path>] [--keep-work]
 *
 * Urutan kerja (hanya sumber yang diberikan yang dijalankan):
 *  1. `--awal-sql`  : dump MySQL `d_dipa_awal` diubah menjadi satu CSV per eselon I lalu diimpor sebagai
 *                     snapshot v1 "Awal". CSV perantara ditulis di folder kerja di samping dump (ikut
 *                     di-gitignore) dan dihapus lagi kecuali memakai `--keep-work`.
 *  2. `<folder-csv>`: berkas `es1_<BAES1>_<tahun>.csv` (nama bebas selama berakhiran .csv) diimpor sebagai
 *                     snapshot berikutnya (v2 "Revisi" bila v1 sudah ada).
 *  3. `--ptl`       : rekap PTL LHP BPK (xlsx) diringkas menjadi `satker_finding_stats` (hitungan per kode
 *                     Satker × tema). Hanya kolom yang diizinkan docs/data-analysis.md §3 yang dibaca.
 *
 * Privasi:
 *  - Nama asli tidak pernah masuk database: Eselon I diisi "Eselon I <kode>", Satker "Satker <kode>".
 *    Kolom catatan reviu (CHR_*), "Pejabat Terkait", dan semua kolom uraian PTL tidak dibaca.
 *  - Keluaran terminal hanya agregat (jumlah baris, kode, waktu). Tidak mencetak isi data.
 *  - Pakai `--db` ke berkas terpisah bila tidak ingin data asli bercampur dengan seed sintetis dev.
 *
 * Memakai jalur impor yang sama dengan aplikasi (idempoten lewat hash berkas).
 */
import "dotenv/config";
import { readdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { eq, sql } from "drizzle-orm";
import { createDatabase, type Database } from "../src/db/client.js";
import { migrate } from "../src/db/migrate.js";
import { seedMasterData } from "../src/db/seed.js";
import { organizationUnits, satkerFindingStats } from "../src/db/schema.js";
import { readSnapshotRows } from "../src/ingest/csvParser.js";
import { ingestSnapshot } from "../src/ingest/ingestService.js";
import { readPtlFindings } from "../src/ingest/ptlProfile.js";
import { convertDipaDump } from "../src/ingest/sqlDump.js";
import { newId } from "../src/lib/security.js";
import { createCycle, findCycleByYearStage } from "../src/repositories/cycles.js";

const args = process.argv.slice(2);
const VALUE_FLAGS = ["--awal-sql", "--ptl", "--cycle", "--db"];
const option = (name: string) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
const folder = args.find((arg, index) => !arg.startsWith("--") && !VALUE_FLAGS.includes(args[index - 1] ?? ""));
const awalSql = option("--awal-sql");
const ptlPath = option("--ptl");
const keepWork = args.includes("--keep-work");

if (!folder && !awalSql && !ptlPath) {
  console.error("Pemakaian: import-private [<folder-csv-revisi>] [--awal-sql d_dipa_awal.sql] [--ptl rekap.xlsx] [--cycle 2026:alokasi] [--db path] [--keep-work]");
  process.exit(1);
}
const [yearText, stage = "alokasi"] = (option("--cycle") ?? "2026:alokasi").split(":");
if (stage !== "pagu" && stage !== "alokasi") { console.error("Tahap harus pagu atau alokasi."); process.exit(1); }
const fiscalYear = Number(yearText);

const dbPath = option("--db") ?? process.env.DATABASE_PATH ?? "./nirmala.sqlite";
const database = createDatabase(dbPath);
migrate(database);
await seedMasterData(database);
console.log(`Database: ${resolve(dbPath)}`);

const cycleId = (await findCycleByYearStage(database.db, fiscalYear, stage))?.id
  ?? await createCycle(database.db, { fiscalYear, stage, name: `TA ${fiscalYear} · ${stage === "pagu" ? "Pagu" : "Alokasi"}`, adkDeadline: null, dipaIssuedAt: null, createdBy: "usr_admin" });

async function importCsvFolder(directory: string) {
  const files = (await readdir(resolve(directory))).filter((name) => name.toLowerCase().endsWith(".csv")).sort();
  for (const name of files) {
    const filePath = join(resolve(directory), name);
    let code: string | undefined;
    for await (const { row } of readSnapshotRows(filePath)) { code = row.BAES1; break; }
    if (!code) { console.log(`${name}: dilewati (tanpa item detail)`); continue; }
    const [existing] = await database.db.select({ id: organizationUnits.id }).from(organizationUnits).where(eq(organizationUnits.code, code)).limit(1);
    if (!existing) await database.db.insert(organizationUnits).values({ id: newId("org"), code, shortName: `E${code}`, name: `Eselon I ${code}`, createdAt: Date.now() });

    const started = Date.now();
    const result = await ingestSnapshot(database, { cycleId, filePath, fileName: name, importedBy: "usr_admin", allowedOrganizationUnitIds: null });
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    const { snapshot } = result;
    console.log(`${name}: eselon I ${code} · ${result.alreadyImported ? "sudah pernah diimpor" : "diimpor"} · v${snapshot.versionNo} ${snapshot.label} · ${snapshot.rowCount} item · ${snapshot.headerRowsSkipped} baris judul disaring · ${seconds} dtk${snapshot.diffSummary ? ` · diff ${JSON.stringify(snapshot.diffSummary)}` : ""}`);
  }
}

async function saveFindingStats(db: Database, stats: Awaited<ReturnType<typeof readPtlFindings>>["stats"]) {
  await db.transaction(async () => {
    for (let start = 0; start < stats.length; start += 500) {
      await db.db.insert(satkerFindingStats)
        .values(stats.slice(start, start + 500).map((stat) => ({ id: newId("sfs"), ...stat })))
        .onConflictDoUpdate({
          target: [satkerFindingStats.workUnitCode, satkerFindingStats.theme],
          set: { countTotal: sql`excluded.count_total`, countOpen: sql`excluded.count_open`, latestYear: sql`excluded.latest_year` }
        });
    }
  });
}

try {
  if (awalSql) {
    const workDir = join(dirname(resolve(awalSql)), ".work-awal");
    const started = Date.now();
    const converted = await convertDipaDump(resolve(awalSql), workDir);
    console.log(`Dump ${converted.length} eselon I diubah ke CSV (${converted.reduce((sum, file) => sum + file.rows, 0)} baris) · ${((Date.now() - started) / 1000).toFixed(1)} dtk`);
    try { await importCsvFolder(workDir); }
    finally { if (!keepWork) await rm(workDir, { recursive: true, force: true }); }
  }
  if (folder) await importCsvFolder(folder);
  if (ptlPath) {
    const started = Date.now();
    const summary = await readPtlFindings(resolve(ptlPath));
    await saveFindingStats(database, summary.stats);
    const satkerCount = new Set(summary.stats.map((stat) => stat.workUnitCode)).size;
    console.log(`PTL: ${summary.rowsRead} rekomendasi dibaca · ${summary.rowsThemed} bertema anggaran · ${summary.stats.length} baris statistik untuk ${satkerCount} Satker · ${((Date.now() - started) / 1000).toFixed(1)} dtk`);
  }
} finally {
  database.close();
}

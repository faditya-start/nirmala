/**
 * Demo loop Smart Tracker (opsional; TIDAK dijalankan oleh `npm run db:seed`).
 *
 * Prasyarat: `db:seed` sudah dijalankan (snapshot Awal sintetis sudah diimpor). Skrip ini:
 *   1. untuk tiap eselon I fiktif: mengonfirmasi semua item yang kena aturan di snapshot Awal sebagai catatan CHR
 *      (ekspektasi bawaan aturan) lalu menerbitkan CHR, atas nama akun admin demo;
 *   2. mengimpor snapshot "Revisi" sintetis (`fixtures/synthetic/revisi/*.csv`), sehingga cek otomatis berjalan dan
 *      catatan berpindah ke "Perlu Verifikasi" (ada yang terpenuhi, belum terpenuhi, dan item tidak ditemukan).
 *
 * Catatan TIDAK ditutup oleh skrip ini: menyetujui/mengembalikan tetap tindakan reviewer di aplikasi.
 * Idempoten: CHR yang sudah terbit dan berkas revisi yang sudah diimpor dilewati.
 * Jalankan: `npm run db:seed:demo -w @nirmala/api`.
 */
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { and, asc, eq } from "drizzle-orm";
import type { Database } from "./client.js";
import { chrNotes, organizationUnits, reviewCycles, rkaDocuments, rkaItems, ruleHits, rules } from "./schema.js";
import { ingestSnapshot } from "../ingest/ingestService.js";
import { getOrCreateChr } from "../repositories/chr.js";
import { recordAudit } from "../repositories/audit.js";
import { insertNote, issueChr } from "../services/chrService.js";
import { importHooks } from "../services/importHooks.js";

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), "../../fixtures/synthetic");
const ACTOR = { id: "usr_admin", role: "admin" as const };

export interface DemoLoopResult {
  cycleId: string;
  /** Per kode eselon I: jumlah catatan diterbitkan dan status impor revisi. */
  organizations: { code: string; notesIssued: number; revisionImported: boolean }[];
}

export async function seedDemoFollowUpLoop(database: Database): Promise<DemoLoopResult> {
  const { db } = database;
  const manifest = JSON.parse(await readFile(join(fixtureDir, "manifest.json"), "utf8")) as { fiscalYear: number; expectedDiff: Record<string, unknown> };
  const satkerNames = JSON.parse(await readFile(join(fixtureDir, "satker.json"), "utf8")) as Record<string, string>;
  const [cycle] = await db.select().from(reviewCycles).where(and(eq(reviewCycles.fiscalYear, manifest.fiscalYear), eq(reviewCycles.stage, "alokasi"))).limit(1);
  if (!cycle) throw new Error("Siklus demo belum ada. Jalankan `npm run db:seed` terlebih dahulu.");

  const result: DemoLoopResult = { cycleId: cycle.id, organizations: [] };
  for (const code of Object.keys(manifest.expectedDiff)) {
    const [organization] = await db.select().from(organizationUnits).where(eq(organizationUnits.code, code)).limit(1);
    const [awal] = organization
      ? await db.select().from(rkaDocuments).where(and(eq(rkaDocuments.cycleId, cycle.id), eq(rkaDocuments.organizationUnitId, organization.id), eq(rkaDocuments.versionNo, 1))).limit(1)
      : [];
    if (!organization || !awal) throw new Error(`Snapshot Awal eselon I ${code} belum ada. Jalankan \`npm run db:seed\` terlebih dahulu.`);

    // 1. Konfirmasi item yang kena aturan -> CHR -> terbit.
    let notesIssued = 0;
    const existing = await db.select({ status: chrNotes.status }).from(chrNotes).innerJoin(rkaItems, eq(rkaItems.id, chrNotes.rkaItemId)).where(eq(rkaItems.documentId, awal.id)).limit(1);
    if (existing.length === 0) {
      const hits = await db.select({ itemId: ruleHits.rkaItemId, reason: ruleHits.reason, category: rules.category, expectation: rules.defaultExpectation, code: rules.code, ruleId: rules.id })
        .from(ruleHits).innerJoin(rkaItems, eq(rkaItems.id, ruleHits.rkaItemId)).innerJoin(rules, eq(rules.id, ruleHits.ruleId))
        .where(eq(rkaItems.documentId, awal.id)).orderBy(asc(rkaItems.id), asc(rules.code));
      const firstHit = new Map<string, (typeof hits)[number]>();
      for (const hit of hits) if (!firstHit.has(hit.itemId)) firstHit.set(hit.itemId, hit);
      if (firstHit.size > 0) {
        notesIssued = await database.transaction(async () => {
          const { chr, created } = await getOrCreateChr(db, { cycleId: cycle.id, organizationUnitId: organization.id, createdBy: ACTOR.id });
          if (created) await recordAudit(db, { actorId: ACTOR.id, action: "chr.created", entityType: "chr_document", entityId: chr.id, detail: `CHR ${organization.shortName} dibuat (draf).`, after: { status: "draft" } });
          for (const hit of firstHit.values()) {
            const noteId = await insertNote(db, chr, { rkaItemId: hit.itemId, category: hit.category, text: hit.reason, expectation: hit.expectation ?? { type: "manual", instruction: "Periksa item ini." } }, ACTOR, "editor");
            await recordAudit(db, { actorId: ACTOR.id, action: "chr.note_created", entityType: "chr_note", entityId: noteId, detail: `Catatan demo ditambahkan ke CHR ${organization.shortName} (draf).`, after: { chrId: chr.id, rkaItemId: hit.itemId, ruleCode: hit.code } });
          }
          return (await issueChr(db, chr.id, ACTOR)).notesTransitioned;
        });
      }
    }

    // 2. Impor snapshot Revisi (idempoten lewat hash berkas).
    const name = `revisi/es1_${code}_${manifest.fiscalYear}.csv`;
    const imported = await ingestSnapshot(database, { cycleId: cycle.id, filePath: join(fixtureDir, name), fileName: name.split("/")[1], importedBy: ACTOR.id, allowedOrganizationUnitIds: null, satkerNames }, importHooks());
    result.organizations.push({ code, notesIssued, revisionImported: !imported.alreadyImported });
  }
  return result;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await import("dotenv/config");
  const { getDatabase } = await import("./client.js");
  const { migrate } = await import("./migrate.js");
  const database = getDatabase();
  migrate(database);
  const result = await seedDemoFollowUpLoop(database);
  for (const org of result.organizations) {
    console.log(`Eselon I ${org.code}: ${org.notesIssued} catatan diterbitkan, revisi ${org.revisionImported ? "diimpor" : "sudah ada"}.`);
  }
  console.log("Demo loop selesai: buka Smart Tracker untuk menyetujui, mengembalikan, atau menjustifikasi catatan.");
}

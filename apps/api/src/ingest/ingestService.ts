import type { DiffSummary } from "@nirmala/shared";
import { eq } from "drizzle-orm";
import type { Database, Db } from "../db/client.js";
import { organizationUnits, rkaDocuments, rkaItems, workUnits } from "../db/schema.js";
import { newId } from "../lib/security.js";
import { recordAudit } from "../repositories/audit.js";
import { findCycle } from "../repositories/cycles.js";
import { findSnapshotByHash, latestSnapshot } from "../repositories/snapshots.js";
import { CsvFormatError, hashFile, readSnapshotRows, type ParsedRow } from "./csvParser.js";
import { createItemKeyer, createMatcher, fallbackKey, type PreviousItem } from "./matcher.js";

export class IngestError extends Error {
  constructor(message: string, readonly status: 400 | 403 | 404 | 409 = 400) { super(message); this.name = "IngestError"; }
}

export interface IngestInput {
  cycleId: string;
  filePath: string;
  /** Nama berkas asli (untuk tampilan), bukan path sementara. */
  fileName: string;
  importedBy: string;
  /** Eselon I yang boleh diimpor pengguna; null = semua. */
  allowedOrganizationUnitIds: string[] | null;
  /** Nama Satker untuk Satker baru (CSV tidak memuat nama). Selain itu dipakai "Satker <kode>". */
  satkerNames?: Record<string, string>;
}

export interface IngestedSnapshot {
  id: string;
  cycleId: string;
  organizationUnitId: string;
  versionNo: number;
  label: string;
  rowCount: number;
  headerRowsSkipped: number;
  diffSummary: DiffSummary | null;
}

export interface IngestResult { snapshot: IngestedSnapshot; alreadyImported: boolean }

/** Titik sambung untuk fase berikutnya (deteksi di Fase 3, cek tracker di Fase 5). Dijalankan di dalam transaksi impor. */
export interface IngestHooks {
  afterSnapshot?(context: { db: Db; snapshot: IngestedSnapshot; previousSnapshotId: string | null }): Promise<void>;
}

const BATCH_SIZE = 300;

export async function ingestSnapshot(database: Database, input: IngestInput, hooks: IngestHooks = {}): Promise<IngestResult> {
  const { db } = database;
  const cycle = await findCycle(db, input.cycleId);
  if (!cycle) throw new IngestError("Siklus tidak ditemukan.", 404);
  if (cycle.status !== "aktif") throw new IngestError("Siklus sudah selesai; impor tidak diterima.", 409);

  const fileHash = await hashFile(input.filePath);
  const meta = await peekMeta(input.filePath);
  const [organization] = await db.select().from(organizationUnits).where(eq(organizationUnits.code, meta.organizationCode)).limit(1);
  if (!organization) throw new IngestError(`Eselon I dengan kode ${meta.organizationCode} belum terdaftar.`, 400);
  if (input.allowedOrganizationUnitIds && !input.allowedOrganizationUnitIds.includes(organization.id)) throw new IngestError("Anda tidak memiliki akses ke eselon I pada berkas ini.", 403);
  if (meta.fiscalYear !== cycle.fiscalYear) throw new IngestError(`Tahun anggaran berkas (${meta.fiscalYear}) tidak sama dengan siklus (${cycle.fiscalYear}).`, 400);

  const existing = await findSnapshotByHash(db, fileHash);
  if (existing) {
    if (existing.organizationUnitId !== organization.id || existing.cycleId !== cycle.id) throw new IngestError("Berkas yang sama sudah pernah diimpor ke siklus atau eselon I lain.", 409);
    return { alreadyImported: true, snapshot: { id: existing.id, cycleId: existing.cycleId, organizationUnitId: existing.organizationUnitId, versionNo: existing.versionNo, label: existing.label, rowCount: existing.rowCount, headerRowsSkipped: existing.headerRowsSkipped, diffSummary: existing.diffSummary } };
  }

  try {
    return await database.transaction(async () => {
      const previous = await latestSnapshot(db, cycle.id, organization.id);
      const versionNo = previous ? previous.versionNo + 1 : 1;
      const label = previous ? "Revisi" : "Awal";
      const documentId = newId("snap");
      await db.insert(rkaDocuments).values({
        id: documentId, cycleId: cycle.id, organizationUnitId: organization.id, versionNo, label, sourceFileName: input.fileName,
        fileHash, rowCount: 0, headerRowsSkipped: 0, importedBy: input.importedBy, importedAt: Date.now(), diffSummary: null
      });

      const workUnitIds = await loadWorkUnits(db, organization.id);
      const matcher = createMatcher(previous ? await loadPreviousItems(db, previous.id) : []);
      const keyOf = createItemKeyer();
      const batch: (typeof rkaItems.$inferSelect)[] = [];
      const pending: (typeof rkaItems.$inferSelect & { fallback: string | null })[] = [];
      const counts = { baru: 0, berubah: 0, tetap: 0 };
      let rowCount = 0;
      const stats = { totalRows: 0, headerRowsSkipped: 0 };

      const flush = async () => { if (batch.length) await db.insert(rkaItems).values(batch.splice(0)); };

      for await (const { line, row } of readSnapshotRows(input.filePath, stats)) {
        if (row.BAES1 !== meta.organizationCode) throw new IngestError(`Berkas memuat lebih dari satu eselon I (BAES1 ${row.BAES1} pada baris ${line}).`, 400);
        if (row.TAHUN !== meta.fiscalYear) throw new IngestError(`Berkas memuat lebih dari satu tahun anggaran (baris ${line}).`, 400);
        const workUnitId = await resolveWorkUnit(db, workUnitIds, organization.id, row.KDSATKER, input.satkerNames);
        const record = toItem(row, documentId, workUnitId, keyOf);
        rowCount++;
        const matched = previous ? matcher.matchKey(record) : null;
        if (matched) {
          counts[matched.changeType === "tetap" ? "tetap" : "berubah"]++;
          batch.push({ ...record, previousItemId: matched.previousItemId, changeType: matched.changeType });
        } else if (previous) {
          pending.push({ ...record, fallback: fallbackKey(record) }); // menunggu langkah 2
        } else batch.push(record); // snapshot pertama: tidak ada yang dibandingkan
        if (batch.length >= BATCH_SIZE) await flush();
      }
      if (rowCount === 0) throw new IngestError("Berkas tidak memuat item detail.", 400);

      // Langkah 2 dijalankan setelah langkah 1 selesai untuk seluruh berkas.
      for (const { fallback, ...record } of pending) {
        const matched = matcher.matchFallback({ ...record, fallback });
        if (matched) { counts[matched.changeType === "tetap" ? "tetap" : "berubah"]++; batch.push({ ...record, previousItemId: matched.previousItemId, changeType: matched.changeType }); }
        else { counts.baru++; batch.push({ ...record, previousItemId: null, changeType: "baru" }); }
        if (batch.length >= BATCH_SIZE) await flush();
      }
      await flush();

      const diffSummary: DiffSummary | null = previous ? { ...counts, hilang: matcher.missingCount() } : null;
      await db.update(rkaDocuments).set({ rowCount, headerRowsSkipped: stats.headerRowsSkipped, diffSummary }).where(eq(rkaDocuments.id, documentId));
      await recordAudit(db, {
        actorId: input.importedBy, action: "snapshot.imported", entityType: "rka_document", entityId: documentId,
        detail: `Snapshot ${label} (v${versionNo}) eselon I ${organization.code} diimpor: ${rowCount} item.`, after: { versionNo, rowCount, diffSummary }
      });

      const snapshot: IngestedSnapshot = { id: documentId, cycleId: cycle.id, organizationUnitId: organization.id, versionNo, label, rowCount, headerRowsSkipped: stats.headerRowsSkipped, diffSummary };
      await hooks.afterSnapshot?.({ db, snapshot, previousSnapshotId: previous?.id ?? null });
      return { snapshot, alreadyImported: false };
    });
  } catch (error) {
    if (error instanceof CsvFormatError) throw new IngestError(error.message, 400);
    throw error;
  }
}

async function peekMeta(path: string) {
  try {
    for await (const { row } of readSnapshotRows(path)) return { organizationCode: row.BAES1, fiscalYear: row.TAHUN };
  } catch (error) {
    if (error instanceof CsvFormatError) throw new IngestError(error.message, 400);
    throw error;
  }
  throw new IngestError("Berkas tidak memuat item detail.", 400);
}

async function loadWorkUnits(db: Db, organizationUnitId: string) {
  const rows = await db.select({ id: workUnits.id, code: workUnits.code }).from(workUnits).where(eq(workUnits.organizationUnitId, organizationUnitId));
  return new Map(rows.map((row) => [row.code, row.id]));
}

async function resolveWorkUnit(db: Db, known: Map<string, string>, organizationUnitId: string, code: string, names?: Record<string, string>) {
  const cached = known.get(code);
  if (cached) return cached;
  const [other] = await db.select({ id: workUnits.id, organizationUnitId: workUnits.organizationUnitId }).from(workUnits).where(eq(workUnits.code, code)).limit(1);
  if (other) throw new IngestError(`Satker ${code} terdaftar di eselon I lain.`, 409);
  const id = newId("satker");
  await db.insert(workUnits).values({ id, organizationUnitId, code, name: names?.[code] ?? `Satker ${code}`, createdAt: Date.now() });
  known.set(code, id);
  return id;
}

async function loadPreviousItems(db: Db, documentId: string): Promise<PreviousItem[]> {
  const rows = await db.select({
    id: rkaItems.id, itemKey: rkaItems.itemKey, workUnitId: rkaItems.workUnitId, programCode: rkaItems.programCode, activityCode: rkaItems.activityCode,
    outputCode: rkaItems.outputCode, suboutputCode: rkaItems.suboutputCode, componentCode: rkaItems.componentCode, subcomponentCode: rkaItems.subcomponentCode,
    accountCode: rkaItems.accountCode, consItem: rkaItems.consItem, quantity: rkaItems.quantity, unit: rkaItems.unit, unitPrice: rkaItems.unitPrice, totalAmount: rkaItems.totalAmount
  }).from(rkaItems).where(eq(rkaItems.documentId, documentId));
  return rows.map((row) => ({ id: row.id, itemKey: row.itemKey, fallback: fallbackKey(row), accountCode: row.accountCode, quantity: row.quantity, unit: row.unit, unitPrice: row.unitPrice, totalAmount: row.totalAmount }));
}

function toItem(row: ParsedRow["row"], documentId: string, workUnitId: string, keyOf: ReturnType<typeof createItemKeyer>): typeof rkaItems.$inferSelect {
  const itemKey = keyOf({
    satkerCode: row.KDSATKER, programCode: row.KODE_PROGRAM, activityCode: row.KODE_KEGIATAN, outputCode: row.KODE_OUTPUT,
    suboutputCode: row.KODE_SUBOUTPUT, componentCode: row.KODE_KOMPONEN, subcomponentCode: row.KODE_SUBKOMPONEN, description: row.URAIAN_ITEM
  });
  return {
    id: newId("item"), documentId, workUnitId,
    programCode: row.KODE_PROGRAM, activityCode: row.KODE_KEGIATAN, outputCode: row.KODE_OUTPUT, suboutputCode: row.KODE_SUBOUTPUT,
    componentCode: row.KODE_KOMPONEN, subcomponentCode: row.KODE_SUBKOMPONEN, subcomponentName: row.URAIAN_SUBKOMPONEN ?? null,
    accountCode: row.KODE_AKUN, description: row.URAIAN_ITEM, consItem: row.CONS_ITEM ?? null, nomorItem: row.NOMOR_ITEM ?? null,
    quantity: row.VOLKEG, unit: row.SATKEG ?? null, unitPrice: row.HARGASAT, totalAmount: row.TOTAL,
    volumeDetail: { vol1: row.VOL_KEG_1, sat1: row.SAT_KEG_1 ?? null, vol2: row.VOL_KEG_2, sat2: row.SAT_KEG_2 ?? null, vol3: row.VOL_KEG_3, sat3: row.SAT_KEG_3 ?? null, vol4: row.VOL_KEG_4, sat4: row.SAT_KEG_4 ?? null },
    blokirCode: row.KODE_BLOKIR ?? null, blokirAmount: row.KODE_BLOKIR ? row.NILAI_BLOKIR : null,
    itemKey, sipekaIdItem: row.ID_ITEM ?? null, changeType: "baru", previousItemId: null
  };
}

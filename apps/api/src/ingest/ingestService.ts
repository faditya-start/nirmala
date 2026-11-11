import { createReadStream } from "node:fs";
import type { DiffSummary } from "@nirmala/shared";
import { eq } from "drizzle-orm";
import type { Database, Db } from "../db/client.js";
import { organizationUnits, rkaDocuments, rkaItems, workUnits, type HierarchyNames } from "../db/schema.js";
import { newId } from "../lib/security.js";
import { recordAudit } from "../repositories/audit.js";
import { findCycle } from "../repositories/cycles.js";
import { findSnapshotByHash, latestSnapshot } from "../repositories/snapshots.js";
import { CsvFormatError, hashFile, newParseStats, readSnapshotRows, type ParsedRow, type SipekaRow } from "./csvParser.js";
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
  /** Eselon I yang dipilih pengguna di dialog; bila diisi harus sama dengan BAES1 di berkas (400). */
  expectedOrganizationUnitId?: string;
  /** Nomor versi yang diharapkan pengguna; bila diisi harus sama dengan versi berikutnya (400). */
  expectedVersionNo?: number;
  /** Laporan kemajuan untuk job asinkron. */
  onProgress?: (event: ImportProgressEvent) => void;
}

export type ImportStep = "baca_file" | "saring_header" | "simpan_item" | "aturan_dan_skor";
export interface ImportProgressEvent {
  step: ImportStep;
  state: "berjalan" | "selesai";
  rowsDone?: number;
  /** Perkiraan jumlah baris data berkas (hitungan baris baru); null bila belum diketahui. */
  rowsTotal?: number | null;
}

export interface IngestedSnapshot {
  id: string;
  cycleId: string;
  organizationUnitId: string;
  versionNo: number;
  label: string;
  rowCount: number;
  headerRowsSkipped: number;
  rowErrorCount: number;
  diffSummary: DiffSummary | null;
}

export interface IngestResult { snapshot: IngestedSnapshot; alreadyImported: boolean }

/** Titik sambung untuk fase berikutnya (deteksi di Fase 3, cek tracker di Fase 5). Dijalankan di dalam transaksi impor. */
export interface IngestHooks {
  afterSnapshot?(context: { db: Db; snapshot: IngestedSnapshot; previousSnapshotId: string | null; onProgress?: (done: number, total: number) => void }): Promise<void>;
}

const BATCH_SIZE = 300;

/** Hasil validasi awal: berkas sudah pernah diimpor, atau rencana impor yang siap dijalankan. */
export type PreparedImport =
  | { kind: "existing"; result: IngestResult & { alreadyImported: true } }
  | { kind: "ready"; plan: ImportPlan };

export interface ImportPlan {
  input: IngestInput;
  cycleId: string;
  organization: { id: string; code: string };
  fiscalYear: number;
  fileHash: string;
}

/**
 * Semua pemeriksaan yang tidak mengubah data: siklus, eselon I, scope, tahun, hash berkas, nomor versi.
 * Dipisahkan dari `executeImport` agar impor asinkron bisa menjawab galat 4xx langsung sebelum job dibuat.
 */
export async function prepareImport(database: Database, input: IngestInput): Promise<PreparedImport> {
  const { db } = database;
  const cycle = await findCycle(db, input.cycleId);
  if (!cycle) throw new IngestError("Siklus tidak ditemukan.", 404);
  if (cycle.status !== "aktif") throw new IngestError("Siklus sudah selesai; impor tidak diterima.", 409);

  input.onProgress?.({ step: "baca_file", state: "berjalan" });
  const fileHash = await hashFile(input.filePath);
  const meta = await peekMeta(input.filePath);
  const [organization] = await db.select().from(organizationUnits).where(eq(organizationUnits.code, meta.organizationCode)).limit(1);
  if (!organization) throw new IngestError(`Eselon I dengan kode ${meta.organizationCode} belum terdaftar.`, 400);
  if (input.allowedOrganizationUnitIds && !input.allowedOrganizationUnitIds.includes(organization.id)) throw new IngestError("Anda tidak memiliki akses ke eselon I pada berkas ini.", 403);
  if (input.expectedOrganizationUnitId && input.expectedOrganizationUnitId !== organization.id) throw new IngestError("Berkas ini milik eselon I lain.", 400);
  if (meta.fiscalYear !== cycle.fiscalYear) throw new IngestError(`Tahun anggaran berkas (${meta.fiscalYear}) tidak sama dengan siklus (${cycle.fiscalYear}).`, 400);

  const existing = await findSnapshotByHash(db, fileHash);
  if (existing) {
    if (existing.organizationUnitId !== organization.id || existing.cycleId !== cycle.id) throw new IngestError("Berkas yang sama sudah pernah diimpor ke siklus atau eselon I lain.", 409);
    return { kind: "existing", result: { alreadyImported: true, snapshot: { id: existing.id, cycleId: existing.cycleId, organizationUnitId: existing.organizationUnitId, versionNo: existing.versionNo, label: existing.label, rowCount: existing.rowCount, headerRowsSkipped: existing.headerRowsSkipped, rowErrorCount: existing.rowErrorCount, diffSummary: existing.diffSummary } } };
  }

  if (input.expectedVersionNo !== undefined) {
    const next = ((await latestSnapshot(db, cycle.id, organization.id))?.versionNo ?? 0) + 1;
    if (input.expectedVersionNo !== next) throw new IngestError(`Nomor versi yang diharapkan (v${input.expectedVersionNo}) tidak sama dengan versi berikutnya (v${next}).`, 400);
  }
  return { kind: "ready", plan: { input, cycleId: cycle.id, organization: { id: organization.id, code: organization.code }, fiscalYear: meta.fiscalYear, fileHash } };
}

export async function ingestSnapshot(database: Database, input: IngestInput, hooks: IngestHooks = {}): Promise<IngestResult> {
  const prepared = await prepareImport(database, input);
  return prepared.kind === "existing" ? prepared.result : executeImport(database, prepared.plan, hooks);
}

/**
 * Impor dalam satu transaksi. Baris tidak valid dilewati dan dicatat (`row_errors`); yang membatalkan seluruh impor:
 * kolom wajib hilang, BAES1 / TAHUN tidak konsisten, tidak ada item valid, atau galat di hook deteksi.
 */
export async function executeImport(database: Database, plan: ImportPlan, hooks: IngestHooks = {}): Promise<IngestResult> {
  const { db } = database;
  const { input, organization, fileHash, fiscalYear } = plan;
  const cycleId = plan.cycleId;
  const startedAt = Date.now();
  const progress = input.onProgress;
  const rowsTotal = await countDataLines(input.filePath);
  progress?.({ step: "baca_file", state: "selesai", rowsDone: 0, rowsTotal });

  try {
    return await database.transaction(async () => {
      const previous = await latestSnapshot(db, cycleId, organization.id);
      const versionNo = previous ? previous.versionNo + 1 : 1;
      const label = previous ? "Revisi" : "Awal";
      const documentId = newId("snap");
      await db.insert(rkaDocuments).values({
        id: documentId, cycleId, organizationUnitId: organization.id, versionNo, label, sourceFileName: input.fileName,
        fileHash, rowCount: 0, headerRowsSkipped: 0, importedBy: input.importedBy, importedAt: Date.now(), diffSummary: null
      });

      const workUnitIds = await loadWorkUnits(db, organization.id);
      const matcher = createMatcher(previous ? await loadPreviousItems(db, previous.id) : []);
      const keyOf = createItemKeyer();
      const batch: (typeof rkaItems.$inferSelect)[] = [];
      const pending: (typeof rkaItems.$inferSelect & { fallback: string | null })[] = [];
      const counts = { baru: 0, berubah: 0, tetap: 0 };
      let rowCount = 0;
      const stats = newParseStats();
      const names = createHierarchyNames();

      const flush = async () => { if (batch.length) await db.insert(rkaItems).values(batch.splice(0)); };
      progress?.({ step: "saring_header", state: "berjalan", rowsDone: 0, rowsTotal });
      progress?.({ step: "simpan_item", state: "berjalan", rowsDone: 0, rowsTotal });

      for await (const { line, row } of readSnapshotRows(input.filePath, stats, names.add)) {
        if (row.BAES1 !== organization.code) throw new IngestError(`Berkas memuat lebih dari satu eselon I (BAES1 ${row.BAES1} pada baris ${line}).`, 400);
        if (row.TAHUN !== fiscalYear) throw new IngestError(`Berkas memuat lebih dari satu tahun anggaran (baris ${line}).`, 400);
        const workUnitId = await resolveWorkUnit(db, workUnitIds, organization.id, row.KDSATKER, input.satkerNames);
        const record = toItem(row, documentId, workUnitId, keyOf, names.lookup(row));
        rowCount++;
        const matched = previous ? matcher.matchKey(record) : null;
        if (matched) {
          counts[matched.changeType === "tetap" ? "tetap" : "berubah"]++;
          batch.push({ ...record, previousItemId: matched.previousItemId, changeType: matched.changeType });
        } else if (previous) {
          pending.push({ ...record, fallback: fallbackKey(record) }); // menunggu langkah 2
        } else batch.push(record); // snapshot pertama: tidak ada yang dibandingkan
        if (batch.length >= BATCH_SIZE) await flush();
        if (stats.totalRows % PROGRESS_EVERY === 0) progress?.({ step: "saring_header", state: "berjalan", rowsDone: stats.totalRows, rowsTotal });
      }
      progress?.({ step: "saring_header", state: "selesai", rowsDone: stats.totalRows, rowsTotal: Math.max(rowsTotal ?? 0, stats.totalRows) });
      if (rowCount === 0) throw new IngestError(stats.rowErrorCount > 0 ? "Tidak ada baris item yang valid pada berkas." : "Berkas tidak memuat item detail.", 400);

      // Langkah 2 dijalankan setelah langkah 1 selesai untuk seluruh berkas.
      for (const { fallback, ...record } of pending) {
        const matched = matcher.matchFallback({ ...record, fallback });
        if (matched) { counts[matched.changeType === "tetap" ? "tetap" : "berubah"]++; batch.push({ ...record, previousItemId: matched.previousItemId, changeType: matched.changeType }); }
        else { counts.baru++; batch.push({ ...record, previousItemId: null, changeType: "baru" }); }
        if (batch.length >= BATCH_SIZE) await flush();
      }
      await flush();

      const diffSummary: DiffSummary | null = previous ? { ...counts, hilang: matcher.missingCount() } : null;
      await db.update(rkaDocuments).set({
        rowCount, headerRowsSkipped: stats.headerRowsSkipped, diffSummary, rowErrorCount: stats.rowErrorCount, rowErrors: stats.rowErrors.length ? stats.rowErrors : null
      }).where(eq(rkaDocuments.id, documentId));
      progress?.({ step: "simpan_item", state: "selesai", rowsDone: stats.totalRows, rowsTotal: Math.max(rowsTotal ?? 0, stats.totalRows) });

      const snapshot: IngestedSnapshot = { id: documentId, cycleId, organizationUnitId: organization.id, versionNo, label, rowCount, headerRowsSkipped: stats.headerRowsSkipped, rowErrorCount: stats.rowErrorCount, diffSummary };
      progress?.({ step: "aturan_dan_skor", state: "berjalan", rowsDone: 0, rowsTotal: rowCount });
      await hooks.afterSnapshot?.({ db, snapshot, previousSnapshotId: previous?.id ?? null, onProgress: (done, total) => progress?.({ step: "aturan_dan_skor", state: "berjalan", rowsDone: done, rowsTotal: total }) });
      progress?.({ step: "aturan_dan_skor", state: "selesai", rowsDone: rowCount, rowsTotal: rowCount });

      await db.update(rkaDocuments).set({ importDurationMs: Date.now() - startedAt }).where(eq(rkaDocuments.id, documentId));
      await recordAudit(db, {
        actorId: input.importedBy, action: "snapshot.imported", entityType: "rka_document", entityId: documentId,
        detail: `Snapshot ${label} (v${versionNo}) eselon I ${organization.code} diimpor: ${rowCount} item${stats.rowErrorCount ? `, ${stats.rowErrorCount} baris dilewati` : ""}.`,
        after: { versionNo, rowCount, rowErrorCount: stats.rowErrorCount, diffSummary }
      });
      return { snapshot, alreadyImported: false };
    });
  } catch (error) {
    if (error instanceof CsvFormatError) throw new IngestError(error.message, 400);
    throw error;
  }
}

const PROGRESS_EVERY = 500;

/** Perkiraan jumlah baris data: hitungan karakter baris baru dikurangi baris header kolom (cepat; newline di dalam kutip menggelembungkan sedikit). */
async function countDataLines(path: string) {
  let lines = 0;
  let last = 0x0a;
  for await (const chunk of createReadStream(path)) {
    const bytes = chunk as Buffer;
    for (let i = 0; i < bytes.length; i++) if (bytes[i] === 0x0a) lines++;
    last = bytes[bytes.length - 1] ?? last;
  }
  if (last !== 0x0a) lines++;
  return Math.max(0, lines - 1);
}

const HIERARCHY_LEVELS = ["program", "activity", "output", "suboutput", "component", "subcomponent"] as const;
const levelCodes = (row: SipekaRow) => [row.KODE_PROGRAM, row.KODE_KEGIATAN, row.KODE_OUTPUT, row.KODE_SUBOUTPUT, row.KODE_KOMPONEN, row.KODE_SUBKOMPONEN];

/**
 * Nama tingkat hierarki dari baris judul (HEADER1/HEADER2): baris judul menamai tingkat terdalam yang kodenya terisi
 * (`URAIAN_ITEM`). Subkomponen sudah punya kolom sendiri (`URAIAN_SUBKOMPONEN`), jadi hanya program..komponen yang disimpan (D4).
 * Kosong (null) bila berkas tidak memuat baris judul di tingkat itu.
 */
function createHierarchyNames() {
  const names = new Map<string, string>();
  const keyOf = (row: SipekaRow, depth: number) => `${row.KDSATKER}|${levelCodes(row).slice(0, depth).join("|")}`;
  const depthOf = (row: SipekaRow) => { const codes = levelCodes(row); let depth = 0; codes.forEach((code, index) => { if (code) depth = index + 1; }); return depth; };
  return {
    add(row: SipekaRow) {
      const depth = depthOf(row);
      const name = row.URAIAN_ITEM.trim();
      if (depth >= 1 && depth <= 5 && name) names.set(keyOf(row, depth), name);
    },
    lookup(row: SipekaRow): HierarchyNames | null {
      const found: HierarchyNames = {};
      for (let depth = 1; depth <= 5; depth++) {
        const name = names.get(keyOf(row, depth));
        if (name) found[HIERARCHY_LEVELS[depth - 1] as keyof HierarchyNames] = name;
      }
      return Object.keys(found).length ? found : null;
    }
  };
}

async function peekMeta(path: string) {
  const stats = newParseStats();
  try {
    for await (const { row } of readSnapshotRows(path, stats)) return { organizationCode: row.BAES1, fiscalYear: row.TAHUN };
  } catch (error) {
    if (error instanceof CsvFormatError) throw new IngestError(error.message, 400);
    throw error;
  }
  throw new IngestError(stats.rowErrorCount > 0 ? "Tidak ada baris item yang valid pada berkas." : "Berkas tidak memuat item detail.", 400);
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

function toItem(row: ParsedRow["row"], documentId: string, workUnitId: string, keyOf: ReturnType<typeof createItemKeyer>, hierarchyNames: HierarchyNames | null): typeof rkaItems.$inferSelect {
  const itemKey = keyOf({
    satkerCode: row.KDSATKER, programCode: row.KODE_PROGRAM, activityCode: row.KODE_KEGIATAN, outputCode: row.KODE_OUTPUT,
    suboutputCode: row.KODE_SUBOUTPUT, componentCode: row.KODE_KOMPONEN, subcomponentCode: row.KODE_SUBKOMPONEN, description: row.URAIAN_ITEM
  });
  return {
    id: newId("item"), documentId, workUnitId,
    programCode: row.KODE_PROGRAM, activityCode: row.KODE_KEGIATAN, outputCode: row.KODE_OUTPUT, suboutputCode: row.KODE_SUBOUTPUT,
    componentCode: row.KODE_KOMPONEN, subcomponentCode: row.KODE_SUBKOMPONEN, subcomponentName: row.URAIAN_SUBKOMPONEN ?? null, hierarchyNames,
    accountCode: row.KODE_AKUN, description: row.URAIAN_ITEM, consItem: row.CONS_ITEM ?? null, nomorItem: row.NOMOR_ITEM ?? null,
    quantity: row.VOLKEG, unit: row.SATKEG ?? null, unitPrice: row.HARGASAT, totalAmount: row.TOTAL,
    volumeDetail: { vol1: row.VOL_KEG_1, sat1: row.SAT_KEG_1 ?? null, vol2: row.VOL_KEG_2, sat2: row.SAT_KEG_2 ?? null, vol3: row.VOL_KEG_3, sat3: row.SAT_KEG_3 ?? null, vol4: row.VOL_KEG_4, sat4: row.SAT_KEG_4 ?? null },
    blokirCode: row.KODE_BLOKIR ?? null, blokirAmount: row.KODE_BLOKIR ? row.NILAI_BLOKIR : null,
    itemKey, sipekaIdItem: row.ID_ITEM ?? null, changeType: "baru", previousItemId: null
  };
}

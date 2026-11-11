/**
 * Logika CHR Fase 4: pembuatan catatan (editor dan adendum), penerbitan, tanggapan, hak aksi, dan data cetak.
 * Semua fungsi tulis dipanggil di dalam `database.transaction` oleh route; galat bisnis dilempar sebagai `ChrError`.
 */
import { and, eq, like } from "drizzle-orm";
import {
  canTransition, buildChrNumber, groupLetter, parseChrNumber,
  type ChrIssueResponse, type ChrPermissionsDto, type ChrPrintGroup, type ChrPrintResponse, type ChrVersionSnapshot, type CreateNoteBody, type Role
} from "@nirmala/shared";
import { NOTE_CATEGORIES } from "@nirmala/shared";
import type { Db } from "../db/client.js";
import { chrDocuments, chrNotes, organizationUnits, reviewCycles, reviewerDecisions, workUnits } from "../db/schema.js";
import { newId } from "../lib/security.js";
import { recordAudit } from "../repositories/audit.js";
import {
  currentVersionNumber, findChrById, findVersionSnapshot, insertVersion, loadChrDocumentDto, loadDocumentNotes, type ChrDocumentRow
} from "../repositories/chr.js";
import { buildRuleHits, isLatestSnapshot, loadItemRecord, resolveDecision } from "./triageDetail.js";

export class ChrError extends Error {
  constructor(readonly status: 400 | 403 | 404 | 409, message: string) {
    super(message);
  }
}

export const LOCKED_MESSAGE = "CHR sudah terbit dan terkunci. Gunakan adendum.";

export interface PrintConfig {
  organizationName: string;
  unitName: string;
  address: string | null;
  signatoryCity: string;
  signatoryTitle: string;
  signatoryName: string | null;
  signatoryNip: string | null;
}

/** Kop dan penandatangan dari variabel lingkungan `PRINT_*` (kontrak §4, A11). */
export function printConfigFromEnv(env: Record<string, string | undefined> = process.env): PrintConfig {
  const optional = (value: string | undefined) => (value && value.trim() ? value.trim() : null);
  return {
    organizationName: optional(env.PRINT_ORGANIZATION_NAME) ?? "Kementerian Pekerjaan Umum",
    unitName: optional(env.PRINT_UNIT_NAME) ?? "Inspektorat Jenderal",
    address: optional(env.PRINT_ADDRESS),
    signatoryCity: optional(env.PRINT_SIGNATORY_CITY) ?? "Jakarta",
    signatoryTitle: optional(env.PRINT_SIGNATORY_TITLE) ?? "Inspektur Jenderal",
    signatoryName: optional(env.PRINT_SIGNATORY_NAME),
    signatoryNip: optional(env.PRINT_SIGNATORY_NIP)
  };
}

/** Hak aksi pengguna pada dokumen (dihitung dari peran dan status; scope sudah diperiksa route). */
export function chrPermissions(role: Role, status: ChrDocumentRow["status"], draftNotes: number): ChrPermissionsDto {
  const writer = role === "reviewer" || role === "admin";
  const locked = status !== "draft";
  return {
    canEditNotes: writer && !locked,
    canEditRecommendation: writer && !locked,
    canIssue: writer && !locked && draftNotes > 0,
    canAddAddendum: writer && locked,
    canRespond: (role === "uki" || role === "admin") && locked
  };
}

export function assertDraft(chr: ChrDocumentRow) {
  if (chr.status !== "draft") throw new ChrError(409, LOCKED_MESSAGE);
}

export interface NoteActor { id: string; role: Role }

/**
 * Memvalidasi dan menyisipkan satu catatan baru ke CHR. `status` = `draf` (editor) atau `menunggu_revisi` (adendum).
 * Catatan dari item juga membuat keputusan `confirm` (item menjadi "sudah ditinjau").
 */
export async function insertNote(db: Db, chr: ChrDocumentRow, input: CreateNoteBody, actor: NoteActor, mode: "editor" | "adendum"): Promise<string> {
  const action = mode === "editor" ? "konfirmasi" : "adendum_tambah";
  const status = canTransition(action, null, actor.role);
  if (!status) throw new ChrError(403, "Peran Anda tidak memiliki akses ke sumber daya ini.");
  const now = Date.now();
  let workUnitId: string | null = null;
  let itemKey: string | null = null;
  let ruleId: string | null = null;
  let title = input.title ?? null;
  let record: Awaited<ReturnType<typeof loadItemRecord>>;

  if (input.rkaItemId) {
    record = await loadItemRecord(db, input.rkaItemId);
    if (!record) throw new ChrError(404, "Item tidak ditemukan.");
    if (record.document.organizationUnitId !== chr.organizationUnitId || record.document.cycleId !== chr.cycleId) throw new ChrError(409, "Item bukan bagian dari eselon I CHR ini.");
    if (!(await isLatestSnapshot(db, record.document))) throw new ChrError(409, "Item berasal dari snapshot lama.");
    const [existing] = await db.select({ id: chrNotes.id }).from(chrNotes).where(eq(chrNotes.rkaItemId, record.item.id)).limit(1);
    if (existing || (await resolveDecision(db, record.item))) throw new ChrError(409, "Item ini sudah ditinjau.");
    workUnitId = record.item.workUnitId;
    itemKey = record.item.itemKey;
    title ??= record.item.description;
    ruleId = (await buildRuleHits(db, record.item.id))[0]?.ruleId ?? null;
  } else {
    const [unit] = await db.select({ id: workUnits.id, organizationUnitId: workUnits.organizationUnitId }).from(workUnits).where(eq(workUnits.id, input.workUnitId!)).limit(1);
    if (!unit) throw new ChrError(404, "Satker tidak ditemukan.");
    if (unit.organizationUnitId !== chr.organizationUnitId) throw new ChrError(409, "Satker bukan bagian dari eselon I CHR ini.");
    workUnitId = unit.id;
  }

  const noteId = newId("note");
  if (record) await db.insert(reviewerDecisions).values({ id: newId("decision"), rkaItemId: record.item.id, reviewerUserId: actor.id, decision: "confirm", reasonCategory: null, note: null, createdAt: now });
  await db.insert(chrNotes).values({
    id: noteId, chrDocumentId: chr.id, rkaItemId: record?.item.id ?? null, itemKey, workUnitId, ruleId, title, category: input.category, text: input.text,
    expectation: input.expectation, status, createdBy: actor.id, createdAt: now, updatedAt: now
  });
  return noteId;
}

/** Nomor urut berikutnya: `MAX(urut)+1` atas semua CHR bernomor pada siklus yang sama (semua eselon I). */
export async function nextChrSequence(db: Db, cycleId: string): Promise<number> {
  const rows = await db.select({ number: chrDocuments.documentNumber }).from(chrDocuments).where(and(eq(chrDocuments.cycleId, cycleId), like(chrDocuments.documentNumber, "CHR/%")));
  return rows.reduce((highest, row) => Math.max(highest, parseChrNumber(row.number ?? "")?.sequence ?? 0), 0) + 1;
}

/** Terbitkan CHR (kontrak §4 `issue`). Harus dipanggil di dalam transaksi; keadaan dibaca ulang di sini. */
export async function issueChr(db: Db, chrId: string, actor: NoteActor): Promise<ChrIssueResponse> {
  const chr = await findChrById(db, chrId);
  if (!chr) throw new ChrError(404, "CHR tidak ditemukan.");
  if (chr.status !== "draft") throw new ChrError(409, "CHR sudah terbit.");
  const notes = await db.select().from(chrNotes).where(and(eq(chrNotes.chrDocumentId, chrId), eq(chrNotes.status, "draf")));
  if (notes.length === 0) throw new ChrError(409, "Tidak ada catatan Draf untuk diterbitkan.");

  const [cycle] = await db.select().from(reviewCycles).where(eq(reviewCycles.id, chr.cycleId)).limit(1);
  const [unit] = await db.select().from(organizationUnits).where(eq(organizationUnits.id, chr.organizationUnitId)).limit(1);
  const documentNumber = buildChrNumber({ organizationCode: unit.code, fiscalYear: cycle.fiscalYear, stage: cycle.stage, sequence: await nextChrSequence(db, chr.cycleId) });
  const now = Date.now();
  await db.update(chrDocuments).set({ status: "issued", documentNumber, issuedAt: now, issuedBy: actor.id, updatedAt: now }).where(eq(chrDocuments.id, chrId));
  for (const note of notes) {
    const next = canTransition("terbitkan", note.status, actor.role);
    if (!next) throw new ChrError(403, "Peran Anda tidak memiliki akses ke sumber daya ini.");
    await db.update(chrNotes).set({ status: next, updatedAt: now }).where(eq(chrNotes.id, note.id));
  }
  const version = await insertVersion(db, { chrId, reason: "terbit", addendumReason: null, createdBy: actor.id });
  await recordAudit(db, {
    actorId: actor.id, action: "chr.issued", entityType: "chr_document", entityId: chrId,
    detail: `CHR ${documentNumber} diterbitkan untuk ${unit.shortName}: ${notes.length} catatan.`,
    before: { status: "draft", documentNumber: null }, after: { status: "issued", documentNumber, organizationUnitId: unit.id, notesCount: notes.length, version: version.versionNumber }
  });
  return { document: await loadChrDocumentDto(db, chrId), version, notesTransitioned: notes.length };
}

// ---------------------------------------------------------------- Cetak (S7)

function printGroups(notes: ChrVersionSnapshot["notes"]): ChrPrintGroup[] {
  const groups: ChrPrintGroup[] = [];
  for (const category of NOTE_CATEGORIES) {
    const inCategory = notes.filter((note) => note.category === category).sort((a, b) => a.number - b.number);
    if (!inCategory.length) continue;
    groups.push({
      category, letter: groupLetter(groups.length),
      rows: inCategory.map((note) => ({ number: note.number, workUnitName: note.workUnitName, itemDescription: note.title, accountCode: note.accountCode, text: note.text, expectation: note.expectation }))
    });
  }
  return groups;
}

/**
 * Data cetak. Draf (belum ada versi) memakai data saat ini. Versi terbaru memakai catatan dari snapshot-nya tetapi status,
 * rekomendasi, dan tanggapan terkini; versi lama memakai isi snapshot apa adanya.
 */
export async function buildPrint(db: Db, chrId: string, requestedVersion: number | undefined, config: PrintConfig): Promise<ChrPrintResponse> {
  const document = await loadChrDocumentDto(db, chrId);
  const latest = await currentVersionNumber(db, chrId);
  const version = requestedVersion ?? latest;
  if (requestedVersion !== undefined && requestedVersion > latest) throw new ChrError(404, "Versi CHR tidak ditemukan.");
  let notes: ChrVersionSnapshot["notes"];
  let recommendation = document.recommendation;
  let unitResponse = document.unitResponse;
  let status = document.status;
  let issuedAt = document.issuedAt;
  let documentNumber = document.documentNumber;
  if (version === 0) {
    notes = await loadDocumentNotes(db, chrId);
  } else {
    const snapshot = await findVersionSnapshot(db, chrId, version);
    if (!snapshot) throw new ChrError(404, "Versi CHR tidak ditemukan.");
    notes = snapshot.notes;
    if (version !== latest) {
      ({ recommendation, unitResponse, status, issuedAt, documentNumber } = snapshot.document);
    }
  }
  return {
    letterhead: { organizationName: config.organizationName, unitName: config.unitName, address: config.address },
    signatory: { city: config.signatoryCity, title: config.signatoryTitle, name: config.signatoryName, nip: config.signatoryNip },
    documentNumber, status, organizationUnitName: document.organizationUnitName, fiscalYear: document.fiscalYear, stage: document.stage, issuedAt,
    versionNumber: version, groups: printGroups(notes), recommendation, unitResponse, generatedAt: Date.now()
  };
}

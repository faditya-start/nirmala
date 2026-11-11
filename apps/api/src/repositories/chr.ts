/** Akses data CHR: dokumen, catatan, DTO, dan penyelesaian otomatis (docs/api-contract.md §2.2-2.4, §4). */
import { and, count, desc, eq, inArray, max } from "drizzle-orm";
import {
  NOTE_CATEGORIES, NOTE_STATUSES, groupLetter,
  type ChrDocumentDto, type ChrNoteDto, type ChrNoteGroupDto, type ChrRefDto, type ChrVersionSnapshot, type ChrVersionSummaryDto, type NoteStatusCounts
} from "@nirmala/shared";
import type { Db } from "../db/client.js";
import { chrDocuments, chrNotes, chrVersions, followUpChecks, organizationUnits, reviewCycles, rkaItems, rules, users, workUnits } from "../db/schema.js";
import { newId } from "../lib/security.js";
import { recordAudit } from "./audit.js";

export type ChrDocumentRow = typeof chrDocuments.$inferSelect;

export async function findChrByCycleOrg(db: Db, cycleId: string, organizationUnitId: string) {
  const [row] = await db.select().from(chrDocuments).where(and(eq(chrDocuments.cycleId, cycleId), eq(chrDocuments.organizationUnitId, organizationUnitId))).limit(1);
  return row;
}

/** CHR (siklus, eselon I): dibuat berstatus `draft` bila belum ada. `created` true bila baru dibuat. */
export async function getOrCreateChr(db: Db, input: { cycleId: string; organizationUnitId: string; createdBy: string }) {
  const existing = await findChrByCycleOrg(db, input.cycleId, input.organizationUnitId);
  if (existing) return { chr: existing, created: false };
  const now = Date.now();
  const id = newId("chr");
  await db.insert(chrDocuments).values({ id, cycleId: input.cycleId, organizationUnitId: input.organizationUnitId, status: "draft", createdBy: input.createdBy, createdAt: now, updatedAt: now });
  const [chr] = await db.select().from(chrDocuments).where(eq(chrDocuments.id, id));
  return { chr, created: true };
}

export async function chrRef(db: Db, chr: ChrDocumentRow): Promise<ChrRefDto> {
  const [unit] = await db.select({ shortName: organizationUnits.shortName }).from(organizationUnits).where(eq(organizationUnits.id, chr.organizationUnitId));
  return { id: chr.id, documentNumber: chr.documentNumber, status: chr.status, organizationUnitName: unit?.shortName ?? "" };
}

/** Semua catatan satu CHR sebagai `ChrNoteDto`, urut tampilan (kategori, `createdAt`, id); `number` = posisi 1..n. */
export async function loadDocumentNotes(db: Db, chrId: string): Promise<ChrNoteDto[]> {
  const rows = await db.select({
    note: chrNotes, workUnitCode: workUnits.code, workUnitName: workUnits.name, accountCode: rkaItems.accountCode, itemDescription: rkaItems.description,
    ruleCode: rules.code, createdByName: users.displayName
  }).from(chrNotes)
    .leftJoin(workUnits, eq(workUnits.id, chrNotes.workUnitId)).leftJoin(rkaItems, eq(rkaItems.id, chrNotes.rkaItemId))
    .leftJoin(rules, eq(rules.id, chrNotes.ruleId)).leftJoin(users, eq(users.id, chrNotes.createdBy))
    .where(eq(chrNotes.chrDocumentId, chrId));
  rows.sort((a, b) => NOTE_CATEGORIES.indexOf(a.note.category) - NOTE_CATEGORIES.indexOf(b.note.category) || a.note.createdAt - b.note.createdAt || a.note.id.localeCompare(b.note.id));
  const checks = rows.length
    ? await db.select({ noteId: followUpChecks.noteId, result: followUpChecks.result }).from(followUpChecks).where(inArray(followUpChecks.noteId, rows.map((row) => row.note.id))).orderBy(desc(followUpChecks.checkedAt))
    : [];
  const latest = new Map<string, ChrNoteDto["latestCheckResult"]>();
  for (const check of checks) if (!latest.has(check.noteId)) latest.set(check.noteId, check.result);
  return rows.map((row, index) => {
    const { note } = row;
    return {
      id: note.id, chrDocumentId: note.chrDocumentId, number: index + 1,
      rkaItemId: note.rkaItemId, workUnitId: note.workUnitId, workUnitCode: row.workUnitCode, workUnitName: row.workUnitName, accountCode: row.accountCode,
      title: note.title ?? row.itemDescription ?? "", category: note.category, text: note.text, expectation: note.expectation, status: note.status,
      ruleId: note.ruleId, ruleCode: row.ruleCode, justification: note.justification, closedAt: note.closedAt, latestCheckResult: latest.get(note.id) ?? null,
      createdByName: row.createdByName ?? "", createdAt: note.createdAt, updatedAt: note.updatedAt
    };
  });
}

/** `ChrNoteDto` lengkap. `number` = urutan tampilan di dokumen (urut kategori lalu `createdAt`). */
export async function loadNoteDto(db: Db, noteId: string): Promise<ChrNoteDto> {
  const [note] = await db.select({ chrDocumentId: chrNotes.chrDocumentId }).from(chrNotes).where(eq(chrNotes.id, noteId)).limit(1);
  if (!note) throw new Error(`Catatan ${noteId} tidak ditemukan.`);
  const found = (await loadDocumentNotes(db, note.chrDocumentId)).find((entry) => entry.id === noteId);
  if (!found) throw new Error(`Catatan ${noteId} tidak ditemukan.`);
  return found;
}

/** Kelompok per kategori (hanya yang berisi), huruf A, B, ... menurut urutan yang tampil. */
export function groupNotes(notes: ChrNoteDto[]): ChrNoteGroupDto[] {
  const groups: ChrNoteGroupDto[] = [];
  for (const category of NOTE_CATEGORIES) {
    const inCategory = notes.filter((note) => note.category === category);
    if (inCategory.length) groups.push({ category, letter: groupLetter(groups.length), notes: inCategory });
  }
  return groups;
}

export function countByStatus(notes: { status: ChrNoteDto["status"] }[]): NoteStatusCounts {
  const counts = Object.fromEntries(NOTE_STATUSES.map((status) => [status, 0])) as NoteStatusCounts;
  for (const note of notes) counts[note.status] += 1;
  return counts;
}

export async function findChrById(db: Db, id: string) {
  const [row] = await db.select().from(chrDocuments).where(eq(chrDocuments.id, id)).limit(1);
  return row;
}

export async function currentVersionNumber(db: Db, chrId: string): Promise<number> {
  const [row] = await db.select({ latest: max(chrVersions.versionNumber) }).from(chrVersions).where(eq(chrVersions.chrId, chrId));
  return row?.latest ?? 0;
}

export async function loadChrDocumentDto(db: Db, chrId: string): Promise<ChrDocumentDto> {
  const [row] = await db.select({
    chr: chrDocuments, cycleName: reviewCycles.name, fiscalYear: reviewCycles.fiscalYear, stage: reviewCycles.stage,
    orgCode: organizationUnits.code, orgShortName: organizationUnits.shortName
  }).from(chrDocuments).innerJoin(reviewCycles, eq(reviewCycles.id, chrDocuments.cycleId)).innerJoin(organizationUnits, eq(organizationUnits.id, chrDocuments.organizationUnitId))
    .where(eq(chrDocuments.id, chrId)).limit(1);
  if (!row) throw new Error(`CHR ${chrId} tidak ditemukan.`);
  const { chr } = row;
  const names = new Map<string, string>();
  const userIds = [chr.unitResponseBy, chr.issuedBy].filter((id): id is string => Boolean(id));
  if (userIds.length) for (const user of await db.select({ id: users.id, name: users.displayName }).from(users).where(inArray(users.id, userIds))) names.set(user.id, user.name);
  return {
    id: chr.id, cycleId: chr.cycleId, cycleName: row.cycleName, fiscalYear: row.fiscalYear, stage: row.stage,
    organizationUnitId: chr.organizationUnitId, organizationUnitCode: row.orgCode, organizationUnitName: row.orgShortName,
    status: chr.status, documentNumber: chr.documentNumber, recommendation: chr.recommendation,
    unitResponse: chr.unitResponse, unitResponseByName: chr.unitResponseBy ? (names.get(chr.unitResponseBy) ?? null) : null, unitResponseAt: chr.unitResponseAt,
    issuedAt: chr.issuedAt, issuedByName: chr.issuedBy ? (names.get(chr.issuedBy) ?? null) : null, completedAt: chr.completedAt,
    currentVersion: await currentVersionNumber(db, chr.id), createdAt: chr.createdAt, updatedAt: chr.updatedAt
  };
}

/** Ringkasan satu baris `chr_versions`; `notesCount` dan `addendumReason` dibaca dari isi snapshot. */
export function toVersionSummary(row: { versionNumber: number; reason: "terbit" | "adendum"; createdAt: number; snapshot: unknown }, createdByName: string): ChrVersionSummaryDto {
  const snapshot = row.snapshot as ChrVersionSnapshot;
  return { versionNumber: row.versionNumber, reason: row.reason, createdByName, createdAt: row.createdAt, notesCount: snapshot.notes.length, addendumReason: snapshot.addendumReason ?? null };
}

export async function listVersionRows(db: Db, chrId: string) {
  return db.select({ id: chrVersions.id, versionNumber: chrVersions.versionNumber, reason: chrVersions.reason, createdAt: chrVersions.createdAt, snapshot: chrVersions.snapshot, createdByName: users.displayName })
    .from(chrVersions).leftJoin(users, eq(users.id, chrVersions.createdBy)).where(eq(chrVersions.chrId, chrId)).orderBy(chrVersions.versionNumber);
}

/** Menulis versi baru dari keadaan dokumen dan catatan saat ini. Panggil di dalam transaksi, setelah perubahan lain selesai. */
export async function insertVersion(db: Db, input: { chrId: string; reason: "terbit" | "adendum"; addendumReason: string | null; createdBy: string }): Promise<ChrVersionSummaryDto> {
  const document = await loadChrDocumentDto(db, input.chrId);
  const notes = await loadDocumentNotes(db, input.chrId);
  const snapshot: ChrVersionSnapshot = {
    document: { documentNumber: document.documentNumber, recommendation: document.recommendation, unitResponse: document.unitResponse, status: document.status, issuedAt: document.issuedAt },
    notes, addendumReason: input.addendumReason
  };
  const versionNumber = (await currentVersionNumber(db, input.chrId)) + 1;
  const createdAt = Date.now();
  await db.insert(chrVersions).values({ id: newId("chrver"), chrId: input.chrId, versionNumber, snapshot: snapshot as unknown as Record<string, unknown>, reason: input.reason, createdBy: input.createdBy, createdAt });
  const [actor] = await db.select({ name: users.displayName }).from(users).where(eq(users.id, input.createdBy)).limit(1);
  return toVersionSummary({ versionNumber, reason: input.reason, createdAt, snapshot }, actor?.name ?? "");
}

/**
 * Menyamakan status dokumen dengan catatannya (§2.4). Panggil di transaksi yang sama dengan perubahan status catatan
 * (Fase 5: setujui, terima justifikasi, setujui massal; Fase 4: adendum).
 * - `issued` dan semua catatan (>= 1) `closed` -> `completed` (`completedAt` diisi, audit `chr.completed`).
 * - `completed` dan ada catatan yang belum `closed` -> kembali `issued` (`completedAt` kosong).
 * - `draft` tidak pernah berubah. Sistem tidak pernah menutup catatan: fungsi ini hanya membaca status catatan.
 * Mengembalikan status dokumen sesudahnya dan apakah baru saja menjadi `completed`.
 */
export async function syncChrCompletion(db: Db, chrId: string, actorId: string | null): Promise<{ status: ChrDocumentDto["status"]; justCompleted: boolean }> {
  const chr = await findChrById(db, chrId);
  if (!chr) throw new Error(`CHR ${chrId} tidak ditemukan.`);
  if (chr.status === "draft") return { status: "draft", justCompleted: false };
  const [{ total }] = await db.select({ total: count() }).from(chrNotes).where(eq(chrNotes.chrDocumentId, chrId));
  const [{ open }] = await db.select({ open: count() }).from(chrNotes).where(and(eq(chrNotes.chrDocumentId, chrId), inArray(chrNotes.status, ["draf", "menunggu_revisi", "perlu_verifikasi", "dijustifikasi"])));
  const allClosed = total > 0 && open === 0;
  const now = Date.now();
  if (chr.status === "issued" && allClosed) {
    await db.update(chrDocuments).set({ status: "completed", completedAt: now, updatedAt: now }).where(eq(chrDocuments.id, chrId));
    await recordAudit(db, { actorId, action: "chr.completed", entityType: "chr_document", entityId: chrId, detail: `CHR ${chr.documentNumber ?? chrId} selesai: semua catatan closed.`, before: { status: "issued" }, after: { status: "completed" } });
    return { status: "completed", justCompleted: true };
  }
  if (chr.status === "completed" && !allClosed) {
    await db.update(chrDocuments).set({ status: "issued", completedAt: null, updatedAt: now }).where(eq(chrDocuments.id, chrId));
    return { status: "issued", justCompleted: false };
  }
  return { status: chr.status, justCompleted: false };
}

export async function findVersionSnapshot(db: Db, chrId: string, versionNumber: number): Promise<ChrVersionSnapshot | undefined> {
  const [row] = await db.select({ snapshot: chrVersions.snapshot }).from(chrVersions).where(and(eq(chrVersions.chrId, chrId), eq(chrVersions.versionNumber, versionNumber))).limit(1);
  return row?.snapshot as unknown as ChrVersionSnapshot | undefined;
}

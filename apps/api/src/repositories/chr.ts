/**
 * Akses data CHR yang dibutuhkan Fase 3 (konfirmasi triage membuat CHR draf dan catatan `draf`).
 * Endpoint CHR lengkap (Fase 4) memakai dan memperluas modul ini.
 */
import { and, desc, eq } from "drizzle-orm";
import { NOTE_CATEGORIES, type ChrNoteDto, type ChrRefDto } from "@nirmala/shared";
import type { Db } from "../db/client.js";
import { chrDocuments, chrNotes, followUpChecks, organizationUnits, rkaItems, rules, users, workUnits } from "../db/schema.js";
import { newId } from "../lib/security.js";

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

/** `ChrNoteDto` lengkap. `number` = urutan tampilan di dokumen (urut kategori lalu `createdAt`). */
export async function loadNoteDto(db: Db, noteId: string): Promise<ChrNoteDto> {
  const [row] = await db.select({
    note: chrNotes, workUnitCode: workUnits.code, workUnitName: workUnits.name, accountCode: rkaItems.accountCode, itemDescription: rkaItems.description,
    ruleCode: rules.code, createdByName: users.displayName
  }).from(chrNotes)
    .leftJoin(workUnits, eq(workUnits.id, chrNotes.workUnitId)).leftJoin(rkaItems, eq(rkaItems.id, chrNotes.rkaItemId))
    .leftJoin(rules, eq(rules.id, chrNotes.ruleId)).leftJoin(users, eq(users.id, chrNotes.createdBy))
    .where(eq(chrNotes.id, noteId)).limit(1);
  if (!row) throw new Error(`Catatan ${noteId} tidak ditemukan.`);
  const siblings = await db.select({ id: chrNotes.id, category: chrNotes.category, createdAt: chrNotes.createdAt }).from(chrNotes).where(eq(chrNotes.chrDocumentId, row.note.chrDocumentId));
  siblings.sort((a, b) => NOTE_CATEGORIES.indexOf(a.category) - NOTE_CATEGORIES.indexOf(b.category) || a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  const [latestCheck] = await db.select({ result: followUpChecks.result }).from(followUpChecks).where(eq(followUpChecks.noteId, noteId)).orderBy(desc(followUpChecks.checkedAt)).limit(1);
  const { note } = row;
  return {
    id: note.id, chrDocumentId: note.chrDocumentId, number: siblings.findIndex((entry) => entry.id === note.id) + 1,
    rkaItemId: note.rkaItemId, workUnitId: note.workUnitId, workUnitCode: row.workUnitCode, workUnitName: row.workUnitName, accountCode: row.accountCode,
    title: note.title ?? row.itemDescription ?? "", category: note.category, text: note.text, expectation: note.expectation, status: note.status,
    ruleId: note.ruleId, ruleCode: row.ruleCode, justification: note.justification, closedAt: note.closedAt, latestCheckResult: latestCheck?.result ?? null,
    createdByName: row.createdByName ?? "", createdAt: note.createdAt, updatedAt: note.updatedAt
  };
}

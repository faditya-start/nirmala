/**
 * Cek tindak lanjut otomatis saat snapshot revisi (v >= 2) diimpor (docs/api-contract.md §2.5 langkah 3).
 * Dijalankan di dalam transaksi impor, SESUDAH deteksi aturan dan skor.
 *
 * Aturan keras: sistem tidak pernah menutup catatan. Satu-satunya perubahan status di sini adalah transisi
 * `cek_otomatis` (`menunggu_revisi` -> `perlu_verifikasi`) lewat `canTransition(..., "sistem")`, yang tidak pernah menghasilkan `closed`.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import { canTransition } from "@nirmala/shared";
import type { Db } from "../db/client.js";
import { chrDocuments, chrNotes, followUpChecks, rkaDocuments, rkaItems, rules } from "../db/schema.js";
import { newId } from "../lib/security.js";
import { recordAudit } from "../repositories/audit.js";
import { latestChecksByNote } from "../repositories/tracker.js";
import { checkExpectation, type CheckableItem } from "./expectationChecker.js";

const CHUNK = 400;

export interface FollowUpSnapshot { id: string; cycleId: string; organizationUnitId: string; versionNo: number }
export interface FollowUpSummary { checked: number; movedToVerification: number }

type ItemRow = typeof rkaItems.$inferSelect;
const toCheckable = (item: ItemRow): CheckableItem => ({
  accountCode: item.accountCode, description: item.description, quantity: item.quantity, unit: item.unit, unitPrice: item.unitPrice,
  totalAmount: item.totalAmount, blokirCode: item.blokirCode, volumeDetail: item.volumeDetail
});

async function loadItems(db: Db, ids: string[]): Promise<Map<string, ItemRow>> {
  const found = new Map<string, ItemRow>();
  for (let index = 0; index < ids.length; index += CHUNK) {
    for (const row of await db.select().from(rkaItems).where(inArray(rkaItems.id, ids.slice(index, index + CHUNK)))) found.set(row.id, row);
  }
  return found;
}

/**
 * Cek semua catatan `menunggu_revisi` dan `perlu_verifikasi` pada CHR eselon I snapshot ini (siklus yang sama).
 * Catatan `dijustifikasi` dan `draf` tidak dicek. Aman dipanggil ulang: catatan yang sudah punya cek untuk snapshot ini dilewati.
 */
export async function runFollowUpChecks(db: Db, snapshot: FollowUpSnapshot): Promise<FollowUpSummary> {
  if (snapshot.versionNo < 2) return { checked: 0, movedToVerification: 0 };

  const notes = await db.select({ note: chrNotes, ruleCode: rules.code }).from(chrNotes)
    .innerJoin(chrDocuments, eq(chrDocuments.id, chrNotes.chrDocumentId)).leftJoin(rules, eq(rules.id, chrNotes.ruleId))
    .where(and(eq(chrDocuments.cycleId, snapshot.cycleId), eq(chrDocuments.organizationUnitId, snapshot.organizationUnitId), inArray(chrNotes.status, ["menunggu_revisi", "perlu_verifikasi"])))
    .orderBy(asc(chrNotes.createdAt), asc(chrNotes.id));
  if (notes.length === 0) return { checked: 0, movedToVerification: 0 };

  const noteIds = notes.map((entry) => entry.note.id);
  const alreadyChecked = new Set<string>();
  for (let index = 0; index < noteIds.length; index += CHUNK) {
    for (const row of await db.select({ noteId: followUpChecks.noteId }).from(followUpChecks)
      .where(and(eq(followUpChecks.documentId, snapshot.id), inArray(followUpChecks.noteId, noteIds.slice(index, index + CHUNK))))) alreadyChecked.add(row.noteId);
  }
  const pending = notes.filter((entry) => !alreadyChecked.has(entry.note.id));
  if (pending.length === 0) return { checked: 0, movedToVerification: 0 };

  // Snapshot eselon I ini (urut versi) untuk menelusuri rantai padanan lintas versi.
  const documents = await db.select({ id: rkaDocuments.id, versionNo: rkaDocuments.versionNo }).from(rkaDocuments)
    .where(and(eq(rkaDocuments.cycleId, snapshot.cycleId), eq(rkaDocuments.organizationUnitId, snapshot.organizationUnitId))).orderBy(asc(rkaDocuments.versionNo));
  const versionOfDocument = new Map(documents.map((document) => [document.id, document.versionNo]));

  const baseIds = pending.flatMap((entry) => (entry.note.rkaItemId ? [entry.note.rkaItemId] : []));
  const baseItems = await loadItems(db, baseIds);
  const latest = await latestChecksByNote(db, pending.map((entry) => entry.note.id));

  // Titik awal rantai: padanan cek terakhir (bila ada), selain itu item dasar. Rantai putus (padanan null) = tidak ditemukan.
  interface Cursor { itemId: string | null; version: number }
  const cursors = new Map<string, Cursor>();
  for (const { note } of pending) {
    const previous = latest.get(note.id);
    if (previous) cursors.set(note.id, { itemId: previous.matchedItemId, version: previous.snapshotVersionNo });
    else if (note.rkaItemId) cursors.set(note.id, { itemId: note.rkaItemId, version: versionOfDocument.get(baseItems.get(note.rkaItemId)?.documentId ?? "") ?? 1 });
    else cursors.set(note.id, { itemId: null, version: 0 });
  }
  for (const document of documents.filter((entry) => entry.versionNo <= snapshot.versionNo)) {
    const active = [...cursors.values()].filter((cursor) => cursor.itemId !== null && cursor.version < document.versionNo);
    if (active.length === 0) continue;
    const matches = new Map<string, string>(); // padanan item sebelumnya -> item di snapshot ini
    const wanted = [...new Set(active.map((cursor) => cursor.itemId!))];
    for (let index = 0; index < wanted.length; index += CHUNK) {
      for (const row of await db.select({ id: rkaItems.id, previousItemId: rkaItems.previousItemId }).from(rkaItems)
        .where(and(eq(rkaItems.documentId, document.id), inArray(rkaItems.previousItemId, wanted.slice(index, index + CHUNK))))) {
        if (row.previousItemId) matches.set(row.previousItemId, row.id);
      }
    }
    for (const cursor of cursors.values()) {
      if (cursor.itemId === null || cursor.version >= document.versionNo) continue;
      cursor.itemId = matches.get(cursor.itemId) ?? null;
      cursor.version = document.versionNo;
    }
  }
  const matchedItems = await loadItems(db, [...new Set([...cursors.values()].flatMap((cursor) => (cursor.itemId ? [cursor.itemId] : [])))]);

  const now = Date.now();
  let movedToVerification = 0;
  for (const { note, ruleCode } of pending) {
    const matchedId = cursors.get(note.id)?.itemId ?? null;
    const base = note.rkaItemId ? baseItems.get(note.rkaItemId) : undefined;
    const match = matchedId ? matchedItems.get(matchedId) : undefined;
    const { result, evidence } = checkExpectation({ expectation: note.expectation, base: base ? toCheckable(base) : null, match: match ? toCheckable(match) : null, ruleCode });
    await db.insert(followUpChecks).values({ id: newId("check"), noteId: note.id, documentId: snapshot.id, matchedItemId: match?.id ?? null, result, evidence, checkedAt: now });

    const next = canTransition("cek_otomatis", note.status, "sistem");
    if (next) {
      await db.update(chrNotes).set({ status: next, updatedAt: now }).where(eq(chrNotes.id, note.id));
      movedToVerification += 1;
    } else await db.update(chrNotes).set({ updatedAt: now }).where(eq(chrNotes.id, note.id));
    await recordAudit(db, {
      actorId: null, action: "note.checked", entityType: "chr_note", entityId: note.id,
      detail: `Cek otomatis snapshot v${snapshot.versionNo}: ${result}.`,
      before: { status: note.status }, after: { status: next ?? note.status, result, snapshotVersionNo: snapshot.versionNo, documentId: snapshot.id }
    });
  }
  return { checked: pending.length, movedToVerification };
}

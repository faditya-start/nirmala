/** Akses data Smart Tracker: cek tindak lanjut terbaru, catatan terbit, dan hitungan antrean (docs/api-contract.md §5). */
import { and, desc, eq, inArray } from "drizzle-orm";
import type { CheckResult, Evidence } from "@nirmala/shared";
import type { Db } from "../db/client.js";
import { chrDocuments, chrNotes, followUpChecks, rkaDocuments } from "../db/schema.js";

const CHUNK = 400;

export interface CheckRecord {
  id: string;
  noteId: string;
  documentId: string;
  matchedItemId: string | null;
  result: CheckResult;
  evidence: Evidence;
  checkedAt: number;
  snapshotVersionNo: number;
  snapshotLabel: string;
  reviewerAction: "setujui" | "kembalikan" | null;
  reviewerNote: string | null;
}

/** Semua cek untuk sekumpulan catatan, urut terbaru dahulu (versi snapshot menurun, lalu waktu cek). */
export async function listChecks(db: Db, noteIds: string[]): Promise<CheckRecord[]> {
  const rows: CheckRecord[] = [];
  for (let index = 0; index < noteIds.length; index += CHUNK) {
    const part = await db.select({
      id: followUpChecks.id, noteId: followUpChecks.noteId, documentId: followUpChecks.documentId, matchedItemId: followUpChecks.matchedItemId,
      result: followUpChecks.result, evidence: followUpChecks.evidence, checkedAt: followUpChecks.checkedAt,
      snapshotVersionNo: rkaDocuments.versionNo, snapshotLabel: rkaDocuments.label,
      reviewerAction: followUpChecks.reviewerAction, reviewerNote: followUpChecks.reviewerNote
    }).from(followUpChecks).innerJoin(rkaDocuments, eq(rkaDocuments.id, followUpChecks.documentId))
      .where(inArray(followUpChecks.noteId, noteIds.slice(index, index + CHUNK))).orderBy(desc(rkaDocuments.versionNo), desc(followUpChecks.checkedAt));
    rows.push(...part);
  }
  return rows;
}

/** Cek terbaru per catatan (snapshot dengan versi tertinggi). */
export async function latestChecksByNote(db: Db, noteIds: string[]): Promise<Map<string, CheckRecord>> {
  const latest = new Map<string, CheckRecord>();
  for (const check of await listChecks(db, noteIds)) if (!latest.has(check.noteId)) latest.set(check.noteId, check);
  return latest;
}

export type TrackerNoteRecord = {
  note: typeof chrNotes.$inferSelect;
  chr: typeof chrDocuments.$inferSelect;
};

/** Catatan + CHR-nya. */
export async function findNoteRecord(db: Db, noteId: string): Promise<TrackerNoteRecord | undefined> {
  const [row] = await db.select({ note: chrNotes, chr: chrDocuments }).from(chrNotes)
    .innerJoin(chrDocuments, eq(chrDocuments.id, chrNotes.chrDocumentId)).where(eq(chrNotes.id, noteId)).limit(1);
  return row;
}

export async function findNoteRecords(db: Db, noteIds: string[]): Promise<Map<string, TrackerNoteRecord>> {
  const found = new Map<string, TrackerNoteRecord>();
  for (let index = 0; index < noteIds.length; index += CHUNK) {
    for (const row of await db.select({ note: chrNotes, chr: chrDocuments }).from(chrNotes)
      .innerJoin(chrDocuments, eq(chrDocuments.id, chrNotes.chrDocumentId)).where(inArray(chrNotes.id, noteIds.slice(index, index + CHUNK)))) found.set(row.note.id, row);
  }
  return found;
}

/** Tandai cek terbaru catatan dengan aksi reviewer (setujui / kembalikan). Tidak melakukan apa pun bila belum ada cek. */
export async function markLatestCheck(db: Db, noteId: string, action: "setujui" | "kembalikan", reviewerId: string, note: string | null, at: number): Promise<string | null> {
  const [latest] = await listChecks(db, [noteId]);
  if (!latest) return null;
  await db.update(followUpChecks).set({ reviewerAction: action, reviewerNote: note, reviewedBy: reviewerId, reviewedAt: at }).where(and(eq(followUpChecks.id, latest.id)));
  return latest.id;
}

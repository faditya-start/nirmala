/** Hitungan antrean untuk "Perlu tindakan" dan badge navigasi (docs/api-contract.md §2.9). `scope` null = semua eselon I. */
import { and, count, desc, eq, inArray, or, isNull } from "drizzle-orm";
import type { NeedsActionItem, NeedsActionResponse, NoteStatus, Role } from "@nirmala/shared";
import type { Db } from "../db/client.js";
import { chrDocuments, chrNotes, followUpChecks } from "../db/schema.js";
import { countUnreviewedFlagged } from "./triage.js";

const inScope = (scope: string[] | null) => (scope === null ? undefined : inArray(chrDocuments.organizationUnitId, scope));
const isEmptyScope = (scope: string[] | null) => scope !== null && scope.length === 0;

export async function countNotes(db: Db, cycleId: string, scope: string[] | null, status: NoteStatus): Promise<number> {
  if (isEmptyScope(scope)) return 0;
  const [row] = await db.select({ total: count() }).from(chrNotes).innerJoin(chrDocuments, eq(chrDocuments.id, chrNotes.chrDocumentId))
    .where(and(eq(chrDocuments.cycleId, cycleId), inScope(scope), eq(chrNotes.status, status)));
  return row.total;
}

/** Catatan `perlu_verifikasi` yang hasil cek terakhirnya bukan `terpenuhi` (bisa dijustifikasi PIC UKI). */
async function countVerifiableAgainstEvidence(db: Db, cycleId: string, scope: string[] | null): Promise<number> {
  if (isEmptyScope(scope)) return 0;
  const notes = await db.select({ id: chrNotes.id }).from(chrNotes).innerJoin(chrDocuments, eq(chrDocuments.id, chrNotes.chrDocumentId))
    .where(and(eq(chrDocuments.cycleId, cycleId), inScope(scope), eq(chrNotes.status, "perlu_verifikasi")));
  if (notes.length === 0) return 0;
  const checks = await db.select({ noteId: followUpChecks.noteId, result: followUpChecks.result }).from(followUpChecks)
    .where(inArray(followUpChecks.noteId, notes.map((note) => note.id))).orderBy(desc(followUpChecks.checkedAt));
  const latest = new Map<string, string>();
  for (const check of checks) if (!latest.has(check.noteId)) latest.set(check.noteId, check.result);
  return notes.filter((note) => latest.get(note.id) !== "terpenuhi").length;
}

async function draftChrsWithNotes(db: Db, cycleId: string, scope: string[] | null) {
  if (isEmptyScope(scope)) return [];
  const rows = await db.select({ id: chrDocuments.id, notes: count(chrNotes.id) }).from(chrDocuments).leftJoin(chrNotes, eq(chrNotes.chrDocumentId, chrDocuments.id))
    .where(and(eq(chrDocuments.cycleId, cycleId), inScope(scope), eq(chrDocuments.status, "draft"))).groupBy(chrDocuments.id);
  return rows.filter((row) => row.notes > 0).map((row) => row.id);
}

async function issuedChrsWithoutResponse(db: Db, cycleId: string, scope: string[] | null) {
  if (isEmptyScope(scope)) return [];
  const rows = await db.select({ id: chrDocuments.id }).from(chrDocuments)
    .where(and(eq(chrDocuments.cycleId, cycleId), inScope(scope), inArray(chrDocuments.status, ["issued", "completed"]), or(isNull(chrDocuments.unitResponse), eq(chrDocuments.unitResponse, ""))));
  return rows.map((row) => row.id);
}

export const chrHref = (ids: string[]) => (ids.length === 1 ? `/chr/${ids[0]}` : "/chr");

export async function needsAction(db: Db, role: Role, scope: string[] | null, cycleId: string): Promise<NeedsActionResponse> {
  const items: NeedsActionItem[] = [];
  const add = (label: string, href: string, total: number) => { if (total > 0) items.push({ label, href, count: total }); };

  if (role === "reviewer" || role === "admin") {
    add("Catatan perlu verifikasi", "/tracker?status=perlu_verifikasi", await countNotes(db, cycleId, scope, "perlu_verifikasi"));
    const drafts = await draftChrsWithNotes(db, cycleId, scope);
    add("CHR draf siap diterbitkan", chrHref(drafts), drafts.length);
    add("Item kena aturan belum ditinjau", "/triage?onlyFlagged=true&decision=belum_ditinjau", await countUnreviewedFlagged(db, cycleId, scope));
  } else if (role === "uki") {
    add("Catatan menunggu revisi", "/tracker?status=menunggu_revisi", await countNotes(db, cycleId, scope, "menunggu_revisi"));
    add("Catatan belum terpenuhi, bisa dijustifikasi", "/tracker?status=perlu_verifikasi", await countVerifiableAgainstEvidence(db, cycleId, scope));
    const missing = await issuedChrsWithoutResponse(db, cycleId, scope);
    add("CHR menunggu tanggapan eselon I", chrHref(missing), missing.length);
  }
  return { count: items.reduce((sum, item) => sum + item.count, 0), items };
}

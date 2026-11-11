/** Progres per Satker (S10): siap diajukan dan terakhir bergerak (docs/api-contract.md §2.4, §5 `GET /api/satker/progress`). */
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import {
  TRACKER_STATUSES,
  type SatkerOpenNotePreview, type SatkerProgressResponse, type SatkerProgressRow, type SatkerReadiness, type TrackerStatus
} from "@nirmala/shared";
import type { SatkerProgressSort } from "@nirmala/shared";
import type { Db } from "../db/client.js";
import { chrDocuments, chrNotes, organizationUnits, reviewCycles, rkaDocuments, rkaItems, workUnits } from "../db/schema.js";
import { findChrByCycleOrg } from "../repositories/chr.js";
import { latestChecksByNote } from "../repositories/tracker.js";
import { calendarDaysUntil } from "../lib/calendar.js";

const zeroCounts = () => Object.fromEntries(TRACKER_STATUSES.map((status) => [status, 0])) as Record<TrackerStatus, number>;

export async function buildSatkerProgress(db: Db, cycleId: string, organizationUnitId: string, sort: SatkerProgressSort): Promise<SatkerProgressResponse> {
  const [organization] = await db.select({ id: organizationUnits.id, code: organizationUnits.code, shortName: organizationUnits.shortName, name: organizationUnits.name })
    .from(organizationUnits).where(eq(organizationUnits.id, organizationUnitId)).limit(1);
  const [cycle] = await db.select({ adkDeadline: reviewCycles.adkDeadline }).from(reviewCycles).where(eq(reviewCycles.id, cycleId)).limit(1);
  const units = await db.select({ id: workUnits.id, code: workUnits.code, name: workUnits.name }).from(workUnits).where(eq(workUnits.organizationUnitId, organizationUnitId)).orderBy(asc(workUnits.code));
  const chr = await findChrByCycleOrg(db, cycleId, organizationUnitId);

  // Catatan pada CHR yang sudah terbit (draf tidak dihitung).
  const notes = await db.select({ note: chrNotes, issuedAt: chrDocuments.issuedAt }).from(chrNotes).innerJoin(chrDocuments, eq(chrDocuments.id, chrNotes.chrDocumentId))
    .where(and(eq(chrDocuments.cycleId, cycleId), eq(chrDocuments.organizationUnitId, organizationUnitId), ne(chrDocuments.status, "draft"), ne(chrNotes.status, "draf")));
  const checks = await latestChecksByNote(db, notes.map((entry) => entry.note.id));

  const noteWorkUnits = [...new Set(notes.flatMap((entry) => (entry.note.workUnitId ? [entry.note.workUnitId] : [])))];
  // Impor snapshot eselon I yang memuat item Satker itu.
  const snapshotImports = new Map<string, number>(); // workUnitId -> waktu impor terbaru
  if (noteWorkUnits.length) {
    const documents = await db.select({ id: rkaDocuments.id, importedAt: rkaDocuments.importedAt }).from(rkaDocuments)
      .where(and(eq(rkaDocuments.cycleId, cycleId), eq(rkaDocuments.organizationUnitId, organizationUnitId)));
    const importedAt = new Map(documents.map((document) => [document.id, document.importedAt]));
    if (documents.length) {
      for (const row of await db.selectDistinct({ documentId: rkaItems.documentId, workUnitId: rkaItems.workUnitId }).from(rkaItems)
        .where(and(inArray(rkaItems.documentId, documents.map((document) => document.id)), inArray(rkaItems.workUnitId, noteWorkUnits)))) {
        const at = importedAt.get(row.documentId) ?? 0;
        if (at > (snapshotImports.get(row.workUnitId) ?? 0)) snapshotImports.set(row.workUnitId, at);
      }
    }
  }

  const items: SatkerProgressRow[] = units.map((unit) => {
    const own = notes.filter((entry) => entry.note.workUnitId === unit.id);
    const counts = zeroCounts();
    let lastMovedAt = null as number | null;
    const bump = (at: number | null | undefined) => { if (at && (lastMovedAt === null || at > lastMovedAt)) lastMovedAt = at; };
    for (const { note } of own) {
      counts[note.status as TrackerStatus] += 1;
      bump(note.updatedAt); bump(note.closedAt);
      bump(checks.get(note.id)?.checkedAt);
    }
    if (own.length) bump(snapshotImports.get(unit.id));
    const notesTotal = own.length;
    const readiness: SatkerReadiness = notesTotal === 0 ? "tidak_ada_catatan" : counts.closed === notesTotal ? "siap_diajukan" : "belum_siap";
    return { workUnitId: unit.id, workUnitCode: unit.code, workUnitName: unit.name, counts, notesTotal, lastMovedAt: notesTotal ? lastMovedAt : null, readiness };
  });

  const open = (row: SatkerProgressRow) => row.notesTotal - row.counts.closed;
  items.sort((a, b) => {
    if ((a.readiness === "tidak_ada_catatan") !== (b.readiness === "tidak_ada_catatan")) return a.readiness === "tidak_ada_catatan" ? 1 : -1;
    let order = 0;
    if (sort === "name") order = a.workUnitName.localeCompare(b.workUnitName);
    else if (sort === "open_notes") order = open(b) - open(a) || (a.lastMovedAt ?? 0) - (b.lastMovedAt ?? 0);
    else order = (a.lastMovedAt ?? 0) - (b.lastMovedAt ?? 0);
    return order || a.workUnitCode.localeCompare(b.workUnitCode);
  });

  const withNotes = items.filter((row) => row.notesTotal > 0);
  const openNotes = notes.filter((entry) => entry.note.status !== "closed")
    .sort((a, b) => (a.issuedAt ?? a.note.createdAt) - (b.issuedAt ?? b.note.createdAt) || a.note.createdAt - b.note.createdAt || a.note.id.localeCompare(b.note.id));
  const unitName = new Map(units.map((unit) => [unit.id, unit.name]));
  const openNotesPreview: SatkerOpenNotePreview[] = openNotes.slice(0, 3).map(({ note }) => ({
    noteId: note.id, workUnitName: note.workUnitId ? (unitName.get(note.workUnitId) ?? null) : null, title: note.title ?? "", status: note.status as TrackerStatus,
    latestCheckResult: checks.get(note.id)?.result ?? null
  }));
  const adkDeadline = cycle?.adkDeadline ?? null;

  return {
    organizationUnit: organization, cycleId,
    chr: chr ? { id: chr.id, documentNumber: chr.documentNumber, status: chr.status } : null,
    summary: {
      satkerTotal: items.length, satkerWithNotes: withNotes.length, satkerWithoutNotes: items.length - withNotes.length,
      satkerReady: withNotes.filter((row) => row.readiness === "siap_diajukan").length, openNotes: openNotes.length, openNotesPreview,
      adkDeadline, daysToAdkDeadline: adkDeadline === null ? null : calendarDaysUntil(adkDeadline)
    },
    items
  };
}

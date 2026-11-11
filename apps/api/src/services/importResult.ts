import { and, count, eq, inArray } from "drizzle-orm";
import type { ImportRecheckedNote, ImportResultDto, ImportRuleHitCount, SnapshotDto } from "@nirmala/shared";
import type { Db } from "../db/client.js";
import { auditLogs, chrNotes, followUpChecks, rkaItems, ruleHits, rules, workUnits } from "../db/schema.js";
import { findSnapshotRowErrors } from "../repositories/snapshots.js";

/** Hasil impor satu snapshot, seluruhnya diturunkan dari data tersimpan (docs/api-contract.md §3.2). */
export async function buildImportResult(db: Db, snapshot: SnapshotDto): Promise<ImportResultDto> {
  const rowErrors = await findSnapshotRowErrors(db, snapshot.id);
  const hitRows = await db.select({ ruleId: rules.id, code: rules.code, name: rules.name, itemCount: count() }).from(ruleHits)
    .innerJoin(rkaItems, eq(rkaItems.id, ruleHits.rkaItemId)).innerJoin(rules, eq(rules.id, ruleHits.ruleId))
    .where(eq(rkaItems.documentId, snapshot.id)).groupBy(rules.id, rules.code, rules.name).orderBy(rules.code);
  const ruleHitCounts: ImportRuleHitCount[] = hitRows;

  const checks = await db.select({
    noteId: chrNotes.id, title: chrNotes.title, itemDescription: rkaItems.description, workUnitName: workUnits.name, category: chrNotes.category,
    expectation: chrNotes.expectation, status: chrNotes.status, result: followUpChecks.result, evidence: followUpChecks.evidence
  }).from(followUpChecks).innerJoin(chrNotes, eq(chrNotes.id, followUpChecks.noteId))
    .leftJoin(rkaItems, eq(rkaItems.id, chrNotes.rkaItemId)).leftJoin(workUnits, eq(workUnits.id, chrNotes.workUnitId))
    .where(eq(followUpChecks.documentId, snapshot.id)).orderBy(followUpChecks.checkedAt);
  const recheckedNotes: ImportRecheckedNote[] = checks.map((check) => ({
    noteId: check.noteId, title: check.title ?? check.itemDescription ?? "", workUnitName: check.workUnitName ?? "", category: check.category,
    expectation: check.expectation, result: check.result, evidence: check.evidence
  }));

  // Catatan yang benar-benar berpindah menunggu_revisi -> perlu_verifikasi oleh cek snapshot ini (dari audit `note.checked`, A47).
  const checkedIds = checks.map((check) => check.noteId);
  const audits = checkedIds.length
    ? await db.select({ before: auditLogs.before, after: auditLogs.after }).from(auditLogs).where(and(eq(auditLogs.action, "note.checked"), inArray(auditLogs.entityId, checkedIds)))
    : [];
  const notesMovedToVerification = audits.filter((audit) =>
    (audit.after as { documentId?: string } | null)?.documentId === snapshot.id && (audit.before as { status?: string } | null)?.status === "menunggu_revisi").length;

  const diff = snapshot.diffSummary;
  return {
    snapshot,
    rowsRead: snapshot.rowCount + snapshot.headerRowsSkipped + snapshot.rowErrorCount,
    headerRowsSkipped: snapshot.headerRowsSkipped,
    itemsSaved: snapshot.rowCount,
    rowErrorCount: snapshot.rowErrorCount,
    rowErrors,
    diff,
    itemsAssessed: diff ? diff.baru + diff.berubah : snapshot.rowCount,
    ruleHits: ruleHitCounts,
    recheckedNotes,
    notesMovedToVerification
  };
}

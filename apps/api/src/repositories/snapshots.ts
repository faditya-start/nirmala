import { and, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { organizationUnits, rkaDocuments } from "../db/schema.js";

const columns = {
  id: rkaDocuments.id, cycleId: rkaDocuments.cycleId, organizationUnitId: rkaDocuments.organizationUnitId,
  organizationUnitCode: organizationUnits.code, organizationUnitName: organizationUnits.shortName,
  versionNo: rkaDocuments.versionNo, label: rkaDocuments.label, sourceFileName: rkaDocuments.sourceFileName,
  rowCount: rkaDocuments.rowCount, headerRowsSkipped: rkaDocuments.headerRowsSkipped,
  importedAt: rkaDocuments.importedAt, diffSummary: rkaDocuments.diffSummary
};

/** `scope` null = semua eselon I. */
export async function listSnapshots(db: Db, cycleId: string, scope: string[] | null) {
  if (scope && scope.length === 0) return [];
  const where = scope ? and(eq(rkaDocuments.cycleId, cycleId), inArray(rkaDocuments.organizationUnitId, scope)) : eq(rkaDocuments.cycleId, cycleId);
  return db.select(columns).from(rkaDocuments).innerJoin(organizationUnits, eq(organizationUnits.id, rkaDocuments.organizationUnitId)).where(where).orderBy(organizationUnits.code, desc(rkaDocuments.versionNo));
}

export async function findSnapshot(db: Db, id: string) {
  const [snapshot] = await db.select(columns).from(rkaDocuments).innerJoin(organizationUnits, eq(organizationUnits.id, rkaDocuments.organizationUnitId)).where(eq(rkaDocuments.id, id)).limit(1);
  return snapshot;
}

export async function findSnapshotByHash(db: Db, fileHash: string) {
  const [snapshot] = await db.select(columns).from(rkaDocuments).innerJoin(organizationUnits, eq(organizationUnits.id, rkaDocuments.organizationUnitId)).where(eq(rkaDocuments.fileHash, fileHash)).limit(1);
  return snapshot;
}

export async function latestSnapshot(db: Db, cycleId: string, organizationUnitId: string) {
  const [snapshot] = await db.select({ id: rkaDocuments.id, versionNo: rkaDocuments.versionNo }).from(rkaDocuments)
    .where(and(eq(rkaDocuments.cycleId, cycleId), eq(rkaDocuments.organizationUnitId, organizationUnitId)))
    .orderBy(desc(rkaDocuments.versionNo)).limit(1);
  return snapshot;
}

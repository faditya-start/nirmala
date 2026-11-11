import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { SnapshotDto } from "@nirmala/shared";
import type { Db } from "../db/client.js";
import { organizationUnits, rkaDocuments, users } from "../db/schema.js";

const columns = {
  id: rkaDocuments.id, cycleId: rkaDocuments.cycleId, organizationUnitId: rkaDocuments.organizationUnitId,
  organizationUnitCode: organizationUnits.code, organizationUnitName: organizationUnits.shortName,
  versionNo: rkaDocuments.versionNo, label: rkaDocuments.label, sourceFileName: rkaDocuments.sourceFileName,
  rowCount: rkaDocuments.rowCount, headerRowsSkipped: rkaDocuments.headerRowsSkipped,
  importedAt: rkaDocuments.importedAt, diffSummary: rkaDocuments.diffSummary,
  importedByUserId: rkaDocuments.importedBy, importedByName: users.displayName,
  rowErrorCount: rkaDocuments.rowErrorCount, importDurationMs: rkaDocuments.importDurationMs
};

const base = (db: Db) => db.select(columns).from(rkaDocuments)
  .innerJoin(organizationUnits, eq(organizationUnits.id, rkaDocuments.organizationUnitId))
  .leftJoin(users, eq(users.id, rkaDocuments.importedBy));

/** `scope` null = semua eselon I. */
export async function listSnapshots(db: Db, cycleId: string, scope: string[] | null): Promise<SnapshotDto[]> {
  if (scope && scope.length === 0) return [];
  const where = scope ? and(eq(rkaDocuments.cycleId, cycleId), inArray(rkaDocuments.organizationUnitId, scope)) : eq(rkaDocuments.cycleId, cycleId);
  return base(db).where(where).orderBy(organizationUnits.code, desc(rkaDocuments.versionNo));
}

/** Snapshot satu siklus, urut eselon I lalu versi naik (untuk tabel ringkasan impor). */
export async function listSnapshotsAscending(db: Db, cycleId: string, scope: string[] | null): Promise<SnapshotDto[]> {
  if (scope && scope.length === 0) return [];
  const where = scope ? and(eq(rkaDocuments.cycleId, cycleId), inArray(rkaDocuments.organizationUnitId, scope)) : eq(rkaDocuments.cycleId, cycleId);
  return base(db).where(where).orderBy(asc(organizationUnits.code), asc(rkaDocuments.versionNo));
}

export async function findSnapshot(db: Db, id: string): Promise<SnapshotDto | undefined> {
  const [snapshot] = await base(db).where(eq(rkaDocuments.id, id)).limit(1);
  return snapshot;
}

export async function findSnapshotByHash(db: Db, fileHash: string): Promise<SnapshotDto | undefined> {
  const [snapshot] = await base(db).where(eq(rkaDocuments.fileHash, fileHash)).limit(1);
  return snapshot;
}

export async function findSnapshotRowErrors(db: Db, id: string) {
  const [row] = await db.select({ rowErrors: rkaDocuments.rowErrors }).from(rkaDocuments).where(eq(rkaDocuments.id, id)).limit(1);
  return row?.rowErrors ?? [];
}

export async function latestSnapshot(db: Db, cycleId: string, organizationUnitId: string) {
  const [snapshot] = await db.select({ id: rkaDocuments.id, versionNo: rkaDocuments.versionNo }).from(rkaDocuments)
    .where(and(eq(rkaDocuments.cycleId, cycleId), eq(rkaDocuments.organizationUnitId, organizationUnitId)))
    .orderBy(desc(rkaDocuments.versionNo)).limit(1);
  return snapshot;
}

/** Snapshot terbaru tiap eselon I pada siklus (dalam scope). */
export async function latestSnapshotsInCycle(db: Db, cycleId: string, scope: string[] | null) {
  const all = await listSnapshots(db, cycleId, scope);
  const byOrg = new Map<string, SnapshotDto>();
  for (const snapshot of all) if (!byOrg.has(snapshot.organizationUnitId)) byOrg.set(snapshot.organizationUnitId, snapshot); // urut versi menurun
  return [...byOrg.values()].sort((a, b) => a.organizationUnitCode.localeCompare(b.organizationUnitCode));
}

/**
 * Kueri Risk Triage (docs/api-contract.md §3.3). Item yang tampil = item di snapshot terbaru tiap eselon I pada siklus,
 * dalam scope pengguna. Semua kondisi filter dibuat sebagai ekspresi Drizzle (subquery IN), sehingga daftar, hitungan,
 * ringkasan, dan navigasi memakai definisi filter yang sama.
 */
import { and, asc, count, desc, eq, inArray, isNotNull, isNull, ne, notInArray, or, sql, type SQL } from "drizzle-orm";
import type { SnapshotDto, TriageDecision, TriageFilter, TriageSnapshotInfo, TriageSort, TriageSummary } from "@nirmala/shared";
import type { Db } from "../db/client.js";
import { chrNotes, reviewerDecisions, riskAssessments, riskConfig, rkaItems, ruleHits, rules, workUnits } from "../db/schema.js";
import { latestSnapshotsInCycle } from "./snapshots.js";

export type TriageFilterInput = Omit<TriageFilter, "cycleId"> & { cycleId?: string };

export interface TriageSnapshotScope {
  snapshots: SnapshotDto[];
  documentIds: string[];
}

/** Snapshot terbaru tiap eselon I dalam scope (disaring `organizationUnitId` bila ada). */
export async function resolveTriageSnapshots(db: Db, cycleId: string, scope: string[] | null, organizationUnitId?: string): Promise<TriageSnapshotScope> {
  const latest = await latestSnapshotsInCycle(db, cycleId, scope);
  const snapshots = organizationUnitId ? latest.filter((snapshot) => snapshot.organizationUnitId === organizationUnitId) : latest;
  return { snapshots, documentIds: snapshots.map((snapshot) => snapshot.id) };
}

export function toSnapshotInfo(snapshot: SnapshotDto): TriageSnapshotInfo {
  return { id: snapshot.id, organizationUnitId: snapshot.organizationUnitId, organizationUnitName: snapshot.organizationUnitName, versionNo: snapshot.versionNo, label: snapshot.label, itemCount: snapshot.rowCount };
}

/**
 * Konfigurasi skor yang dipakai tampilan: yang terbaru yang sudah punya penilaian untuk snapshot ini.
 * Setelah versi bobot baru dibuat tetapi belum "dihitung ulang", tampilan tetap memakai skor versi sebelumnya.
 */
export async function resolveScoreConfigId(db: Db, documentIds: string[]): Promise<string | null> {
  if (documentIds.length === 0) return null;
  const configs = await db.select({ id: riskConfig.id }).from(riskConfig).orderBy(desc(riskConfig.createdAt), desc(riskConfig.id));
  for (const config of configs) {
    const [found] = await db.select({ id: riskAssessments.id }).from(riskAssessments).innerJoin(rkaItems, eq(rkaItems.id, riskAssessments.rkaItemId))
      .where(and(eq(riskAssessments.riskConfigId, config.id), inArray(rkaItems.documentId, documentIds))).limit(1);
    if (found) return config.id;
  }
  return null;
}

// ---------------------------------------------------------------- Ekspresi filter

const flaggedItemIds = (db: Db) => db.select({ id: ruleHits.rkaItemId }).from(ruleHits);
const decidedItemIds = (db: Db, decision?: "confirm" | "dismiss") => db.select({ id: reviewerDecisions.rkaItemId }).from(reviewerDecisions).where(decision ? eq(reviewerDecisions.decision, decision) : undefined);

/** Item berkeputusan sendiri atau mewarisi keputusan padanannya (hanya item `tetap`). */
function decisionCondition(db: Db, decision: TriageDecision): SQL {
  if (decision === "belum_ditinjau") {
    return and(
      notInArray(rkaItems.id, decidedItemIds(db)),
      or(ne(rkaItems.changeType, "tetap"), isNull(rkaItems.previousItemId), notInArray(rkaItems.previousItemId, decidedItemIds(db)))
    )!;
  }
  return or(
    inArray(rkaItems.id, decidedItemIds(db, decision)),
    and(notInArray(rkaItems.id, decidedItemIds(db)), eq(rkaItems.changeType, "tetap"), inArray(rkaItems.previousItemId, decidedItemIds(db, decision)))
  )!;
}

/** Kondisi dasar (siklus + snapshot terbaru + Satker). `workUnit` saja = definisi ringkasan. */
function baseConditions(documentIds: string[], workUnitId?: string): SQL[] {
  return [inArray(rkaItems.documentId, documentIds), ...(workUnitId ? [eq(rkaItems.workUnitId, workUnitId)] : [])];
}

function listConditions(db: Db, filter: TriageFilterInput, documentIds: string[]): SQL[] {
  const conditions = baseConditions(documentIds, filter.workUnitId);
  if (filter.onlyFlagged) conditions.push(inArray(rkaItems.id, flaggedItemIds(db)));
  if (filter.ruleCode || filter.ruleCategory) {
    const hits = db.select({ id: ruleHits.rkaItemId }).from(ruleHits).innerJoin(rules, eq(rules.id, ruleHits.ruleId))
      .where(and(filter.ruleCode ? eq(rules.code, filter.ruleCode) : undefined, filter.ruleCategory ? eq(rules.category, filter.ruleCategory) : undefined));
    conditions.push(inArray(rkaItems.id, hits));
  }
  if (filter.decision) conditions.push(decisionCondition(db, filter.decision));
  if (filter.q) conditions.push(sql`instr(lower(${rkaItems.description}), ${filter.q.toLowerCase()}) > 0`);
  return conditions;
}

// ---------------------------------------------------------------- Daftar, hitungan, ringkasan

export interface TriageQueryOptions {
  filter: TriageFilterInput;
  documentIds: string[];
  scoreConfigId: string | null;
  sort: TriageSort;
  dir: "asc" | "desc";
}

function orderBy(db: Db, { sort, dir }: Pick<TriageQueryOptions, "sort" | "dir">) {
  const direction = dir === "asc" ? asc : desc;
  const score = riskAssessments.score;
  switch (sort) {
    case "score": return [direction(score), desc(rkaItems.totalAmount), asc(rkaItems.id)];
    case "total": return [direction(rkaItems.totalAmount), asc(rkaItems.id)];
    case "description": return [direction(rkaItems.description), asc(rkaItems.id)];
    // Kena aturan dahulu, lalu skor menurun (tanpa skor terakhir), lalu total menurun, lalu id.
    default: return [desc(inArray(rkaItems.id, flaggedItemIds(db))), desc(score), desc(rkaItems.totalAmount), asc(rkaItems.id)];
  }
}

export interface TriageRowData {
  id: string;
  documentId: string;
  workUnitId: string;
  workUnitCode: string;
  workUnitName: string;
  accountCode: string;
  description: string;
  totalAmount: number;
  changeType: typeof rkaItems.$inferSelect["changeType"];
  previousItemId: string | null;
  score: number | null;
  category: string | null;
}

function rowsQuery(db: Db, options: TriageQueryOptions) {
  return db.select({
    id: rkaItems.id, documentId: rkaItems.documentId, workUnitId: rkaItems.workUnitId, workUnitCode: workUnits.code, workUnitName: workUnits.name,
    accountCode: rkaItems.accountCode, description: rkaItems.description, totalAmount: rkaItems.totalAmount, changeType: rkaItems.changeType,
    previousItemId: rkaItems.previousItemId, score: riskAssessments.score, category: riskAssessments.category
  }).from(rkaItems)
    .innerJoin(workUnits, eq(workUnits.id, rkaItems.workUnitId))
    .leftJoin(riskAssessments, and(eq(riskAssessments.rkaItemId, rkaItems.id), eq(riskAssessments.riskConfigId, options.scoreConfigId ?? "")))
    .where(and(...listConditions(db, options.filter, options.documentIds)))
    .orderBy(...orderBy(db, options));
}

export async function listTriageRows(db: Db, options: TriageQueryOptions, page: { limit: number; offset: number }): Promise<TriageRowData[]> {
  if (options.documentIds.length === 0) return [];
  return rowsQuery(db, options).limit(page.limit).offset(page.offset);
}

/** Id item urut sesuai daftar (untuk navigasi Sebelumnya/Berikutnya), dibatasi `limit`. */
export async function listTriageIds(db: Db, options: TriageQueryOptions, limit: number): Promise<string[]> {
  if (options.documentIds.length === 0) return [];
  return (await rowsQuery(db, options).limit(limit)).map((row) => row.id);
}

export async function countTriageRows(db: Db, filter: TriageFilterInput, documentIds: string[]): Promise<number> {
  if (documentIds.length === 0) return 0;
  const [row] = await db.select({ total: count() }).from(rkaItems).where(and(...listConditions(db, filter, documentIds)));
  return row.total;
}

/** Ringkasan: hanya siklus + eselon I + Satker yang berpengaruh (filter lain diabaikan). */
export async function triageSummary(db: Db, documentIds: string[], workUnitId: string | undefined, scoreConfigId: string | null): Promise<TriageSummary> {
  if (documentIds.length === 0) return { analyzedItems: 0, flaggedItems: 0, unreviewedFlaggedItems: 0 };
  const base = baseConditions(documentIds, workUnitId);
  const countWhere = async (...extra: SQL[]) => (await db.select({ total: count() }).from(rkaItems).where(and(...base, ...extra)))[0].total;
  const assessed = scoreConfigId ? db.select({ id: riskAssessments.rkaItemId }).from(riskAssessments).where(eq(riskAssessments.riskConfigId, scoreConfigId)) : null;
  return {
    analyzedItems: assessed ? await countWhere(inArray(rkaItems.id, assessed)) : 0,
    flaggedItems: await countWhere(inArray(rkaItems.id, flaggedItemIds(db))),
    unreviewedFlaggedItems: await countWhere(inArray(rkaItems.id, flaggedItemIds(db)), decisionCondition(db, "belum_ditinjau"))
  };
}

/** Jumlah item kena aturan dan belum ditinjau pada snapshot terbaru (badge nav dan "Perlu tindakan"). */
export async function countUnreviewedFlagged(db: Db, cycleId: string, scope: string[] | null): Promise<number> {
  const { documentIds } = await resolveTriageSnapshots(db, cycleId, scope);
  return (await triageSummary(db, documentIds, undefined, null)).unreviewedFlaggedItems;
}

// ---------------------------------------------------------------- Pengayaan baris (aturan, keputusan, catatan)

export async function ruleCodesByItem(db: Db, itemIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (itemIds.length === 0) return map;
  const rows = await db.select({ itemId: ruleHits.rkaItemId, code: rules.code }).from(ruleHits).innerJoin(rules, eq(rules.id, ruleHits.ruleId)).where(inArray(ruleHits.rkaItemId, itemIds)).orderBy(asc(rules.code));
  for (const row of rows) map.set(row.itemId, [...(map.get(row.itemId) ?? []), row.code]);
  return map;
}

export async function decisionsByItem(db: Db, itemIds: string[]) {
  const map = new Map<string, typeof reviewerDecisions.$inferSelect>();
  if (itemIds.length === 0) return map;
  for (const row of await db.select().from(reviewerDecisions).where(inArray(reviewerDecisions.rkaItemId, itemIds))) map.set(row.rkaItemId, row);
  return map;
}

export async function notesByItem(db: Db, itemIds: string[]) {
  const map = new Map<string, { id: string; status: typeof chrNotes.$inferSelect["status"] }>();
  if (itemIds.length === 0) return map;
  for (const row of await db.select({ id: chrNotes.id, itemId: chrNotes.rkaItemId, status: chrNotes.status }).from(chrNotes).where(inArray(chrNotes.rkaItemId, itemIds))) if (row.itemId) map.set(row.itemId, { id: row.id, status: row.status });
  return map;
}

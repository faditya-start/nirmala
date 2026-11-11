/** Daftar Smart Tracker (S8): filter, hitungan tab, urutan, dan halaman (docs/api-contract.md §5 `GET /api/tracker/notes`). */
import { and, count, eq, inArray, ne, type SQL } from "drizzle-orm";
import { CHECK_RESULTS, NOTE_CATEGORIES } from "@nirmala/shared";
import { TRACKER_STATUSES, type TrackerChrContext, type TrackerListQuery, type TrackerListResponse, type TrackerNoteRow, type TrackerStatus } from "@nirmala/shared";
import type { Db } from "../db/client.js";
import { chrDocuments, chrNotes, organizationUnits, rkaItems, rules, workUnits } from "../db/schema.js";
import { latestChecksByNote } from "../repositories/tracker.js";

const DAY_MS = 86_400_000;

export function ageInDays(issuedAt: number, closedAt: number | null, now: number): number {
  return Math.max(0, Math.floor(((closedAt ?? now) - issuedAt) / DAY_MS));
}

/** Filter dasar (siklus, scope, eselon I, Satker, kategori) tanpa status; catatan `draf` dan CHR draf tidak pernah ikut. */
function baseFilters(query: TrackerListQuery, scope: string[] | null): SQL[] {
  const filters: SQL[] = [eq(chrDocuments.cycleId, query.cycleId), ne(chrDocuments.status, "draft"), ne(chrNotes.status, "draf")];
  if (scope !== null) filters.push(inArray(chrDocuments.organizationUnitId, scope));
  if (query.organizationUnitId) filters.push(eq(chrDocuments.organizationUnitId, query.organizationUnitId));
  if (query.workUnitId) filters.push(eq(chrNotes.workUnitId, query.workUnitId));
  if (query.category) filters.push(eq(chrNotes.category, query.category));
  return filters;
}

const CHECK_RANK = new Map<string, number>(CHECK_RESULTS.map((result, index) => [result, index]));

export async function listTrackerNotes(db: Db, query: TrackerListQuery, scope: string[] | null): Promise<TrackerListResponse> {
  const empty = scope !== null && scope.length === 0;
  const statusCounts = Object.fromEntries(TRACKER_STATUSES.map((status) => [status, 0])) as Record<TrackerStatus, number>;
  const pagination = (total: number) => ({ page: query.page, pageSize: query.pageSize, total, totalPages: Math.max(1, Math.ceil(total / query.pageSize)) });
  if (empty) return { items: [], pagination: pagination(0), statusCounts, chrDocuments: [] };

  const filters = baseFilters(query, scope);
  for (const row of await db.select({ status: chrNotes.status, total: count() }).from(chrNotes).innerJoin(chrDocuments, eq(chrDocuments.id, chrNotes.chrDocumentId))
    .where(and(...filters)).groupBy(chrNotes.status)) {
    if ((TRACKER_STATUSES as readonly string[]).includes(row.status)) statusCounts[row.status as TrackerStatus] = row.total;
  }

  const rows = await db.select({
    note: chrNotes, chrNumber: chrDocuments.documentNumber, chrIssuedAt: chrDocuments.issuedAt, organizationUnitId: chrDocuments.organizationUnitId,
    workUnitName: workUnits.name, itemDescription: rkaItems.description, itemAccount: rkaItems.accountCode, ruleCode: rules.code
  }).from(chrNotes).innerJoin(chrDocuments, eq(chrDocuments.id, chrNotes.chrDocumentId))
    .leftJoin(workUnits, eq(workUnits.id, chrNotes.workUnitId)).leftJoin(rkaItems, eq(rkaItems.id, chrNotes.rkaItemId)).leftJoin(rules, eq(rules.id, chrNotes.ruleId))
    .where(and(...filters, eq(chrNotes.status, query.status)));

  const latest = await latestChecksByNote(db, rows.map((row) => row.note.id));
  // Akun terkini: item padanan dari cek terakhir; selain itu akun item dasar.
  const matchedIds = [...latest.values()].flatMap((check) => (check.matchedItemId ? [check.matchedItemId] : []));
  const matchedAccount = new Map<string, string>();
  for (let index = 0; index < matchedIds.length; index += 400) {
    for (const item of await db.select({ id: rkaItems.id, accountCode: rkaItems.accountCode }).from(rkaItems).where(inArray(rkaItems.id, matchedIds.slice(index, index + 400)))) matchedAccount.set(item.id, item.accountCode);
  }

  const now = Date.now();
  let items: TrackerNoteRow[] = rows.map((row) => {
    const check = latest.get(row.note.id) ?? null;
    const issuedAt = row.chrIssuedAt ?? row.note.createdAt;
    return {
      id: row.note.id, chrDocumentId: row.note.chrDocumentId, chrDocumentNumber: row.chrNumber, organizationUnitId: row.organizationUnitId,
      workUnitId: row.note.workUnitId, workUnitName: row.workUnitName, title: row.note.title ?? row.itemDescription ?? "",
      accountCode: (check?.matchedItemId ? matchedAccount.get(check.matchedItemId) : undefined) ?? row.itemAccount ?? null,
      ruleCode: row.ruleCode, category: row.note.category, expectation: row.note.expectation, status: row.note.status as TrackerStatus,
      latestCheck: check ? { result: check.result, checkedAt: check.checkedAt, snapshotVersionNo: check.snapshotVersionNo, evidence: check.evidence } : null,
      chrIssuedAt: issuedAt, ageDays: ageInDays(issuedAt, row.note.status === "closed" ? row.note.closedAt : null, now),
      bulkApprovable: row.note.status === "perlu_verifikasi" && check?.result === "terpenuhi"
    };
  });
  if (query.checkResult) items = items.filter((item) => item.latestCheck?.result === query.checkResult);

  const direction = query.dir === "asc" ? 1 : -1;
  const compare = (a: TrackerNoteRow, b: TrackerNoteRow): number => {
    switch (query.sort) {
      case "satker": return (a.workUnitName ?? "").localeCompare(b.workUnitName ?? "");
      case "category": return NOTE_CATEGORIES.indexOf(a.category) - NOTE_CATEGORIES.indexOf(b.category);
      case "check": return (a.latestCheck ? (CHECK_RANK.get(a.latestCheck.result) ?? 99) : 99) - (b.latestCheck ? (CHECK_RANK.get(b.latestCheck.result) ?? 99) : 99);
      default: return a.ageDays - b.ageDays;
    }
  };
  items.sort((a, b) => direction * compare(a, b) || a.id.localeCompare(b.id));

  const total = items.length;
  const pageItems = items.slice((query.page - 1) * query.pageSize, query.page * query.pageSize);

  const chrWhere: SQL[] = [eq(chrDocuments.cycleId, query.cycleId), ne(chrDocuments.status, "draft")];
  if (scope !== null) chrWhere.push(inArray(chrDocuments.organizationUnitId, scope));
  if (query.organizationUnitId) chrWhere.push(eq(chrDocuments.organizationUnitId, query.organizationUnitId));
  const chrRows = await db.select({
    id: chrDocuments.id, documentNumber: chrDocuments.documentNumber, organizationUnitId: chrDocuments.organizationUnitId, organizationUnitName: organizationUnits.shortName,
    status: chrDocuments.status, issuedAt: chrDocuments.issuedAt
  }).from(chrDocuments).innerJoin(organizationUnits, eq(organizationUnits.id, chrDocuments.organizationUnitId)).where(and(...chrWhere)).orderBy(organizationUnits.code);
  const chrContexts: TrackerChrContext[] = chrRows;

  return { items: pageItems, pagination: pagination(total), statusCounts, chrDocuments: chrContexts };
}

/** Laporan (S11): metrik proses dan ekspor CSV (docs/api-contract.md §6.2). Angka mengikuti cakupan pengguna. */
import { NOTE_CATEGORIES, NOTE_STATUSES, REPORT_NOTES_CSV_COLUMNS, REPORT_SUMMARY_CSV_COLUMNS, daysBetween, expectationCode } from "@nirmala/shared";
import type { OrganizationUnitDto, ReportCsvDataset, ReportSummaryResponse, ReviewCycleDto } from "@nirmala/shared";
import type { Db } from "../db/client.js";
import { countDismissedItems, dismissReasonCounts } from "../repositories/reports.js";
import { latestSnapshotsInCycle } from "../repositories/snapshots.js";
import { latestChecksByNote } from "../repositories/tracker.js";
import { triageSummary } from "../repositories/triage.js";
import { chrDocuments } from "../db/schema.js";
import { and, eq, inArray, ne } from "drizzle-orm";
import { loadCoverageOrgs } from "./coverage.js";
import { closeDays, emptyCategoryCounts, isIssued, issuedAtOf, latestTime, loadNotes, median, percent } from "./noteMetrics.js";

export async function buildReportSummary(db: Db, cycle: ReviewCycleDto, orgIds: string[] | null, requestedOrg: OrganizationUnitDto | null): Promise<ReportSummaryResponse> {
  const orgs = await loadCoverageOrgs(db, orgIds);
  const coveredIds = orgs.map((org) => org.id);
  const notes = coveredIds.length ? await loadNotes(db, cycle.id, coveredIds) : [];
  const issued = notes.filter(isIssued);
  const closed = issued.filter((note) => note.status === "closed");
  const snapshots = coveredIds.length ? await latestSnapshotsInCycle(db, cycle.id, coveredIds) : [];
  const documentIds = snapshots.map((snapshot) => snapshot.id);

  const byCategory = emptyCategoryCounts();
  for (const note of issued) byCategory[note.category] += 1;
  const chrs = coveredIds.length
    ? await db.select({ documentNumber: chrDocuments.documentNumber, issuedAt: chrDocuments.issuedAt }).from(chrDocuments)
      .where(and(eq(chrDocuments.cycleId, cycle.id), inArray(chrDocuments.organizationUnitId, coveredIds), ne(chrDocuments.status, "draft")))
    : [];
  const days = closeDays(closed);

  return {
    cycle, organizationUnit: requestedOrg,
    dataAsOf: latestTime(notes, snapshots.map((snapshot) => snapshot.importedAt)),
    notesIssued: issued.length, notesClosed: closed.length, percentClosed: percent(closed.length, issued.length),
    medianDaysToClose: median(days), closedSampleSize: days.length,
    isFinal: cycle.dipaIssuedAt !== null || (cycle.adkDeadline !== null && Date.now() > cycle.adkDeadline),
    chrDocuments: chrs.filter((chr) => chr.issuedAt !== null).map((chr) => ({ documentNumber: chr.documentNumber, issuedAt: chr.issuedAt! })).sort((a, b) => a.issuedAt - b.issuedAt),
    notesByCategory: byCategory,
    dismissReasons: await dismissReasonCounts(db, documentIds),
    dismissedItems: await countDismissedItems(db, documentIds),
    flaggedItems: (await triageSummary(db, documentIds, undefined, null)).flaggedItems
  };
}

// ---------------------------------------------------------------- CSV

const BOM = "﻿";

/** Sel yang diawali `= + - @` (atau tab/CR) diberi awalan `'` supaya tidak dibaca sebagai rumus; lalu di-quote bila perlu (RFC 4180). */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(header: readonly string[], rows: (string | number | null | undefined)[][]): string {
  return BOM + [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

const isoDate = (at: number | null) => (at === null ? "" : new Date(at).toISOString().slice(0, 10));

/** Isi CSV. Hanya catatan terbit; scope sudah diterapkan lewat `orgIds`. */
export async function buildReportCsv(db: Db, cycle: ReviewCycleDto, orgIds: string[] | null, dataset: ReportCsvDataset): Promise<string> {
  const orgs = await loadCoverageOrgs(db, orgIds);
  const coveredIds = orgs.map((org) => org.id);
  const orgById = new Map(orgs.map((org) => [org.id, org]));
  const issued = coveredIds.length ? (await loadNotes(db, cycle.id, coveredIds)).filter(isIssued) : [];

  if (dataset === "ringkasan") {
    const rows: (string | number)[][] = [];
    for (const category of NOTE_CATEGORIES) rows.push(["kategori", category, issued.filter((note) => note.category === category).length]);
    for (const status of NOTE_STATUSES.filter((value) => value !== "draf")) rows.push(["status", status, issued.filter((note) => note.status === status).length]);
    const snapshots = coveredIds.length ? await latestSnapshotsInCycle(db, cycle.id, coveredIds) : [];
    for (const reason of await dismissReasonCounts(db, snapshots.map((snapshot) => snapshot.id))) rows.push(["alasan_dismiss", reason.code, reason.count]);
    return toCsv(REPORT_SUMMARY_CSV_COLUMNS, rows);
  }

  const checks = await latestChecksByNote(db, issued.map((note) => note.id));
  const now = Date.now();
  const sorted = [...issued].sort((a, b) => (a.chrNumber ?? "").localeCompare(b.chrNumber ?? "") || a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  return toCsv(REPORT_NOTES_CSV_COLUMNS, sorted.map((note) => {
    const org = orgById.get(note.organizationUnitId);
    const issuedAt = issuedAtOf(note);
    return [
      note.chrNumber, org?.code, org?.shortName, note.workUnitCode, note.workUnitName, note.accountCode, note.itemDescription ?? note.title, note.category, note.ruleCode,
      expectationCode(note.expectation), note.status, checks.get(note.id)?.result ?? "", isoDate(note.chrIssuedAt), isoDate(note.closedAt), daysBetween(issuedAt, note.closedAt ?? now)
    ];
  }));
}

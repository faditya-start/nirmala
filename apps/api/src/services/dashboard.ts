/** Dashboard (S2): satu bentuk data untuk reviewer, UKI, pimpinan, admin (docs/api-contract.md §6.1). */
import { and, count, eq, inArray } from "drizzle-orm";
import { NOTE_STATUSES, daysBetween, type DashboardActionCard, type DashboardOrganizationRow, type DashboardResponse, type NoteStatus, type ReviewCycleDto, type Role } from "@nirmala/shared";
import type { Db } from "../db/client.js";
import { chrDocuments, workUnits } from "../db/schema.js";
import { chrHref } from "../repositories/queues.js";
import { latestSnapshotsInCycle } from "../repositories/snapshots.js";
import { latestChecksByNote } from "../repositories/tracker.js";
import { resolveScoreConfigId, triageSummary } from "../repositories/triage.js";
import { loadCoverageOrgs } from "./coverage.js";
import { emptyCategoryCounts, isIssued, issuedAtOf, latestTime, loadNotes, percent, type NoteRecord } from "./noteMetrics.js";
import { calendarDaysUntil } from "../lib/calendar.js";


export async function buildDashboard(db: Db, cycle: ReviewCycleDto, role: Role, scope: string[] | null, orgIds: string[] | null): Promise<DashboardResponse> {
  const now = Date.now();
  const orgs = await loadCoverageOrgs(db, orgIds);
  const coveredIds = orgs.map((org) => org.id);
  const notes = coveredIds.length ? await loadNotes(db, cycle.id, coveredIds) : [];
  const issued = notes.filter(isIssued);
  const snapshots = coveredIds.length ? (await latestSnapshotsInCycle(db, cycle.id, coveredIds)) : [];
  const documentIds = snapshots.map((snapshot) => snapshot.id);

  const chrs = coveredIds.length ? await db.select().from(chrDocuments).where(and(eq(chrDocuments.cycleId, cycle.id), inArray(chrDocuments.organizationUnitId, coveredIds))) : [];
  const satkerCounts = new Map<string, number>();
  if (coveredIds.length) {
    for (const row of await db.select({ organizationUnitId: workUnits.organizationUnitId, total: count() }).from(workUnits).where(inArray(workUnits.organizationUnitId, coveredIds)).groupBy(workUnits.organizationUnitId)) satkerCounts.set(row.organizationUnitId, row.total);
  }

  const scoreConfigId = await resolveScoreConfigId(db, documentIds);
  const summary = await triageSummary(db, documentIds, undefined, scoreConfigId);

  // KPI Satker: siap diajukan = punya catatan terbit dan semuanya closed (§2.4).
  const byWorkUnit = new Map<string, NoteRecord[]>();
  for (const note of issued) if (note.workUnitId) byWorkUnit.set(note.workUnitId, [...(byWorkUnit.get(note.workUnitId) ?? []), note]);
  const satkerReady = [...byWorkUnit.values()].filter((list) => list.every((note) => note.status === "closed")).length;

  const notesByStatus = Object.fromEntries(NOTE_STATUSES.map((status) => [status, 0])) as Record<NoteStatus, number>;
  const notesByCategory = emptyCategoryCounts();
  for (const note of notes) { notesByStatus[note.status] += 1; notesByCategory[note.category] += 1; }

  const organizations: DashboardOrganizationRow[] = [];
  for (const org of orgs) {
    const snapshot = snapshots.find((entry) => entry.organizationUnitId === org.id) ?? null;
    const own = notes.filter((note) => note.organizationUnitId === org.id);
    const ownIssued = own.filter(isIssued);
    const closed = ownIssued.filter((note) => note.status === "closed").length;
    const chr = chrs.find((entry) => entry.organizationUnitId === org.id) ?? null;
    organizations.push({
      organizationUnitId: org.id, organizationUnitCode: org.code, organizationUnitName: org.shortName, satkerCount: satkerCounts.get(org.id) ?? 0,
      snapshot: snapshot ? { versionNo: snapshot.versionNo, label: snapshot.label } : null,
      itemsFlagged: snapshot ? (await triageSummary(db, [snapshot.id], undefined, null)).flaggedItems : null,
      notesOpen: snapshot ? ownIssued.length - closed : null,
      notesDraft: own.filter((note) => note.status === "draf").length, notesClosed: closed, notesIssued: ownIssued.length,
      percentClosed: percent(closed, ownIssued.length), chrStatus: chr?.status ?? null, chrDocumentNumber: chr?.documentNumber ?? null
    });
  }

  const actions = await buildActions(db, role, issued, chrs, notes);
  const adk = cycle.adkDeadline;
  return {
    cycle, scopeKind: scope === null ? "all" : "own",
    dataAsOf: latestTime(notes, snapshots.map((snapshot) => snapshot.importedAt)),
    organizationUnitNames: orgs.map((org) => org.shortName), snapshots: snapshots.map((snapshot) => ({ organizationUnitId: snapshot.organizationUnitId, organizationUnitName: snapshot.organizationUnitName, versionNo: snapshot.versionNo, label: snapshot.label })),
    kpis: {
      itemsAnalyzed: summary.analyzedItems, itemsFlagged: summary.flaggedItems, satkerReady, satkerWithNotes: byWorkUnit.size,
      satkerTotal: [...satkerCounts.values()].reduce((sum, total) => sum + total, 0),
      adkDeadline: adk, daysToAdkDeadline: adk === null ? null : calendarDaysUntil(adk, now)
    },
    notesByStatus, notesByCategory,
    chrDocumentNumbers: chrs.filter((chr) => chr.status !== "draft" && chr.documentNumber).sort((a, b) => (a.issuedAt ?? 0) - (b.issuedAt ?? 0)).map((chr) => chr.documentNumber!),
    actions, organizations
  };
}

/** Kartu "Perlu tindakan saya"; sumber hitungan sama dengan `/api/needs-action` (§2.9). Pimpinan tidak punya kartu. */
async function buildActions(db: Db, role: Role, issued: NoteRecord[], chrs: (typeof chrDocuments.$inferSelect)[], allNotes: NoteRecord[]): Promise<DashboardActionCard[]> {
  const now = Date.now();
  const cards: DashboardActionCard[] = [];
  const noteCard = async (kind: DashboardActionCard["kind"], list: NoteRecord[], href: string, since: (note: NoteRecord, checkedAt: number | null) => number) => {
    if (list.length === 0) return;
    const checks = await latestChecksByNote(db, list.map((note) => note.id));
    const ranked = list.map((note) => ({ note, at: since(note, checks.get(note.id)?.checkedAt ?? null) })).sort((a, b) => a.at - b.at || a.note.id.localeCompare(b.note.id));
    const oldest = ranked[0];
    cards.push({
      kind, count: list.length, href,
      oldestNote: { noteId: oldest.note.id, title: oldest.note.title ?? oldest.note.itemDescription ?? "", workUnitName: oldest.note.workUnitName, waitingDays: daysBetween(oldest.at, now), latestCheckResult: checks.get(oldest.note.id)?.result ?? null },
      lastIssuedChr: null
    });
  };
  const sinceStatusChange = (note: NoteRecord, checkedAt: number | null) => checkedAt ?? note.updatedAt;

  if (role === "reviewer" || role === "admin") {
    await noteCard("perlu_verifikasi", issued.filter((note) => note.status === "perlu_verifikasi"), "/tracker?status=perlu_verifikasi", sinceStatusChange);
    const noteCounts = new Map<string, number>();
    for (const note of allNotes) noteCounts.set(note.chrId, (noteCounts.get(note.chrId) ?? 0) + 1);
    const drafts = chrs.filter((chr) => chr.status === "draft" && (noteCounts.get(chr.id) ?? 0) > 0).map((chr) => chr.id);
    const lastIssued = chrs.filter((chr) => chr.status !== "draft" && chr.issuedAt !== null).sort((a, b) => b.issuedAt! - a.issuedAt!)[0] ?? null;
    cards.push({ kind: "chr_draf", count: drafts.length, href: chrHref(drafts), oldestNote: null, lastIssuedChr: lastIssued ? { documentNumber: lastIssued.documentNumber, issuedAt: lastIssued.issuedAt! } : null });
  } else if (role === "uki") {
    await noteCard("menunggu_revisi", issued.filter((note) => note.status === "menunggu_revisi"), "/tracker?status=menunggu_revisi", (note) => issuedAtOf(note));
    const verifying = issued.filter((note) => note.status === "perlu_verifikasi");
    const checks = await latestChecksByNote(db, verifying.map((note) => note.id));
    await noteCard("belum_terpenuhi", verifying.filter((note) => checks.get(note.id)?.result !== "terpenuhi"), "/tracker?status=perlu_verifikasi", sinceStatusChange);
    const missing = chrs.filter((chr) => chr.status !== "draft" && !chr.unitResponse);
    if (missing.length) cards.push({ kind: "tanggapan_belum_diisi", count: missing.length, href: chrHref(missing.map((chr) => chr.id)), oldestNote: null, lastIssuedChr: null });
  }
  return cards;
}

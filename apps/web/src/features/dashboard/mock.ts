/** Mock for S2 (VITE_MOCK=1). Snapshots come from the impor mock store, so importing a CSV changes the dashboard. */
import type { DashboardActionCard, DashboardOrganizationRow, DashboardResponse, NoteCategory, Role } from "@nirmala/shared";
import { ApiError } from "../../lib/api-error";
import { registerMock } from "../../lib/mock";
import { ORGS, currentRole, dashboardScope, getCycles, snapshotsFor } from "../impor/mock-store";

interface OrgNotes {
  draf: number;
  menunggu: number;
  verif: number;
  justif: number;
  closed: number;
  chr: "draft" | "issued" | null;
  chrNo: string | null;
  flagged: number | null;
  categories: Partial<Record<NoteCategory, number>>;
}

/** Synthetic note counts per eselon I (the dashboard numbers of the designs). */
const NOTES: Record<string, OrgNotes> = {
  "org-a": { draf: 0, menunggu: 0, verif: 1, justif: 0, closed: 2, chr: "issued", chrNo: "014/CHR/2026", flagged: 108, categories: { AKUN: 2, EFISIENSI: 1 } },
  "org-b": { draf: 4, menunggu: 0, verif: 0, justif: 0, closed: 0, chr: "draft", chrNo: null, flagged: 71, categories: { AKUN: 1, EFISIENSI: 2, SATUAN_BIAYA: 1 } },
  "org-c": { draf: 0, menunggu: 0, verif: 0, justif: 0, closed: 0, chr: null, chrNo: null, flagged: null, categories: {} }
};

function actionsFor(role: Role): DashboardActionCard[] {
  const issued = new Date(2026, 10, 4, 10, 0).getTime();
  const verif: DashboardActionCard = {
    kind: "perlu_verifikasi",
    count: 1,
    href: "/tracker",
    oldestNote: { noteId: "note-2", title: "Outsourcing jasa kebersihan", workUnitName: "Satker Contoh 02", waitingDays: 5, latestCheckResult: "belum_terpenuhi" },
    lastIssuedChr: null
  };
  const chr: DashboardActionCard = { kind: "chr_draf", count: 0, href: "/chr", oldestNote: null, lastIssuedChr: { documentNumber: "014/CHR/2026", issuedAt: issued } };
  if (role === "uki") {
    return [
      {
        kind: "menunggu_revisi",
        count: 2,
        href: "/tracker",
        oldestNote: { noteId: "note-4", title: "Pengadaan seragam pegawai", workUnitName: "Satker Contoh 01", waitingDays: 3, latestCheckResult: null },
        lastIssuedChr: null
      }
    ];
  }
  if (role === "leader") return [];
  return [verif, chr];
}

registerMock("GET", "/dashboard", async ({ query }) => {
  const role = await currentRole();
  const cycle = (await getCycles()).find((c) => c.id === query.cycleId);
  if (!cycle) throw new ApiError(404, "Siklus tidak ditemukan.");
  const scope = dashboardScope(role);
  if (query.organizationUnitId && !scope.includes(query.organizationUnitId)) throw new ApiError(403, "Anda tidak memiliki akses ke eselon I ini.");
  const orgs = ORGS.filter((o) => scope.includes(o.id) && (!query.organizationUnitId || o.id === query.organizationUnitId));

  const rows: DashboardOrganizationRow[] = orgs.map((org) => {
    const latest = snapshotsFor(cycle.id, org.id).at(-1)?.dto ?? null;
    const n = NOTES[org.id];
    const issued = n.menunggu + n.verif + n.justif + n.closed;
    return {
      organizationUnitId: org.id,
      organizationUnitCode: org.code,
      organizationUnitName: org.shortName,
      satkerCount: org.satkerCount,
      snapshot: latest ? { versionNo: latest.versionNo, label: latest.label } : null,
      itemsFlagged: latest ? (n.flagged ?? Math.round(latest.rowCount * 0.008)) : null,
      notesOpen: latest ? n.menunggu + n.verif + n.justif : null,
      notesDraft: n.draf,
      notesClosed: n.closed,
      notesIssued: issued,
      percentClosed: issued > 0 ? Math.round((n.closed / issued) * 100) : null,
      chrStatus: n.chr,
      chrDocumentNumber: n.chrNo
    };
  });

  const snapshots = orgs.flatMap((org) => {
    const latest = snapshotsFor(cycle.id, org.id).at(-1)?.dto;
    return latest ? [{ organizationUnitId: org.id, organizationUnitName: org.shortName, versionNo: latest.versionNo, label: latest.label }] : [];
  });

  const sum = (pick: (n: OrgNotes) => number) => orgs.reduce((total, org) => total + pick(NOTES[org.id]), 0);
  const categories: Record<NoteCategory, number> = { EFISIENSI: 0, SATUAN_BIAYA: 0, AKUN: 0, LAINNYA: 0 };
  for (const org of orgs) for (const [key, value] of Object.entries(NOTES[org.id].categories)) categories[key as NoteCategory] += value ?? 0;

  const itemsAnalyzed = snapshots.reduce((total, s) => total + (snapshotsFor(cycle.id, s.organizationUnitId).at(-1)?.dto.rowCount ?? 0), 0);
  const adk = cycle.adkDeadline;
  const response: DashboardResponse = {
    cycle,
    scopeKind: scope.length === ORGS.length ? "all" : "own",
    dataAsOf: snapshots.length > 0 ? Math.max(...orgs.map((o) => snapshotsFor(cycle.id, o.id).at(-1)?.dto.importedAt ?? 0)) : null,
    organizationUnitNames: orgs.map((o) => o.shortName),
    snapshots,
    kpis: {
      itemsAnalyzed,
      itemsFlagged: rows.reduce((total, r) => total + (r.itemsFlagged ?? 0), 0),
      satkerReady: snapshots.length > 0 ? 2 : 0,
      satkerWithNotes: snapshots.length > 0 ? 3 : 0,
      satkerTotal: orgs.reduce((total, o) => total + o.satkerCount, 0),
      adkDeadline: adk,
      daysToAdkDeadline: adk === null ? null : Math.round((new Date(adk).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86_400_000)
    },
    notesByStatus: {
      draf: sum((n) => n.draf),
      menunggu_revisi: sum((n) => n.menunggu),
      perlu_verifikasi: sum((n) => n.verif),
      dijustifikasi: sum((n) => n.justif),
      closed: sum((n) => n.closed)
    },
    notesByCategory: categories,
    chrDocumentNumbers: orgs.flatMap((o) => (NOTES[o.id].chrNo ? [NOTES[o.id].chrNo as string] : [])),
    actions: actionsFor(role),
    organizations: rows
  };
  return response;
});
